from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.db.session import Base

# Compatible primary key type: BIGINT on PostgreSQL, INTEGER on SQLite for proper autoincrement
PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class Host(Base):
    __tablename__ = "hosts"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    quizzes = relationship("Quiz", back_populates="host", cascade="all, delete-orphan")
    materials = relationship("Material", back_populates="host", cascade="all, delete-orphan")


class Material(Base):
    __tablename__ = "materials"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    host_id = Column(PK_TYPE, ForeignKey("hosts.id"), nullable=False)
    file_name = Column(Text, nullable=False)
    page_count = Column(Integer, nullable=False, default=0)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    host = relationship("Host", back_populates="materials")
    pages = relationship("MaterialPage", back_populates="material", cascade="all, delete-orphan")


class MaterialPage(Base):
    __tablename__ = "material_pages"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    material_id = Column(PK_TYPE, ForeignKey("materials.id"), nullable=False)
    page_number = Column(Integer, nullable=False)
    text = Column(Text, nullable=False, default="")

    material = relationship("Material", back_populates="pages")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    host_id = Column(PK_TYPE, ForeignKey("hosts.id"), nullable=False)
    title = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    host = relationship("Host", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="quiz", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    quiz_id = Column(PK_TYPE, ForeignKey("quizzes.id"), nullable=False)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    correct_index = Column(SmallInteger, nullable=False)
    time_limit = Column(Integer, nullable=False)
    source_page_id = Column(PK_TYPE, ForeignKey("material_pages.id"), nullable=True)
    source_snippet = Column(Text, nullable=True)
    origin = Column(String(10), nullable=False)

    quiz = relationship("Quiz", back_populates="questions")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    quiz_id = Column(PK_TYPE, ForeignKey("quizzes.id"), nullable=False)
    join_code = Column(String(6), nullable=False)
    status = Column(String(10), nullable=False, default="waiting")
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    quiz = relationship("Quiz", back_populates="sessions")
    participants = relationship("Participant", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('waiting', 'running', 'ended')", name="check_session_status"),
        Index(
            "unique_active_session_join_code",
            "join_code",
            unique=True,
            postgresql_where=(Column("status").in_(["waiting", "running"])),
            sqlite_where=(Column("status").in_(["waiting", "running"])),
        ),
    )


class Participant(Base):
    __tablename__ = "participants"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    session_id = Column(PK_TYPE, ForeignKey("sessions.id"), nullable=False)
    display_name = Column(String(100), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("Session", back_populates="participants")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    session_id = Column(PK_TYPE, ForeignKey("sessions.id"), nullable=False)
    question_id = Column(PK_TYPE, ForeignKey("questions.id"), nullable=False)
    participant_id = Column(PK_TYPE, ForeignKey("participants.id"), nullable=False)
    chosen_index = Column(SmallInteger, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    answer_ms = Column(Integer, nullable=True)
    points = Column(Integer, nullable=False, default=0)


class Flag(Base):
    __tablename__ = "flags"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    session_id = Column(PK_TYPE, ForeignKey("sessions.id"), nullable=False)
    question_id = Column(PK_TYPE, ForeignKey("questions.id"), nullable=False)
    participant_id = Column(PK_TYPE, ForeignKey("participants.id"), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
