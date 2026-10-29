from datetime import datetime
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db.base import Base

ID_TYPE = BigInteger().with_variant(Integer, "sqlite")
OPTIONS_TYPE = JSON().with_variant(JSONB, "postgresql")


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    materials: Mapped[list["Material"]] = relationship(back_populates="host")
    quizzes: Mapped[list["Quiz"]] = relationship(back_populates="host")


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    host: Mapped[Host] = relationship(back_populates="materials")
    pages: Mapped[list["MaterialPage"]] = relationship(
        back_populates="material",
        cascade="all, delete-orphan",
    )


class MaterialPage(Base):
    __tablename__ = "material_pages"
    __table_args__ = (
        UniqueConstraint("material_id", "page_number"),
        CheckConstraint("page_number >= 1"),
    )

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("materials.id"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    material: Mapped[Material] = relationship(back_populates="pages")
    questions: Mapped[list["Question"]] = relationship(back_populates="source_page")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    host: Mapped[Host] = relationship(back_populates="quizzes")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Question.id",
    )
    sessions: Mapped[list["QuizSession"]] = relationship(
        back_populates="quiz",
        passive_deletes="all",
    )


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("correct_index BETWEEN 0 AND 3"),
        CheckConstraint("time_limit > 0"),
        CheckConstraint("origin IN ('ai', 'manual')"),
        CheckConstraint(
            "origin = 'manual' OR "
            "(source_page_id IS NOT NULL AND source_snippet IS NOT NULL "
            "AND source_snippet <> '')"
        ),
        CheckConstraint("json_array_length(options) = 4").ddl_if(dialect="sqlite"),
        CheckConstraint("jsonb_array_length(options) = 4").ddl_if(
            dialect="postgresql"
        ),
    )

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(OPTIONS_TYPE, nullable=False)
    correct_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    time_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    source_page_id: Mapped[int | None] = mapped_column(
        ForeignKey("material_pages.id"),
    )
    source_snippet: Mapped[str | None] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(10), nullable=False)
    quiz: Mapped[Quiz] = relationship(back_populates="questions")
    source_page: Mapped[MaterialPage | None] = relationship(
        back_populates="questions"
    )
    answers: Mapped[list["Answer"]] = relationship(back_populates="question")
    flags: Mapped[list["Flag"]] = relationship(back_populates="question")

    @validates("options")
    def validate_options(self, key: str, value: list[str]) -> list[str]:
        if len(value) != 4:
            raise ValueError("A question must have exactly 4 options.")
        return value


class QuizSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("length(join_code) = 6"),
        CheckConstraint("status IN ('waiting', 'running', 'ended')"),
    )

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    join_code: Mapped[str] = mapped_column(String(6), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="waiting",
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quiz: Mapped[Quiz] = relationship(back_populates="sessions")
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
    answers: Mapped[list["Answer"]] = relationship(back_populates="session")
    flags: Mapped[list["Flag"]] = relationship(back_populates="session")


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("session_id", "display_name"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    session: Mapped[QuizSession] = relationship(back_populates="participants")
    answers: Mapped[list["Answer"]] = relationship(back_populates="participant")
    flags: Mapped[list["Flag"]] = relationship(back_populates="participant")


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("participant_id", "question_id"),
        CheckConstraint("chosen_index IS NULL OR chosen_index BETWEEN 0 AND 3"),
        CheckConstraint("answer_ms IS NULL OR answer_ms >= 0"),
        CheckConstraint("points >= 0"),
    )

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"),
        nullable=False,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id"),
        nullable=False,
    )
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id"),
        nullable=False,
    )
    chosen_index: Mapped[int | None] = mapped_column(SmallInteger)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    answer_ms: Mapped[int | None] = mapped_column(Integer)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    session: Mapped[QuizSession] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship(back_populates="answers")
    participant: Mapped[Participant] = relationship(back_populates="answers")


class Flag(Base):
    __tablename__ = "flags"
    __table_args__ = (UniqueConstraint("participant_id", "question_id"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"),
        nullable=False,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id"),
        nullable=False,
    )
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id"),
        nullable=False,
    )
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    session: Mapped[QuizSession] = relationship(back_populates="flags")
    question: Mapped[Question] = relationship(back_populates="flags")
    participant: Mapped[Participant] = relationship(back_populates="flags")

