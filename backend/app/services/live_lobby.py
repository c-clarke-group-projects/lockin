"""Database rules for joining a live room. Error codes follow docs/WEBSOCKET_PROTOCOL.md."""
import logging

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.entities import Participant, QuizSession
from app.services import session_service

logger = logging.getLogger(__name__)

MAX_NAME_LENGTH = 20


class LobbyError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def clean_display_name(raw: str) -> str:
    name = raw.strip()
    if not 1 <= len(name) <= MAX_NAME_LENGTH:
        raise LobbyError("name_invalid", "Display names are 1 to 20 characters.")
    return name


def session_for_code(db: Session, join_code: str, allow_running: bool) -> QuizSession:
    session = session_service.find_session_by_code(db, join_code.strip())
    if session is None:
        raise LobbyError("room_not_found", "No room has that code.")
    if session.status == "ended":
        raise LobbyError("room_closed", "This quiz has ended.")
    if session.status == "running" and not allow_running:
        raise LobbyError("wrong_phase", "The quiz has already started.")
    return session


def find_seat(db: Session, session_id: int, name: str) -> Participant | None:
    return db.scalar(
        select(Participant).where(
            Participant.session_id == session_id,
            func.lower(Participant.display_name) == name.lower(),
        )
    )


def add_participant(db: Session, session_id: int, name: str) -> Participant:
    if find_seat(db, session_id, name) is not None:
        raise LobbyError("name_taken", "That name is already used in this room.")

    participant = Participant(session_id=session_id, display_name=name)
    db.add(participant)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise LobbyError("name_taken", "That name is already used in this room.") from exc
    db.refresh(participant)
    logger.info("Participant %s joined session %s", participant.id, session_id)
    return participant


def remove_participant(db: Session, session_id: int, participant_id: int) -> bool:
    result = db.execute(
        delete(Participant).where(
            Participant.session_id == session_id,
            Participant.id == participant_id,
        )
    )
    db.commit()
    return result.rowcount > 0


def lobby_rows(db: Session, session_id: int, connected: set[int]) -> list[dict]:
    """Connected participants in join order."""
    participants = db.scalars(
        select(Participant)
        .where(Participant.session_id == session_id)
        .order_by(Participant.joined_at, Participant.id)
    )
    return [
        {"participant_id": p.id, "display_name": p.display_name}
        for p in participants
        if p.id in connected
    ]
