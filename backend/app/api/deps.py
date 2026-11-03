from fastapi import HTTPException, status


def current_host_id() -> int:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is required.",
    )
