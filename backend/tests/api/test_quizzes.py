from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Host, Question, Quiz, QuizSession

HOST_ID = 1
OTHER_HOST_ID = 2


def add_host(db_session: Session, host_id: int) -> None:
    db_session.add(
        Host(
            id=host_id,
            email=f"host-{host_id}@example.test",
            password_hash="test-hash",
        )
    )
    db_session.commit()


def add_quiz(
    db_session: Session,
    host_id: int,
    title: str,
    created_at: datetime,
) -> Quiz:
    quiz = Quiz(host_id=host_id, title=title, created_at=created_at)
    db_session.add(quiz)
    db_session.flush()
    return quiz


def add_question(db_session: Session, quiz_id: int) -> Question:
    question = Question(
        quiz_id=quiz_id,
        text="What is 2 + 2?",
        options=["3", "4", "5", "6"],
        correct_index=1,
        time_limit=20,
        source_snippet="2 + 2 = 4",
        origin="manual",
    )
    db_session.add(question)
    db_session.commit()
    return question


def test_list_quizzes_shows_title_count_date_and_newest_first(
    host_client,
    db_session: Session,
) -> None:
    add_host(db_session, HOST_ID)
    older = add_quiz(
        db_session,
        HOST_ID,
        "Older quiz",
        datetime(2026, 10, 20, 10, 0),
    )
    newer = add_quiz(
        db_session,
        HOST_ID,
        "Newer quiz",
        datetime(2026, 10, 21, 10, 0),
    )
    add_question(db_session, newer.id)
    add_question(db_session, newer.id)
    db_session.commit()

    response = host_client.get("/api/quizzes")

    assert response.status_code == 200
    quizzes = response.json()
    assert [quiz["title"] for quiz in quizzes] == ["Newer quiz", "Older quiz"]
    assert quizzes[0]["question_count"] == 2
    assert quizzes[1]["question_count"] == 0
    assert datetime.fromisoformat(quizzes[0]["created_at"]).date().isoformat() == (
        "2026-10-21"
    )


def test_open_quiz_returns_questions(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz", datetime(2026, 10, 21))
    add_question(db_session, quiz.id)

    response = host_client.get(f"/api/quizzes/{quiz.id}")

    assert response.status_code == 200
    assert response.json()["questions"] == [
        {
            "text": "What is 2 + 2?",
            "options": ["3", "4", "5", "6"],
            "correct_index": 1,
            "time_limit": 20,
            "source_snippet": "2 + 2 = 4",
            "origin": "manual",
        }
    ]


def test_open_missing_quiz_returns_404(host_client) -> None:
    response = host_client.get("/api/quizzes/99")

    assert response.status_code == 404


def test_delete_missing_quiz_returns_404(host_client) -> None:
    response = host_client.delete("/api/quizzes/99")

    assert response.status_code == 404


def test_other_hosts_quiz_is_not_listed_opened_or_deleted(
    host_client,
    db_session: Session,
) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    quiz = add_quiz(
        db_session,
        OTHER_HOST_ID,
        "Private quiz",
        datetime(2026, 10, 21),
    )
    db_session.commit()

    assert host_client.get("/api/quizzes").json() == []
    assert host_client.get(f"/api/quizzes/{quiz.id}").status_code == 404
    assert host_client.delete(f"/api/quizzes/{quiz.id}").status_code == 404
    assert db_session.get(Quiz, quiz.id) is not None


def test_requests_without_login_return_401(client) -> None:
    assert client.get("/api/quizzes").status_code == 401


def test_delete_removes_quiz_and_its_questions(
    host_client,
    db_session: Session,
) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz", datetime(2026, 10, 21))
    question = add_question(db_session, quiz.id)

    response = host_client.delete(f"/api/quizzes/{quiz.id}")

    assert response.status_code == 204
    assert db_session.get(Quiz, quiz.id) is None
    assert db_session.get(Question, question.id) is None


def test_delete_quiz_with_session_returns_409_and_keeps_quiz(
    host_client,
    db_session: Session,
) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz", datetime(2026, 10, 21))
    db_session.add(
        QuizSession(
            quiz_id=quiz.id,
            join_code="123456",
            status="ended",
        )
    )
    db_session.commit()

    response = host_client.delete(f"/api/quizzes/{quiz.id}")

    assert response.status_code == 409
    assert "associated sessions" in response.json()["detail"]
    assert (
        db_session.scalar(
            select(func.count()).select_from(Quiz).where(Quiz.id == quiz.id)
        )
        == 1
    )


def test_create_quiz_creates_title_for_authenticated_host(
    host_client,
    db_session: Session,
) -> None:
    add_host(db_session, HOST_ID)

    response = host_client.post("/api/quizzes", json={"title": "  New quiz  "})

    assert response.status_code == 201
    assert response.json()["title"] == "New quiz"
    assert response.json()["question_count"] == 0
