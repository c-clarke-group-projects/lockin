from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.schemas.csv_import import CsvImportResponse
from app.schemas.questions import QuestionManualCreate, QuestionResponse
from app.services import csv_import, question_service

router = APIRouter()


@router.get("/template/csv", response_class=Response)
@router.get("/template", response_class=Response)
def get_csv_template() -> Response:
    return Response(
        content=csv_import.CSV_TEMPLATE,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=questions_template.csv"
        },
    )


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_manual_question(
    payload: QuestionManualCreate,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    if payload.quiz_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
            if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT")
            else 422,
            detail="quiz_id is required.",
        )

    try:
        question = question_service.add_manual_question(
            db=db,
            host_id=host_id,
            quiz_id=payload.quiz_id,
            payload=payload,
        )
    except question_service.QuizNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        ) from exc

    return QuestionResponse(
        id=question.id,
        quiz_id=question.quiz_id,
        text=question.text,
        options=question.options,
        correct_index=question.correct_index,
        time_limit=question.time_limit,
        source_snippet=question.source_snippet,
        source_note=question.source_snippet,
        source_page_id=question.source_page_id,
        origin=question.origin,
    )


@router.post(
    "/import-csv",
    response_model=CsvImportResponse,
    status_code=status.HTTP_200_OK,
)
async def import_questions_csv(
    quiz_id: int = Form(...),
    file: UploadFile = File(...),
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> CsvImportResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only CSV files are allowed.",
        )

    content_bytes = await file.read(5 * 1024 * 1024 + 1)
    if len(content_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum allowed size is 5 MB.",
        )

    try:
        csv_text = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            csv_text = content_bytes.decode("latin-1")
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not decode CSV file as UTF-8 or Latin-1.",
            ) from exc

    if not csv_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty.",
        )

    try:
        return csv_import.import_questions_from_csv(
            db=db,
            host_id=host_id,
            quiz_id=quiz_id,
            csv_content=csv_text,
        )
    except question_service.QuizNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        ) from exc
    except csv_import.InvalidCsvHeaderError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except csv_import.EmptyCsvError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(
    question_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    question = question_service.get_question(db, host_id, question_id)
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found.",
        )

    return QuestionResponse(
        id=question.id,
        quiz_id=question.quiz_id,
        text=question.text,
        options=question.options,
        correct_index=question.correct_index,
        time_limit=question.time_limit,
        source_snippet=question.source_snippet,
        source_note=question.source_snippet,
        source_page_id=question.source_page_id,
        origin=question.origin,
    )
