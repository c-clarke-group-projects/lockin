import logging
import os
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL environment variable is not set")
        raise RuntimeError("DATABASE_URL must be set before using the database.")

    connect_args = {"connect_timeout": 5} if database_url.startswith("postgresql") else {}
    return create_engine(
        database_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


def get_db() -> Generator[Session, None, None]:
    session_factory = sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,
    )
    db = session_factory()
    try:
        yield db
    finally:
        db.close()

