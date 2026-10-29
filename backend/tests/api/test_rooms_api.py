import base64
import concurrent.futures
import io
import os
import re
import tempfile
from unittest.mock import patch
import cv2
import numpy as np
from PIL import Image
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.auth import create_access_token
from app.db.session import Base, get_db
from app.main import app
from app.models.models import Host, Quiz, Session as SessionModel

# File-backed temporary SQLite database ensures true thread connection isolation
temp_dir = tempfile.mkdtemp()
db_file = os.path.join(temp_dir, "test_api.db")
engine = create_engine(f"sqlite:///{db_file}")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def create_test_host(email="host1@lockin.edu") -> Host:
    db = TestingSessionLocal()
    try:
        host = Host(email=email, password_hash="hashed_pw_secret")
        db.add(host)
        db.commit()
        db.refresh(host)
        return host
    finally:
        db.close()


def create_test_quiz(host_id: int, title="Sample Quiz") -> Quiz:
    db = TestingSessionLocal()
    try:
        quiz = Quiz(host_id=host_id, title=title)
        db.add(quiz)
        db.commit()
        db.refresh(quiz)
        return quiz
    finally:
        db.close()


def auth_headers(host_id: int) -> dict:
    token = create_access_token(data={"sub": str(host_id)})
    return {"Authorization": f"Bearer {token}"}


def test_create_room_api_success():
    """Requirement 8.1, 8.6, 8.7, 8.8: Successful room creation, schema, waiting status, join URL."""
    host = create_test_host("teacher@lockin.edu")
    quiz = create_test_quiz(host.id, "Math Quiz")

    response = client.post(
        "/api/rooms",
        json={"quiz_id": quiz.id},
        headers=auth_headers(host.id),
    )

    assert response.status_code == 201
    data = response.json()

    assert "room_id" in data
    assert "room_code" in data
    assert "join_url" in data
    assert "qr_code" in data

    # Verify session persisted in database
    db = TestingSessionLocal()
    session = db.query(SessionModel).filter(SessionModel.id == data["room_id"]).first()
    assert session is not None
    assert session.quiz_id == quiz.id
    assert session.join_code == data["room_code"]
    assert session.status == "waiting"
    db.close()


def test_create_room_api_code_format_and_leading_zeros():
    """Requirement 8.2 & 8.3: Exactly 6 numeric digits, preserved leading zeros."""
    host = create_test_host()
    quiz = create_test_quiz(host.id)

    # Force a leading zero code: 004821
    with patch("app.services.room.generate_room_code", return_value="004821"):
        response = client.post(
            "/api/rooms",
            json={"quiz_id": quiz.id},
            headers=auth_headers(host.id),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["room_code"] == "004821"
        assert len(data["room_code"]) == 6
        assert re.match(r"^[0-9]{6}$", data["room_code"])


def test_create_room_api_qr_code_decodes_to_exact_url():
    """Requirement 8.9: QR code decodes to exact join URL."""
    host = create_test_host()
    quiz = create_test_quiz(host.id)

    response = client.post(
        "/api/rooms",
        json={"quiz_id": quiz.id},
        headers=auth_headers(host.id),
    )

    assert response.status_code == 201
    data = response.json()
    join_url = data["join_url"]
    qr_data_uri = data["qr_code"]

    assert qr_data_uri.startswith("data:image/png;base64,")
    raw_bytes = base64.b64decode(qr_data_uri.split(",", 1)[1])
    img = Image.open(io.BytesIO(raw_bytes))
    cv_img = np.array(img.convert("RGB"))

    detector = cv2.QRCodeDetector()
    decoded_text, _, _ = detector.detectAndDecode(cv_img)
    assert decoded_text == join_url


def test_create_room_api_unauthorized_missing_token():
    """Requirement 8.11: Missing authentication token returns 401 Unauthorized."""
    response = client.post("/api/rooms", json={"quiz_id": 1})
    assert response.status_code == 401


def test_create_room_api_unauthorized_invalid_token():
    """Requirement 8.11: Malformed token returns 401 Unauthorized."""
    response = client.post(
        "/api/rooms",
        json={"quiz_id": 1},
        headers={"Authorization": "Bearer bad-token-here"},
    )
    assert response.status_code == 401


def test_create_room_api_invalid_quiz_id_negative_or_zero():
    """Requirement 8.10: Quiz ID <= 0 returns validation error (422 or 400)."""
    host = create_test_host()
    response = client.post(
        "/api/rooms",
        json={"quiz_id": 0},
        headers=auth_headers(host.id),
    )
    assert response.status_code in [400, 422]


def test_create_room_api_quiz_not_found():
    """Requirement 8.10: Non-existent quiz returns 404 Not Found."""
    host = create_test_host()
    response = client.post(
        "/api/rooms",
        json={"quiz_id": 99999},
        headers=auth_headers(host.id),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Quiz not found"


def test_create_room_api_forbidden_another_host():
    """Requirement 8.12: Host accessing another host's quiz returns 403 Forbidden."""
    owner = create_test_host("owner@lockin.edu")
    other_host = create_test_host("other@lockin.edu")
    quiz = create_test_quiz(owner.id, "Owner's Quiz")

    response = client.post(
        "/api/rooms",
        json={"quiz_id": quiz.id},
        headers=auth_headers(other_host.id),
    )
    assert response.status_code == 403
    assert "You do not have permission" in response.json()["detail"]


def test_create_room_concurrent_requests():
    """Requirement 8.5: Two concurrent room creation requests both succeed with distinct codes."""
    host = create_test_host("concurrent_host@lockin.edu")
    quiz = create_test_quiz(host.id, "Concurrent Quiz")

    def make_request():
        local_client = TestClient(app)
        return local_client.post(
            "/api/rooms",
            json={"quiz_id": quiz.id},
            headers=auth_headers(host.id),
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_request)
        f2 = executor.submit(make_request)
        r1 = f1.result()
        r2 = f2.result()

    assert r1.status_code == 201
    assert r2.status_code == 201

    d1 = r1.json()
    d2 = r2.json()

    assert d1["room_id"] != d2["room_id"]
    assert d1["room_code"] != d2["room_code"]
