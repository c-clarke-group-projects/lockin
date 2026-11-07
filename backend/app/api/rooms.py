from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_host
from app.db.session import get_db
from app.models.models import Host
from app.schemas.room import RoomCreateRequest, RoomCreateResponse
from app.services.room import create_room

router = APIRouter(prefix="/rooms", tags=["Rooms"])


@router.post(
    "",
    response_model=RoomCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new live quiz room session",
)
async def create_new_room(
    payload: RoomCreateRequest,
    current_host: Host = Depends(get_current_host),
    db: Session = Depends(get_db),
):
    """
    Creates a new quiz room with a unique 6 digit numeric code,
    participant join link, and QR code.
    Requires an authenticated host who owns the specified quiz.
    """
    session, join_url, qr_code = create_room(
        db=db,
        quiz_id=payload.quiz_id,
        host_id=current_host.id,
    )

    return RoomCreateResponse(
        room_id=session.id,
        room_code=session.join_code,
        join_url=join_url,
        qr_code=qr_code,
    )

