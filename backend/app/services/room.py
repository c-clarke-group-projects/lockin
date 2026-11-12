import base64
import io
import logging
import secrets
from typing import Optional, Tuple
from fastapi import HTTPException, status
import qrcode
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import Quiz, Session as SessionModel

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_ROOM_CODE_RETRIES = 5


def generate_room_code() -> str:
    """
    Generates a cryptographically secure 6 digit numeric room code.
    Leading zeros are preserved.
    """
    code_int = secrets.randbelow(1_000_000)
    return f"{code_int:06d}"


def generate_join_url(room_code: str, base_url: Optional[str] = None) -> str:
    """
    Generates the frontend participant join URL.
    Uses FRONTEND_URL / FRONTEND_BASE_URL from configuration.
    """
    root_url = (base_url or settings.frontend_base_url).rstrip("/")
    return f"{root_url}/join/{room_code}"


def generate_qr_code(join_url: str) -> str:
    """
    Generates a QR code image as a Base64 data URI (PNG).
    Runs completely in memory with no external network calls or temporary files.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(join_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded_png = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded_png}"


def create_room(
    db: Session,
    quiz_id: int,
    host_id: int,
    max_retries: int = MAX_ROOM_CODE_RETRIES,
) -> Tuple[SessionModel, str, str]:
    """
    Validates quiz ownership, generates a collision-free 6 digit code,
    persists a session in PostgreSQL, and generates join URL and QR code.
    """
    if quiz_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid quiz ID",
        )

    try:
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    except SQLAlchemyError as exc:
        logger.error("Database error querying quiz %s: %s", quiz_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while validating quiz",
        )

    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found",
        )

    if quiz.host_id != host_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this quiz",
        )

    session_created: Optional[SessionModel] = None

    for attempt in range(max_retries):
        candidate_code = generate_room_code()

        # Pre-check active sessions to avoid unnecessary constraint violations
        existing_active = (
            db.query(SessionModel)
            .filter(
                SessionModel.join_code == candidate_code,
                SessionModel.status.in_(["waiting", "running"]),
            )
            .first()
        )
        if existing_active:
            logger.info(
                "Candidate room code %s is already active. Retrying (attempt %s/%s)...",
                candidate_code,
                attempt + 1,
                max_retries,
            )
            continue

        new_session = SessionModel(
            quiz_id=quiz.id,
            join_code=candidate_code,
            status="waiting",
        )
        db.add(new_session)

        try:
            db.commit()
            db.refresh(new_session)
            session_created = new_session
            break
        except IntegrityError as exc:
            db.rollback()
            logger.warning(
                "Room code constraint collision for code %s on attempt %s/%s: %s",
                candidate_code,
                attempt + 1,
                max_retries,
                exc,
            )
        except SQLAlchemyError as exc:
            db.rollback()
            logger.error("Database error creating session: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while creating room session",
            )

    if not session_created:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate a unique room code. Please try again.",
        )

    join_url = generate_join_url(session_created.join_code)
    qr_code = generate_qr_code(join_url)

    return session_created, join_url, qr_code

