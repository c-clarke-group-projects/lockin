import csv
import io
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Question, Quiz
from app.schemas.csv_import import CsvImportResponse, CsvRejectedRow
from app.schemas.questions import QuestionResponse
from app.services.question_service import QuizNotFoundError

logger = logging.getLogger(__name__)

CSV_TEMPLATE_HEADER = (
    "question,option_1,option_2,option_3,option_4,correct_answer,time_limit,source_note"
)
SAMPLE_ROW = (
    "What is the capital of France?,London,Paris,Berlin,Madrid,2,30,Geography textbook"
)
CSV_TEMPLATE = f"{CSV_TEMPLATE_HEADER}\n{SAMPLE_ROW}\n"

REQUIRED_FIELDS = [
    "question",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "correct_answer",
]

HEADER_ALIASES = {
    "question": "question",
    "question_text": "question",
    "text": "question",
    "option_1": "option_1",
    "option1": "option_1",
    "option_2": "option_2",
    "option2": "option_2",
    "option_3": "option_3",
    "option3": "option_3",
    "option_4": "option_4",
    "option4": "option_4",
    "correct_answer": "correct_answer",
    "correct_index": "correct_answer",
    "answer": "correct_answer",
    "time_limit": "time_limit",
    "timelimit": "time_limit",
    "time": "time_limit",
    "source_note": "source_note",
    "source_snippet": "source_note",
    "source": "source_note",
}


class InvalidCsvHeaderError(Exception):
    pass


class EmptyCsvError(Exception):
    pass


def parse_and_validate_row(
    row_data: dict[str, str],
    row_number: int,
) -> tuple[dict[str, Any] | None, str | None]:
    question_text = row_data.get("question", "").strip()
    if not question_text:
        return None, "Question text is required."

    options = [
        row_data.get("option_1", "").strip(),
        row_data.get("option_2", "").strip(),
        row_data.get("option_3", "").strip(),
        row_data.get("option_4", "").strip(),
    ]

    empty_options = [f"option {i + 1}" for i, opt in enumerate(options) if not opt]
    if empty_options:
        return None, f"All 4 options must be non-empty (missing: {', '.join(empty_options)})."

    lowered_options = [opt.lower() for opt in options]
    if len(set(lowered_options)) != 4:
        return None, "All 4 options must be distinct."

    raw_answer = row_data.get("correct_answer", "").strip()
    if not raw_answer:
        return None, "Correct answer is required."

    correct_index: int | None = None
    letter_map = {"a": 0, "b": 1, "c": 2, "d": 3}

    if raw_answer.lower() in letter_map:
        correct_index = letter_map[raw_answer.lower()]
    elif raw_answer.isdigit():
        idx = int(raw_answer)
        if 1 <= idx <= 4:
            correct_index = idx - 1
        elif idx == 0:
            correct_index = 0
        else:
            return None, "Correct answer index must be between 1 and 4."
    else:
        for i, opt in enumerate(options):
            if opt.lower() == raw_answer.lower():
                correct_index = i
                break
        if correct_index is None:
            return (
                None,
                f"Correct answer '{raw_answer}' does not match any of the 4 options or index 1 to 4.",
            )

    raw_time = row_data.get("time_limit", "").strip()
    time_limit = 30
    if raw_time:
        try:
            time_limit = int(raw_time)
            if time_limit <= 0:
                return None, "Time limit must be an integer greater than 0."
        except ValueError:
            return None, "Time limit must be an integer."

    source_note = row_data.get("source_note", "").strip() or None

    return {
        "text": question_text,
        "options": options,
        "correct_index": correct_index,
        "time_limit": time_limit,
        "source_snippet": source_note,
        "origin": "manual",
    }, None


def parse_csv_content(
    csv_text: str,
) -> tuple[list[dict[str, Any]], list[CsvRejectedRow]]:
    cleaned = csv_text.strip()
    if not cleaned:
        raise EmptyCsvError("CSV file is empty.")

    f = io.StringIO(cleaned)
    reader = csv.reader(f)

    try:
        raw_headers = next(reader)
    except StopIteration:
        raise EmptyCsvError("CSV file is empty.") from None

    cleaned_headers = [h.strip().lower() for h in raw_headers if h is not None]
    header_map: dict[str, int] = {}
    for idx, header in enumerate(cleaned_headers):
        normalized = HEADER_ALIASES.get(header)
        if normalized and normalized not in header_map:
            header_map[normalized] = idx

    missing = [req for req in REQUIRED_FIELDS if req not in header_map]
    if missing:
        raise InvalidCsvHeaderError(
            f"Invalid CSV headers. Missing required headers: {', '.join(missing)}."
        )

    valid_rows: list[dict[str, Any]] = []
    rejected_rows: list[CsvRejectedRow] = []

    for line_idx, row in enumerate(reader, start=2):
        if not row or not any(cell.strip() for cell in row):
            continue

        row_dict: dict[str, str] = {}
        for canon, col_idx in header_map.items():
            row_dict[canon] = row[col_idx] if col_idx < len(row) else ""

        parsed, error_reason = parse_and_validate_row(row_dict, line_idx)
        if error_reason:
            raw_display = {
                raw_headers[i].strip(): (row[i].strip() if i < len(row) else "")
                for i in range(min(len(raw_headers), len(row)))
            }
            rejected_rows.append(
                CsvRejectedRow(
                    row_number=line_idx,
                    reason=error_reason,
                    row_data=raw_display,
                )
            )
        else:
            assert parsed is not None
            valid_rows.append(parsed)

    return valid_rows, rejected_rows


def import_questions_from_csv(
    db: Session,
    host_id: int,
    quiz_id: int,
    csv_content: str,
) -> CsvImportResponse:
    quiz = db.scalar(
        select(Quiz).where(Quiz.id == quiz_id, Quiz.host_id == host_id)
    )
    if quiz is None:
        logger.warning(
            "Quiz %s not found or not owned by host %s",
            quiz_id,
            host_id,
        )
        raise QuizNotFoundError(f"Quiz {quiz_id} not found.")

    valid_rows, rejected_rows = parse_csv_content(csv_content)

    created_questions: list[Question] = []
    for row in valid_rows:
        question = Question(
            quiz_id=quiz_id,
            text=row["text"],
            options=row["options"],
            correct_index=row["correct_index"],
            time_limit=row["time_limit"],
            source_snippet=row["source_snippet"],
            source_page_id=None,
            origin="manual",
        )
        db.add(question)
        created_questions.append(question)

    if created_questions:
        db.commit()
        for q in created_questions:
            db.refresh(q)

    logger.info(
        "Imported %d questions, rejected %d rows for quiz %d by host %d",
        len(created_questions),
        len(rejected_rows),
        quiz_id,
        host_id,
    )

    imported_dtos = [
        QuestionResponse(
            id=q.id,
            quiz_id=q.quiz_id,
            text=q.text,
            options=q.options,
            correct_index=q.correct_index,
            time_limit=q.time_limit,
            source_snippet=q.source_snippet,
            source_note=q.source_snippet,
            source_page_id=q.source_page_id,
            origin=q.origin,
        )
        for q in created_questions
    ]

    return CsvImportResponse(
        imported_count=len(imported_dtos),
        rejected_count=len(rejected_rows),
        imported_questions=imported_dtos,
        rejected_rows=rejected_rows,
    )

