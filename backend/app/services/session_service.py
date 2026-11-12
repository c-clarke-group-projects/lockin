import logging
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Question, Quiz, QuizSession

logger = logging.getLogger(__name__)

JOIN_CODE_LENGTH = 6
MAX_CODE_ATTEMPTS = 20
OPEN_STATUSES = ("waiting", "running")


class QuizNotFoundError(Exception):
    pass


class QuizHasNoQuestionsError(Exception):
    pass


class JoinCodeUnavailableError(Exception):
    pass


def _random_join_code() -> str:
    return f"{secrets.randbelow(10 ** JOIN_CODE_LENGTH):0{JOIN_CODE_LENGTH}d}"


def _code_in_use(db: Session, join_code: str) -> bool:
    statement = select(QuizSession.id).where(
        QuizSession.join_code == join_code,
        QuizSession.status.in_(OPEN_STATUSES),
    )
    return db.scalar(statement.limit(1)) is not None


def _new_join_code(db: Session) -> str:
    for attempt in range(1, MAX_CODE_ATTEMPTS + 1):
        join_code = _random_join_code()
        if not _code_in_use(db, join_code):
            return join_code
        logger.info("Join code clash on attempt %s, trying again", attempt)
    raise JoinCodeUnavailableError


def publish_quiz(db: Session, host_id: int, quiz_id: int) -> tuple[QuizSession, Quiz]:
    """Open a waiting room for a quiz, or return the one already waiting."""
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.host_id == host_id))
    if quiz is None:
        raise QuizNotFoundError

    question_count = db.scalar(
        select(func.count(Question.id)).where(Question.quiz_id == quiz_id)
    )
    if not question_count:
        raise QuizHasNoQuestionsError

    waiting = db.scalar(
        select(QuizSession).where(
            QuizSession.quiz_id == quiz_id,
            QuizSession.status == "waiting",
        )
    )
    if waiting is not None:
        logger.info("Quiz %s already has waiting session %s", quiz_id, waiting.id)
        return waiting, quiz

    session = QuizSession(quiz_id=quiz_id, join_code=_new_join_code(db), status="waiting")
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info("Published quiz %s as session %s for host %s", quiz_id, session.id, host_id)
    return session, quiz


def find_session_by_code(db: Session, join_code: str) -> QuizSession | None:
    """Newest session with this code, so an ended one is reported as closed."""
    statement = (
        select(QuizSession)
        .where(QuizSession.join_code == join_code)
        .order_by(QuizSession.id.desc())
    )
    return db.scalar(statement.limit(1))


def get_host_session(db: Session, host_id: int, session_id: int) -> QuizSession | None:
    statement = (
        select(QuizSession)
        .join(Quiz, Quiz.id == QuizSession.quiz_id)
        .where(QuizSession.id == session_id, Quiz.host_id == host_id)
    )
    return db.scalar(statement)
