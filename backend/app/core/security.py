import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12


def _secret_key() -> str:
    # JWT_SECRET is the documented name in .env.example. SECRET_KEY is kept for
    # machines that were set up before the name was aligned.
    key = os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY")
    if not key:
        raise RuntimeError("JWT_SECRET must be set before using authentication.")
    return key


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(host_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(host_id), "exp": expires}
    return jwt.encode(payload, _secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None