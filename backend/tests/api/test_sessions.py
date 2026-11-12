from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Host, Question, Quiz, QuizSession

HOST_ID = 1
OTHER_HOST_ID = 2


def add_host(db_session: Session, host_id: int) -> None:
    db_session.add(
        Host(id=host_id, email=f"host-{host_id}@example.test", password_hash="test-hash")
    )
    db_session.commit()


def add_quiz(db_session: Session, host_id: int, with_question: bool = True) -> Quiz:
    quiz = Quiz(host_id=host_id, title="Cells", created_at=datetime(2026, 11, 1))
    db_session.add(quiz)
    db_session.flush()
    if with_question:
        db_session.add(
            Question(
                quiz_id=quiz.id,
                text="What holds the genes?",
                options=["Nucleus", "Wall", "Membrane", "Vacuole"],
                correct_index=0,
                time_limit=20,
                origin="manual",
            )
        )
    db_session.commit()
    return quiz


def test_publish_opens_waiting_room_with_6_digit_code(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID)

    response = host_client.post(f"/api/quizzes/{quiz.id}/sessions")

    assert response.status_code == 201
    body = response.json()
    assert body["quiz_id"] == quiz.id
    assert body["quiz_title"] == "Cells"
    assert body["status"] == "waiting"
    assert len(body["join_code"]) == 6 and body["join_code"].isdigit()


def test_publish_twice_returns_the_same_waiting_room(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID)

    first = host_client.post(f"/api/quizzes/{quiz.id}/sessions").json()
    second = host_client.post(f"/api/quizzes/{quiz.id}/sessions").json()

    assert first == second
    count = len(db_session.scalars(select(QuizSession)).all())
    assert count == 1


def test_publish_without_questions_returns_409(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, with_question=False)

    response = host_client.post(f"/api/quizzes/{quiz.id}/sessions")

    assert response.status_code == 409


def test_publish_other_hosts_quiz_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    quiz = add_quiz(db_session, OTHER_HOST_ID)

    response = host_client.post(f"/api/quizzes/{quiz.id}/sessions")

    assert response.status_code == 404


def test_publish_without_login_returns_401(client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID)

    response = client.post(f"/api/quizzes/{quiz.id}/sessions")

    assert response.status_code == 401


def test_get_session_only_for_its_host(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    own = add_quiz(db_session, HOST_ID)
    other = add_quiz(db_session, OTHER_HOST_ID)
    other_session = QuizSession(quiz_id=other.id, join_code="111111", status="waiting")
    db_session.add(other_session)
    db_session.commit()
    published = host_client.post(f"/api/quizzes/{own.id}/sessions").json()

    assert host_client.get(f"/api/sessions/{published['id']}").json() == published
    assert host_client.get(f"/api/sessions/{other_session.id}").status_code == 404


def test_delete_question_removes_it_before_play(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID)
    question_id = quiz.questions[0].id

    response = host_client.delete(f"/api/quizzes/{quiz.id}/questions/{question_id}")

    assert response.status_code == 204
    assert db_session.get(Question, question_id) is None


def test_delete_question_of_other_host_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    quiz = add_quiz(db_session, OTHER_HOST_ID)

    response = host_client.delete(f"/api/quizzes/{quiz.id}/questions/{quiz.questions[0].id}")

    assert response.status_code == 404
