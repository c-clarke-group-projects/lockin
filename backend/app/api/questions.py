from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.schemas.questions import QuestionManualCreate, QuestionResponse
from app.services import question_service

router = APIRouter()


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
