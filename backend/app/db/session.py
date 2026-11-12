import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Generator

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(usecwd=True))
    _root_env = Path(__file__).resolve().parents[2] / ".env"
    if _root_env.exists():
        load_dotenv(_root_env)
except ImportError:
    pass

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base

logger = logging.getLogger(__name__)


def _normalize_db_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        try:
            settings = get_settings()
            database_url = settings.database_url
        except Exception:
            database_url = None

    if not database_url:
        logger.error("DATABASE_URL environment variable is not set")
        raise RuntimeError("DATABASE_URL must be set before using the database.")

    normalized_url = _normalize_db_url(database_url)
    connect_args = {}
    if normalized_url.startswith("postgresql"):
        connect_args = {"connect_timeout": 5}
    elif normalized_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    return create_engine(
        normalized_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


class _SessionLocalProxy:
    def __call__(self, *args, **kwargs) -> Session:
        session_factory = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
        return session_factory(*args, **kwargs)

    def __getattr__(self, item):
        session_factory = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
        return getattr(session_factory, item)


SessionLocal = _SessionLocalProxy()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a transactional database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def __getattr__(name: str):
    if name == "engine":
        return get_engine()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = ["Base", "get_engine", "get_db", "SessionLocal"]
