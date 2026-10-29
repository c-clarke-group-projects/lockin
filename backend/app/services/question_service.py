import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Question, Quiz
from app.schemas.questions import QuestionManualCreate

logger = logging.getLogger(__name__)


class QuizNotFoundError(Exception):
    pass


def add_manual_question(
    db: Session,
    host_id: int,
    quiz_id: int,
    payload: QuestionManualCreate,
) -> Question:
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

    source_snippet = payload.source_snippet or payload.source_note

    question = Question(
        quiz_id=quiz_id,
        text=payload.text,
        options=payload.options,
        correct_index=payload.correct_index,
        time_limit=payload.time_limit,
        source_page_id=payload.source_page_id,
        source_snippet=source_snippet,
        origin="manual",
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    logger.info(
        "Added manual question %s to quiz %s by host %s",
        question.id,
        quiz_id,
        host_id,
    )
    return question


def get_question(
    db: Session,
    host_id: int,
    question_id: int,
) -> Question | None:
    statement = (
        select(Question)
        .join(Quiz, Question.quiz_id == Quiz.id)
        .where(Question.id == question_id, Quiz.host_id == host_id)
    )
    return db.scalar(statement)


def list_questions(
    db: Session,
    host_id: int,
    quiz_id: int,
) -> list[Question]:
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

    statement = (
        select(Question)
        .where(Question.quiz_id == quiz_id)
        .order_by(Question.id)
    )
    return list(db.scalars(statement).all())

