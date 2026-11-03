from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.entities import Question, Quiz, QuizSession


class QuizHasSessionsError(Exception):
    pass


def list_quizzes(db: Session, host_id: int) -> list[tuple[Quiz, int]]:
    statement = (
        select(Quiz, func.count(Question.id).label("question_count"))
        .outerjoin(Question, Question.quiz_id == Quiz.id)
        .where(Quiz.host_id == host_id)
        .group_by(Quiz.id)
        .order_by(Quiz.created_at.desc(), Quiz.id.desc())
    )
    return list(db.execute(statement).all())


def get_quiz(db: Session, host_id: int, quiz_id: int) -> Quiz | None:
    statement = (
        select(Quiz)
        .options(selectinload(Quiz.questions))
        .where(Quiz.id == quiz_id, Quiz.host_id == host_id)
    )
    return db.scalar(statement)


def create_quiz(db: Session, host_id: int, title: str) -> Quiz:
    quiz = Quiz(host_id=host_id, title=title)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


def delete_quiz(db: Session, host_id: int, quiz_id: int) -> bool:
    quiz = db.scalar(
        select(Quiz).where(Quiz.id == quiz_id, Quiz.host_id == host_id)
    )
    if quiz is None:
        return False

    existing_session_id = db.scalar(
        select(QuizSession.id).where(QuizSession.quiz_id == quiz_id).limit(1)
    )
    if existing_session_id is not None:
        raise QuizHasSessionsError

    db.execute(delete(Question).where(Question.quiz_id == quiz_id))
    db.delete(quiz)
    db.commit()
    return True
