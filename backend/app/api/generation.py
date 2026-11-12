import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.schemas.questions import QuestionResponse
from app.services import ai, generation_service
from app.services.uplode import validate_pdf_upload

router = APIRouter()


class GenerationResponse(BaseModel):
    material_id: int
    page_count: int
    pages_used: int
    requested: int
    questions: list[QuestionResponse]


def _write_temp_pdf(content: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(content)
        return handle.name


def _check_count(count: int) -> int:
    try:
        return ai.validate_question_count_request(count)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Ask for {ai.AI_MIN_QUESTIONS} to {ai.AI_MAX_QUESTIONS} questions.",
        ) from exc


@router.post("/quizzes/{quiz_id}/generate", response_model=GenerationResponse)
async def generate_questions(
    quiz_id: int,
    file: UploadFile = File(...),
    count: int = Form(default=ai.AI_MIN_QUESTIONS),
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> GenerationResponse:
    count = _check_count(count)
    await validate_pdf_upload(file)
    pdf_path = _write_temp_pdf(await file.read())

    try:
        result = await run_in_threadpool(
            generation_service.generate_from_pdf,
            db,
            host_id,
            quiz_id,
            file.filename or "upload.pdf",
            pdf_path,
            count,
        )
    except generation_service.QuizNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found.") from exc
    except generation_service.NoReadableTextError as exc:
        raise HTTPException(
            status_code=422,
            detail="No text was found in this PDF. Scanned pages cannot be read, use a text based PDF.",
        ) from exc
    except generation_service.AIProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The question generator did not respond. Check that the AI provider is running, then try again.",
        ) from exc
    except generation_service.NoValidQuestionsError as exc:
        raise HTTPException(
            status_code=422,
            detail="No generated question passed the checks. Try again or write the questions yourself.",
        ) from exc
    finally:
        os.remove(pdf_path)

    return GenerationResponse(
        material_id=result.material_id,
        page_count=result.page_count,
        pages_used=result.pages_used,
        requested=count,
        questions=[
            QuestionResponse(
                id=question.id,
                quiz_id=question.quiz_id,
                text=question.text,
                options=question.options,
                correct_index=question.correct_index,
                time_limit=question.time_limit,
                source_snippet=question.source_snippet,
                source_page_id=question.source_page_id,
                source_material_id=result.material_id,
                source_file_name=file.filename or "upload.pdf",
                origin=question.origin,
            )
            for question in result.questions
        ],
    )
