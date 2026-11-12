import base64
import io
import re
from unittest.mock import patch, MagicMock
import cv2
import numpy as np
from PIL import Image
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError, OperationalError

from app.db.session import Base
from app.models.models import Host, Quiz, Session as SessionModel
from app.services.room import (
    generate_room_code,
    generate_join_url,
    generate_qr_code,
    create_room,
)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


def test_generate_room_code_format_and_length():
    """Requirement 8.2: Generated room codes must be exactly 6 numeric digits."""
    for _ in range(50):
        code = generate_room_code()
        assert len(code) == 6
        assert code.isdigit()
        assert re.match(r"^\d{6}$", code)


def test_generate_room_code_preserves_leading_zeros():
    """Requirement 8.3: Codes with values < 100000 must preserve leading zeros."""
    with patch("secrets.randbelow", return_value=42):
        code = generate_room_code()
        assert code == "000042"
        assert len(code) == 6

    with patch("secrets.randbelow", return_value=7):
        code = generate_room_code()
        assert code == "000007"
        assert len(code) == 6

    with patch("secrets.randbelow", return_value=0):
        code = generate_room_code()
        assert code == "000000"
        assert len(code) == 6


def test_generate_join_url():
    """Requirement 8.8: Correct join URL format from configuration."""
    url = generate_join_url("483921", "http://localhost:5173")
    assert url == "http://localhost:5173/join/483921"

    # Strips trailing slash
    url_trailing = generate_join_url("483921", "https://lockin.quiz.edu/")
    assert url_trailing == "https://lockin.quiz.edu/join/483921"


def test_generate_qr_code_decodes_to_exact_join_url():
    """Requirement 8.9: QR code decodes to the exact join URL."""
    target_url = "http://localhost:5173/join/048392"
    qr_data_uri = generate_qr_code(target_url)

    assert qr_data_uri.startswith("data:image/png;base64,")
    b64_data = qr_data_uri.split(",", 1)[1]
    raw_bytes = base64.b64decode(b64_data)

    img = Image.open(io.BytesIO(raw_bytes))
    cv_img = np.array(img.convert("RGB"))

    detector = cv2.QRCodeDetector()
    decoded_text, _, _ = detector.detectAndDecode(cv_img)
    assert decoded_text == target_url


def test_create_room_success(db_session):
    """Requirements 8.1, 8.6, 8.7: Successful room creation, initial waiting status, DB session."""
    host = Host(email="host@lockin.edu", password_hash="hash123")
    db_session.add(host)
    db_session.commit()

    quiz = Quiz(host_id=host.id, title="Biology 101")
    db_session.add(quiz)
    db_session.commit()

    session, join_url, qr_code = create_room(
        db=db_session,
        quiz_id=quiz.id,
        host_id=host.id,
    )

    assert session.id is not None
    assert session.quiz_id == quiz.id
    assert session.status == "waiting"
    assert len(session.join_code) == 6
    assert join_url.endswith(f"/join/{session.join_code}")
    assert qr_code.startswith("data:image/png;base64,")


def test_create_room_collision_retry_handling(db_session):
    """Requirement 8.4: Active code collisions trigger retry and save successfully."""
    host = Host(email="host_collision@lockin.edu", password_hash="hash")
    db_session.add(host)
    db_session.commit()

    quiz = Quiz(host_id=host.id, title="History 201")
    db_session.add(quiz)
    db_session.commit()

    # Pre-populate an active room with code "111111"
    existing_session = SessionModel(quiz_id=quiz.id, join_code="111111", status="waiting")
    db_session.add(existing_session)
    db_session.commit()

    # First candidate generates duplicate "111111", second candidate generates "222222"
    with patch("app.services.room.generate_room_code", side_effect=["111111", "222222"]):
        session, _, _ = create_room(db=db_session, quiz_id=quiz.id, host_id=host.id)
        assert session.join_code == "222222"
        assert session.status == "waiting"


def test_create_room_exhausted_retries_raises_503(db_session):
    """Exhausted collision retries raise controlled 503 error."""
    host = Host(email="host_retry@lockin.edu", password_hash="hash")
    db_session.add(host)
    db_session.commit()

    quiz = Quiz(host_id=host.id, title="Physics 101")
    db_session.add(quiz)
    db_session.commit()

    # Always return an existing code to simulate total collision
    existing_session = SessionModel(quiz_id=quiz.id, join_code="999999", status="waiting")
    db_session.add(existing_session)
    db_session.commit()

    with patch("app.services.room.generate_room_code", return_value="999999"):
        with pytest.raises(HTTPException) as exc_info:
            create_room(db=db_session, quiz_id=quiz.id, host_id=host.id, max_retries=3)
        assert exc_info.value.status_code == 503
        assert "Unable to generate a unique room code" in exc_info.value.detail


def test_create_room_invalid_quiz_id(db_session):
    """Requirement 8.10: Invalid quiz ID <= 0 raises 400 Bad Request."""
    with pytest.raises(HTTPException) as exc_info:
        create_room(db=db_session, quiz_id=-5, host_id=1)
    assert exc_info.value.status_code == 400
    assert "Invalid quiz ID" in exc_info.value.detail


def test_create_room_quiz_not_found(db_session):
    """Requirement 8.10: Non-existent quiz ID raises 404 Not Found."""
    with pytest.raises(HTTPException) as exc_info:
        create_room(db=db_session, quiz_id=99999, host_id=1)
    assert exc_info.value.status_code == 404
    assert "Quiz not found" in exc_info.value.detail


def test_create_room_forbidden_another_host_quiz(db_session):
    """Requirement 8.12: Host accessing another host's quiz raises 403 Forbidden."""
    owner = Host(email="owner@lockin.edu", password_hash="hash")
    attacker = Host(email="attacker@lockin.edu", password_hash="hash")
    db_session.add_all([owner, attacker])
    db_session.commit()

    quiz = Quiz(host_id=owner.id, title="Secret Exam")
    db_session.add(quiz)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        create_room(db=db_session, quiz_id=quiz.id, host_id=attacker.id)
    assert exc_info.value.status_code == 403
    assert "You do not have permission" in exc_info.value.detail


def test_create_room_database_error_handling(db_session):
    """Requirement 8.13: Controlled database error handling returns 500 without crashing."""
    mock_db = MagicMock()
    mock_db.query.side_effect = OperationalError("connection refused", {}, None)

    with pytest.raises(HTTPException) as exc_info:
        create_room(db=mock_db, quiz_id=1, host_id=1)
    assert exc_info.value.status_code == 500
    assert "Database error" in exc_info.value.detail

