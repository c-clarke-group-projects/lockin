from app.db.base import Base
from app.db.session import get_engine
from app.models import entities


def init_db() -> None:
    Base.metadata.create_all(bind=get_engine())


if __name__ == "__main__":
    init_db()
