import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import current_host_id
from app.db.base import Base
from app.db.session import get_db
from app.main import app as main_app
from app.models import entities

HOST_ID = 1
OTHER_HOST_ID = 2


@pytest.fixture
def db_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    test_session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    session = test_session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def app(db_session: Session) -> FastAPI:
    main_app.dependency_overrides.clear()
    main_app.dependency_overrides[get_db] = lambda: db_session
    return main_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def host_client(app: FastAPI) -> TestClient:
    app.dependency_overrides[current_host_id] = lambda: HOST_ID
    return TestClient(app)
