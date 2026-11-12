import os
from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    app_env: str = os.getenv("APP_ENV", "development")
    app_host: str = os.getenv("APP_HOST", "127.0.0.1")
    app_port: int = int(os.getenv("APP_PORT", "8000"))
    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:8000")
    frontend_base_url: str = (
        os.getenv("FRONTEND_URL")
        or os.getenv("FRONTEND_BASE_URL")
        or "http://localhost:5173"
    )
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:1234@localhost:5432/lockin",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    jwt_secret: str = os.getenv("JWT_SECRET", "lockin-dev-secret-key-32-chars-min!!")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_minutes: int = int(os.getenv("ACCESS_TOKEN_MINUTES", "720"))


@lru_cache
def get_settings() -> Settings:
    return Settings()

