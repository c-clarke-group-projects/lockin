from pydantic import BaseModel, Field


class RoomCreateRequest(BaseModel):
    quiz_id: int = Field(
        ...,
        gt=0,
        description="The ID of the quiz to create a session for",
        json_schema_extra={"example": 1},
    )


class RoomCreateResponse(BaseModel):
    room_id: int = Field(..., description="The unique session ID in PostgreSQL")
    room_code: str = Field(
        ...,
        pattern=r"^[0-9]{6}$",
        description="The 6 digit numeric join code",
        json_schema_extra={"example": "483921"},
    )
    join_url: str = Field(..., description="Frontend URL for participants to join")
    qr_code: str = Field(..., description="Base64 data URI of the QR code image")
