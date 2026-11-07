from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.entities import Host
from app.schemas.auth import HostLogin, HostRegister, TokenResponse

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: HostRegister, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()

    if db.scalar(select(Host).where(Host.email == email)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered.",
        )

    host = Host(email=email, password_hash=hash_password(payload.password))
    db.add(host)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered.",
        )
    db.refresh(host)

    return TokenResponse(access_token=create_access_token(host.id))


@router.post("/login", response_model=TokenResponse)
def login(payload: HostLogin, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()
    host = db.scalar(select(Host).where(Host.email == email))

    if host is None or not verify_password(payload.password, host.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return TokenResponse(access_token=create_access_token(host.id))