from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.schemas.questions import QuestionResponse
from app.schemas.quizzes import (
    QuizCreate,
    QuizDetailResponse,
    QuizListItem,
)
from app.services import quiz_service
from app.services.quiz_service import QuizHasSessionsError

router = APIRouter()


@router.get("", response_model=list[QuizListItem])
def list_quizzes(
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> list[QuizListItem]:
    quizzes = quiz_service.list_quizzes(db, host_id)
    return [
        QuizListItem(
            id=quiz.id,
            title=quiz.title,
            created_at=quiz.created_at,
            question_count=question_count,
        )
        for quiz, question_count in quizzes
    ]


@router.get("/{quiz_id}", response_model=QuizDetailResponse, response_model_exclude_none=True)
def get_quiz(
    quiz_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> QuizDetailResponse:
    quiz = quiz_service.get_quiz(db, host_id, quiz_id)
    if quiz is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        )

    return QuizDetailResponse(
        id=quiz.id,
        title=quiz.title,
        created_at=quiz.created_at,
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
                source_page_number=(
                    question.source_page.page_number if question.source_page else None
                ),
                source_material_id=(
                    question.source_page.material_id if question.source_page else None
                ),
                source_file_name=(
                    question.source_page.material.file_name if question.source_page else None
                ),
                origin=question.origin,
            )
            for question in quiz.questions
        ],
    )


@router.post("", response_model=QuizListItem, status_code=status.HTTP_201_CREATED)
def create_quiz(
    payload: QuizCreate,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> QuizListItem:
    quiz = quiz_service.create_quiz(db, host_id, payload.title)
    return QuizListItem(
        id=quiz.id,
        title=quiz.title,
        created_at=quiz.created_at,
        question_count=0,
    )


@router.delete("/{quiz_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    quiz_id: int,
    question_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> Response:
    try:
        deleted = quiz_service.delete_question(db, host_id, quiz_id, question_id)
    except QuizHasSessionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questions cannot be removed after the quiz has been played.",
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(
    quiz_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> Response:
    try:
        deleted = quiz_service.delete_quiz(db, host_id, quiz_id)
    except QuizHasSessionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quiz cannot be deleted because it has associated sessions.",
        ) from exc

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)