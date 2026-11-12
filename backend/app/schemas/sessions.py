from typing import Literal

from pydantic import BaseModel


class SessionResponse(BaseModel):
    id: int
    quiz_id: int
    quiz_title: str
    join_code: str
    status: Literal["waiting", "running", "ended"]
