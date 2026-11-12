"""Database side of the live game loop in docs/WEBSOCKET_PROTOCOL.md sections 3 to 5.

Scores and ranks come from app.services.scoring, which follows docs/SCORING.md.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.entities import Answer, Participant, Question, QuizSession
from app.services.scoring import compute_leaderboard

logger = logging.getLogger(__name__)

LEADERBOARD_SIZE = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def start_session(db: Session, session_id: int) -> list[dict]:
    """Mark the session running and return its questions in id order."""
    session = db.get(QuizSession, session_id)
    questions = db.scalars(
        select(Question)
        .options(selectinload(Question.source_page))
        .where(Question.quiz_id == session.quiz_id)
        .order_by(Question.id)
    ).all()
    session.status = "running"
    session.started_at = _now()
    db.commit()
    logger.info("Session %s started with %s questions", session_id, len(questions))
    return [
        {
            "question_id": question.id,
            "text": question.text,
            "options": list(question.options),
            "correct_index": question.correct_index,
            "time_limit_ms": question.time_limit * 1000,
            "source": _source(question),
        }
        for question in questions
    ]


def _source(question: Question) -> dict | None:
    if question.source_page is not None:
        return {"page_number": question.source_page.page_number, "snippet": question.source_snippet}
    if question.source_snippet:
        return {"page_number": None, "snippet": question.source_snippet}
    return None


def save_answer(
    db: Session,
    session_id: int,
    question_id: int,
    participant_id: int,
    chosen_index: int,
    is_correct: bool,
    answer_ms: int,
    points: int,
) -> None:
    db.add(Answer(
        session_id=session_id,
        question_id=question_id,
        participant_id=participant_id,
        chosen_index=chosen_index,
        is_correct=is_correct,
        answer_ms=answer_ms,
        points=points,
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.info("Skipped a second answer from %s to question %s", participant_id, question_id)


def close_question(db: Session, session_id: int, question_id: int) -> int:
    """Write a 0 point row for every seat that did not answer. Returns the seat count."""
    seat_ids = db.scalars(select(Participant.id).where(Participant.session_id == session_id)).all()
    answered = set(db.scalars(
        select(Answer.participant_id).where(
            Answer.session_id == session_id,
            Answer.question_id == question_id,
        )
    ))
    for participant_id in seat_ids:
        if participant_id not in answered:
            db.add(Answer(
                session_id=session_id,
                question_id=question_id,
                participant_id=participant_id,
                points=0,
            ))
    db.commit()
    return len(seat_ids)


def standings(db: Session, session_id: int) -> list[dict]:
    """Every participant ranked by total points, ties broken by average answer time."""
    rows = db.execute(
        select(
            Participant.id,
            Participant.display_name,
            func.coalesce(func.sum(Answer.points), 0),
            func.coalesce(func.sum(Answer.answer_ms), 0),
            func.count(Answer.chosen_index),
        )
        .outerjoin(Answer, Answer.participant_id == Participant.id)
        .where(Participant.session_id == session_id)
        .group_by(Participant.id, Participant.display_name)
    ).all()
    return compute_leaderboard([
        {
            "participant_id": participant_id,
            "display_name": name,
            "total_score": int(total),
            "total_answer_ms": int(answer_ms),
            "questions_answered": answered,
        }
        for participant_id, name, total, answer_ms, answered in rows
    ])


def participant_score(db: Session, participant_id: int) -> int:
    total = db.scalar(select(func.sum(Answer.points)).where(Answer.participant_id == participant_id))
    return int(total or 0)


def end_session(db: Session, session_id: int) -> None:
    session = db.get(QuizSession, session_id)
    session.status = "ended"
    session.ended_at = _now()
    db.commit()
    logger.info("Session %s ended", session_id)
