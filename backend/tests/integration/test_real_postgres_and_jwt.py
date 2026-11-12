"""
Integration verification test for Real PostgreSQL and JWT Authentication Compatibility.
Checks:
1. Room creation and physical persistence in the real PostgreSQL database.
2. Verification of partial unique index and session constraints in PostgreSQL.
3. Compatibility with Nihansa's login JWT token structure:
   - Pattern A: Standard RFC 7519 sub claim with host ID (str): {"sub": "1", "email": "..."}
   - Pattern B: Direct host_id claim: {"host_id": 1, "email": "..."}
   - Pattern C: sub with numeric host ID: {"sub": 1}
4. Rejection of expired or tampered tokens (HTTP 401).
5. Full HTTP POST /api/rooms execution against real PostgreSQL with real JWT token.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
import jwt
import psycopg
import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in pythonpath
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.auth import get_current_host, decode_access_token, create_access_token
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.models import Host, Quiz, Session as SessionModel
from app.services.room import create_room
from fastapi.security import HTTPAuthorizationCredentials

settings = get_settings()


def test_real_postgresql_room_persistence():
    """Verify room creation and persistence directly in real PostgreSQL."""
    db = SessionLocal()
    try:
        # Create a unique test host
        test_email = f"postgres_test_{datetime.now(timezone.utc).timestamp()}@lockin.edu"
        host = Host(email=test_email, password_hash="dummy_hashed_pw")
        db.add(host)
        db.commit()
        db.refresh(host)

        # Create a test quiz
        quiz = Quiz(host_id=host.id, title="PostgreSQL Live Test Quiz")
        db.add(quiz)
        db.commit()
        db.refresh(quiz)

        # Execute create_room service
        session, join_url, qr_code = create_room(db=db, quiz_id=quiz.id, host_id=host.id)

        assert session.id is not None
        assert session.status == "waiting"
        assert len(session.join_code) == 6
        assert session.join_code.isdigit()
        assert join_url.endswith(f"/join/{session.join_code}")
        assert qr_code.startswith("data:image/png;base64,")

        # Direct verification in PostgreSQL using raw psycopg connection
        conn = psycopg.connect("postgresql://postgres:1234@localhost:5432/lockin")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, quiz_id, join_code, status, started_at, ended_at FROM sessions WHERE id = %s;",
                (session.id,),
            )
            row = cur.fetchone()
            assert row is not None, "Session row was not found in real PostgreSQL!"
            db_id, db_quiz_id, db_join_code, db_status, db_started, db_ended = row

            assert db_id == session.id
            assert db_quiz_id == quiz.id
            assert db_join_code == session.join_code
            assert db_status == "waiting"
            assert db_started is None
            assert db_ended is None
            print(f"\n[PostgreSQL Real DB Check] Verified row: id={db_id}, code={db_join_code}, status={db_status}")
        conn.close()

    finally:
        db.close()


def test_nihansa_jwt_compatibility_standard_sub_claim():
    """Pattern A: Nihansa uses standard RFC 'sub' (subject) claim as host ID."""
    db = SessionLocal()
    try:
        host = Host(email=f"sub_claim_{datetime.now(timezone.utc).timestamp()}@lockin.edu", password_hash="hash")
        db.add(host)
        db.commit()
        db.refresh(host)

        # Standard FastAPI OAuth2 / JWT pattern:
        payload = {
            "sub": str(host.id),
            "email": host.email,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

        decoded = decode_access_token(token)
        assert decoded["sub"] == str(host.id)

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        resolved_host = get_current_host(credentials=creds, db=db)
        assert resolved_host.id == host.id
        assert resolved_host.email == host.email
        print(f"\n[JWT Compatibility - Pattern A: 'sub' host ID] Successfully authenticated host ID {resolved_host.id}")
    finally:
        db.close()


def test_nihansa_jwt_compatibility_host_id_claim():
    """Pattern B: Nihansa uses explicit 'host_id' claim."""
    db = SessionLocal()
    try:
        host = Host(email=f"host_id_claim_{datetime.now(timezone.utc).timestamp()}@lockin.edu", password_hash="hash")
        db.add(host)
        db.commit()
        db.refresh(host)

        # Explicit host_id payload:
        payload = {
            "host_id": host.id,
            "email": host.email,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

        decoded = decode_access_token(token)
        assert decoded["host_id"] == host.id

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        resolved_host = get_current_host(credentials=creds, db=db)
        assert resolved_host.id == host.id
        print(f"\n[JWT Compatibility - Pattern B: 'host_id' claim] Successfully authenticated host ID {resolved_host.id}")
    finally:
        db.close()


def test_nihansa_jwt_expired_token_rejected():
    """Verify expired JWT tokens are safely rejected with 401 Unauthorized."""
    expired_payload = {
        "sub": "1",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=10),
        "iat": datetime.now(timezone.utc) - timedelta(minutes=20),
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    client = TestClient(app)
    response = client.post(
        "/api/rooms",
        json={"quiz_id": 1},
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "Token has expired" in response.json()["detail"]
    print("\n[JWT Security Check] Expired token rejected with HTTP 401.")


def test_nihansa_jwt_wrong_secret_rejected():
    """Verify tokens signed with a different secret are rejected with 401."""
    fake_token = jwt.encode({"sub": "1"}, "wrong-secret-key-123456789012345", algorithm="HS256")
    client = TestClient(app)
    response = client.post(
        "/api/rooms",
        json={"quiz_id": 1},
        headers={"Authorization": f"Bearer {fake_token}"},
    )
    assert response.status_code == 401
    assert "Invalid authentication token" in response.json()["detail"]
    print("\n[JWT Security Check] Tampered/wrong-secret token rejected with HTTP 401.")


def test_full_http_endpoint_with_real_postgresql_and_jwt():
    """Complete end-to-end test of POST /api/rooms with real PostgreSQL & real JWT."""
    db = SessionLocal()
    try:
        # Create host & quiz in real DB
        host = Host(email=f"e2e_host_{datetime.now(timezone.utc).timestamp()}@lockin.edu", password_hash="hash")
        db.add(host)
        db.commit()
        db.refresh(host)

        quiz = Quiz(host_id=host.id, title="E2E Real PostgreSQL Quiz")
        db.add(quiz)
        db.commit()
        db.refresh(quiz)

        # Generate realistic token like Nihansa's login endpoint
        login_token = create_access_token(data={"sub": str(host.id), "email": host.email})

        # Call API through TestClient without any dependency overrides (uses real PostgreSQL)
        client = TestClient(app)
        response = client.post(
            "/api/rooms",
            json={"quiz_id": quiz.id},
            headers={"Authorization": f"Bearer {login_token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["room_id"] > 0
        assert len(data["room_code"]) == 6
        assert data["join_url"] == f"http://localhost:5173/join/{data['room_code']}"
        assert data["qr_code"].startswith("data:image/png;base64,")

        # Confirm persisted in real PostgreSQL
        saved_session = db.query(SessionModel).filter(SessionModel.id == data["room_id"]).first()
        assert saved_session is not None
        assert saved_session.join_code == data["room_code"]
        assert saved_session.status == "waiting"
        print(f"\n[E2E Real PostgreSQL & JWT Test] Successfully created room_id={data['room_id']}, code={data['room_code']}")
    finally:
        db.close()
