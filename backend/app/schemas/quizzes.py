from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.questions import QuestionResponse


class QuizCreate(BaseModel):
    title: str = Field(min_length=1)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Title must not be empty.")
        return title


class QuizListItem(BaseModel):
    id: int
    title: str
    created_at: datetime
    question_count: int


class QuizDetailResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    questions: list[QuestionResponse]

