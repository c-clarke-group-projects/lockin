"""
Compatibility layer re-exporting canonical entity models from app.models.entities.
Prevents duplicate table declarations on Base metadata.
"""
from app.db.base import Base
from app.models.entities import (
    Answer,
    Flag,
    Host,
    ID_TYPE as PK_TYPE,
    Material,
    MaterialPage,
    Participant,
    Question,
    Quiz,
    QuizSession,
    QuizSession as Session,
)

__all__ = [
    "Answer",
    "Base",
    "Flag",
    "Host",
    "Material",
    "MaterialPage",
    "PK_TYPE",
    "Participant",
    "Question",
    "Quiz",
    "QuizSession",
    "Session",
]
