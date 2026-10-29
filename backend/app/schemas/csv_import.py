from pydantic import BaseModel

from app.schemas.questions import QuestionResponse


class CsvRejectedRow(BaseModel):
    row_number: int
    reason: str
    row_data: dict[str, str] = {}


class CsvImportResponse(BaseModel):
    imported_count: int
    rejected_count: int
    imported_questions: list[QuestionResponse]
    rejected_rows: list[CsvRejectedRow]

