from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class QuestionManualCreate(BaseModel):
    quiz_id: int | None = None
    text: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    time_limit: int = Field(default=30, gt=0)
    source_note: str | None = None
    source_snippet: str | None = None
    source_page_id: int | None = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Question text must not be empty.")
        return text

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        if len(value) != 4:
            raise ValueError("A question must have exactly 4 options.")
        cleaned = [opt.strip() for opt in value]
        if any(not opt for opt in cleaned):
            raise ValueError("All 4 options must be non-empty.")
        return cleaned

    @field_validator("source_note", "source_snippet")
    @classmethod
    def clean_optional_str(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed if trimmed else None

    @model_validator(mode="after")
    def resolve_source(self) -> "QuestionManualCreate":
        if self.source_note and not self.source_snippet:
            self.source_snippet = self.source_note
        elif self.source_snippet and not self.source_note:
            self.source_note = self.source_snippet
        return self


class QuestionResponse(BaseModel):
    id: int
    quiz_id: int
    text: str
    options: list[str]
    correct_index: int
    time_limit: int
    source_snippet: str | None = None
    source_note: str | None = None
    source_page_id: int | None = None
    origin: Literal["ai", "manual"]

