from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.schemas.questions import QuestionManualCreate, QuestionResponse
from app.schemas.quizzes import (
    QuizCreate,
    QuizDetailResponse,
    QuizListItem,
)
from app.services import question_service, quiz_service
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


@router.get("/{quiz_id}", response_model=QuizDetailResponse)
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
                source_note=question.source_snippet,
                source_page_id=question.source_page_id,
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


@router.post(
    "/{quiz_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_question_to_quiz(
    quiz_id: int,
    payload: QuestionManualCreate,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    payload.quiz_id = quiz_id
    try:
        question = question_service.add_manual_question(
            db=db,
            host_id=host_id,
            quiz_id=quiz_id,
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


@router.get("/{quiz_id}/questions", response_model=list[QuestionResponse])
def list_quiz_questions(
    quiz_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> list[QuestionResponse]:
    try:
        questions = question_service.list_questions(db, host_id, quiz_id)
    except question_service.QuizNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        ) from exc

    return [
        QuestionResponse(
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
        for question in questions
    ]
