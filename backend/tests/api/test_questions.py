from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Host, Question, Quiz

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
) -> Quiz:
    quiz = Quiz(host_id=host_id, title=title, created_at=datetime(2026, 10, 20))
    db_session.add(quiz)
    db_session.commit()
    db_session.refresh(quiz)
    return quiz


def test_add_manual_question_to_quiz_success(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Biology Quiz")

    payload = {
        "text": "What is the powerhouse of the cell?",
        "options": ["Nucleus", "Ribosome", "Mitochondria", "Chloroplast"],
        "correct_index": 2,
        "time_limit": 25,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["quiz_id"] == quiz.id
    assert data["text"] == "What is the powerhouse of the cell?"
    assert data["options"] == ["Nucleus", "Ribosome", "Mitochondria", "Chloroplast"]
    assert data["correct_index"] == 2
    assert data["time_limit"] == 25
    assert data["origin"] == "manual"
    assert data["source_snippet"] is None
    assert data["source_note"] is None

    stored = db_session.scalar(select(Question).where(Question.id == data["id"]))
    assert stored is not None
    assert stored.quiz_id == quiz.id
    assert stored.origin == "manual"
    assert stored.correct_index == 2
    assert len(stored.options) == 4


def test_add_manual_question_with_source_note(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "History Quiz")

    payload = {
        "text": "In which year did the Battle of Hastings take place?",
        "options": ["1066", "1086", "1100", "1215"],
        "correct_index": 0,
        "source_note": "Chapter 3, page 42 of standard history curriculum",
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["source_note"] == "Chapter 3, page 42 of standard history curriculum"
    assert data["source_snippet"] == "Chapter 3, page 42 of standard history curriculum"
    assert data["time_limit"] == 30

    stored = db_session.scalar(select(Question).where(Question.id == data["id"]))
    assert stored is not None
    assert stored.source_snippet == "Chapter 3, page 42 of standard history curriculum"


def test_add_manual_question_via_questions_endpoint(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Physics Quiz")

    payload = {
        "quiz_id": quiz.id,
        "text": "What is the unit of electrical resistance?",
        "options": ["Volt", "Ampere", "Ohm", "Watt"],
        "correct_index": 2,
    }

    response = host_client.post("/api/questions", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["quiz_id"] == quiz.id
    assert data["options"] == ["Volt", "Ampere", "Ohm", "Watt"]
    assert data["origin"] == "manual"


def test_add_question_missing_quiz_id_on_direct_endpoint_fails(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)

    payload = {
        "text": "What is 1 + 1?",
        "options": ["1", "2", "3", "4"],
        "correct_index": 1,
    }

    response = host_client.post("/api/questions", json=payload)

    assert response.status_code == 422


def test_add_question_with_3_options_fails_validation(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Invalid Quiz")

    payload = {
        "text": "Incomplete options question?",
        "options": ["A", "B", "C"],
        "correct_index": 0,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 422


def test_add_question_with_5_options_fails_validation(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Invalid Quiz")

    payload = {
        "text": "Too many options question?",
        "options": ["A", "B", "C", "D", "E"],
        "correct_index": 0,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 422


def test_add_question_with_empty_option_string_fails(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    payload = {
        "text": "Question with empty option?",
        "options": ["Option 1", "   ", "Option 3", "Option 4"],
        "correct_index": 0,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 422


def test_add_question_with_empty_text_fails(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    payload = {
        "text": "   ",
        "options": ["A", "B", "C", "D"],
        "correct_index": 0,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 422


def test_add_question_with_invalid_correct_index_fails(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    # Index 4 is out of bounds for 4 options (0 to 3)
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions",
        json={
            "text": "Question?",
            "options": ["A", "B", "C", "D"],
            "correct_index": 4,
        },
    )
    assert response.status_code == 422

    # Negative index
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions",
        json={
            "text": "Question?",
            "options": ["A", "B", "C", "D"],
            "correct_index": -1,
        },
    )
    assert response.status_code == 422


def test_add_question_with_non_positive_time_limit_fails(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions",
        json={
            "text": "Question?",
            "options": ["A", "B", "C", "D"],
            "correct_index": 0,
            "time_limit": 0,
        },
    )
    assert response.status_code == 422


def test_add_question_to_non_existent_quiz_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)

    payload = {
        "text": "Question?",
        "options": ["A", "B", "C", "D"],
        "correct_index": 0,
    }

    response = host_client.post("/api/quizzes/999/questions", json=payload)

    assert response.status_code == 404


def test_add_question_to_other_hosts_quiz_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    quiz = add_quiz(db_session, OTHER_HOST_ID, "Other host quiz")

    payload = {
        "text": "Question?",
        "options": ["A", "B", "C", "D"],
        "correct_index": 0,
    }

    response = host_client.post(f"/api/quizzes/{quiz.id}/questions", json=payload)

    assert response.status_code == 404


def test_add_question_without_authentication_returns_401(client) -> None:
    payload = {
        "text": "Question?",
        "options": ["A", "B", "C", "D"],
        "correct_index": 0,
    }

    response = client.post("/api/quizzes/1/questions", json=payload)

    assert response.status_code == 401


def test_list_and_get_questions(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Geography Quiz")

    create_res = host_client.post(
        f"/api/quizzes/{quiz.id}/questions",
        json={
            "text": "Capital of Spain?",
            "options": ["Barcelona", "Madrid", "Seville", "Valencia"],
            "correct_index": 1,
            "source_note": "Atlas 2026",
        },
    )
    assert create_res.status_code == 201
    question_id = create_res.json()["id"]

    # List questions
    list_res = host_client.get(f"/api/quizzes/{quiz.id}/questions")
    assert list_res.status_code == 200
    questions = list_res.json()
    assert len(questions) == 1
    assert questions[0]["id"] == question_id
    assert questions[0]["source_note"] == "Atlas 2026"

    # Get single question
    get_res = host_client.get(f"/api/questions/{question_id}")
    assert get_res.status_code == 200
    assert get_res.json()["text"] == "Capital of Spain?"


def test_get_missing_question_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)

    response = host_client.get("/api/questions/9999")

    assert response.status_code == 404

