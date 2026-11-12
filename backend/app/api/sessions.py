from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.models.entities import Quiz, QuizSession
from app.schemas.sessions import SessionResponse
from app.services import session_service

router = APIRouter()


def _to_response(session: QuizSession, quiz: Quiz) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        quiz_id=quiz.id,
        quiz_title=quiz.title,
        join_code=session.join_code,
        status=session.status,
    )


@router.post(
    "/quizzes/{quiz_id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def publish_quiz(
    quiz_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> SessionResponse:
    try:
        session, quiz = session_service.publish_quiz(db, host_id, quiz_id)
    except session_service.QuizNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found.",
        ) from exc
    except session_service.QuizHasNoQuestionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Add at least 1 question before publishing.",
        ) from exc
    except session_service.JoinCodeUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No free room code was found. Try again.",
        ) from exc

    return _to_response(session, quiz)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: int,
    host_id: int = Depends(current_host_id),
    db: Session = Depends(get_db),
) -> SessionResponse:
    session = session_service.get_host_session(db, host_id, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )
    return _to_response(session, session.quiz)
