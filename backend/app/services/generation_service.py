import logging
import math
import os
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Material, MaterialPage, Question, Quiz
from app.services import ai
from app.services.ai_validation import parse_and_validate_ai_response
from app.services.pdf import extract_text_by_page

logger = logging.getLogger(__name__)

DEFAULT_TIME_LIMIT_SECONDS = int(os.getenv("QUESTION_TIME_LIMIT_SECONDS", "20"))
MAX_EXTRA_PAGE_CALLS = 2
MAX_PAGE_CALLS = 6


class QuizNotFoundError(Exception):
    pass


class NoReadableTextError(Exception):
    pass


class AIProviderError(Exception):
    pass


class NoValidQuestionsError(Exception):
    pass


@dataclass
class GenerationResult:
    material_id: int
    page_count: int
    pages_used: int
    questions: list[Question] = field(default_factory=list)


def _save_material(db: Session, host_id: int, file_name: str, pages: list[dict]) -> Material:
    material = Material(host_id=host_id, file_name=file_name, page_count=len(pages))
    material.pages = [
        MaterialPage(page_number=page["page_number"], text=page["text"]) for page in pages
    ]
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


def _is_complete(question: dict) -> bool:
    text = question.get("text")
    options = question.get("options") or []
    return (
        isinstance(text, str)
        and bool(text.strip())
        and all(isinstance(option, str) and option.strip() for option in options)
    )


def _ask_for_page(page: MaterialPage, wanted: int) -> list[dict]:
    count = min(max(wanted, ai.AI_MIN_QUESTIONS), ai.AI_MAX_QUESTIONS)
    prompt = ai.build_generation_prompt(page.text, page.page_number, count)
    try:
        raw = ai.call_ai_provider_with_retry(prompt)
    except Exception as exc:
        logger.error(
            "AI provider %s failed for page %s after retries: %s",
            ai.AI_PROVIDER,
            page.page_number,
            exc,
        )
        raise AIProviderError from exc

    valid = [q for q in parse_and_validate_ai_response(raw, page.text) if _is_complete(q)]
    logger.info(
        "Page %s: asked for %s questions, %s passed validation",
        page.page_number,
        count,
        len(valid),
    )
    return valid


def _to_question(quiz_id: int, page: MaterialPage, item: dict) -> Question:
    return Question(
        quiz_id=quiz_id,
        text=item["text"].strip(),
        options=[option.strip() for option in item["options"]],
        correct_index=item["correct_index"],
        time_limit=DEFAULT_TIME_LIMIT_SECONDS,
        source_page_id=page.id,
        source_snippet=item["source_snippet"].strip(),
        origin="ai",
    )


def generate_from_pdf(
    db: Session,
    host_id: int,
    quiz_id: int,
    file_name: str,
    pdf_path: str,
    count: int,
) -> GenerationResult:
    """Store the PDF's page text, then ask the AI provider for questions page by page.

    Only page text is sent to the provider. Each saved question keeps its page and
    a snippet that was checked against that page's text.
    """
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.host_id == host_id))
    if quiz is None:
        raise QuizNotFoundError

    pages = extract_text_by_page(pdf_path)
    if not any(page["text"] for page in pages):
        logger.warning("No readable text in %s (%s pages)", file_name, len(pages))
        raise NoReadableTextError

    material = _save_material(db, host_id, file_name, pages)
    text_pages = [page for page in material.pages if page.text]
    max_calls = min(math.ceil(count / ai.AI_MIN_QUESTIONS) + MAX_EXTRA_PAGE_CALLS, MAX_PAGE_CALLS)

    created: list[Question] = []
    pages_used = 0
    for page in text_pages[:max_calls]:
        remaining = count - len(created)
        if remaining <= 0:
            break
        pages_used += 1
        for item in _ask_for_page(page, remaining)[:remaining]:
            created.append(_to_question(quiz_id, page, item))

    skipped = len(text_pages) - pages_used
    if skipped:
        logger.info("Skipped %s text pages of %s, enough questions or call limit", skipped, file_name)

    if not created:
        raise NoValidQuestionsError

    db.add_all(created)
    db.commit()
    for question in created:
        db.refresh(question)

    logger.info(
        "Generated %s of %s questions for quiz %s from %s",
        len(created),
        count,
        quiz_id,
        file_name,
    )
    return GenerationResult(
        material_id=material.id,
        page_count=len(pages),
        pages_used=pages_used,
        questions=created,
    )
