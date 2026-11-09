from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entities import Flag, Host, Participant, Question, Quiz, QuizSession


def add_host(db_session: Session, host_id: int) -> None:
    db_session.add(
        Host(
            id=host_id,
            email=f"host-{host_id}@example.test",
            password_hash="test-hash",
        )
    )
    db_session.commit()


def add_quiz(db_session: Session, host_id: int) -> Quiz:
    quiz = Quiz(
        host_id=host_id,
        title="Flagged quiz",
        created_at=datetime(2026, 11, 1),
    )
    db_session.add(quiz)
    db_session.commit()
    return quiz


def add_question(db_session: Session, quiz_id: int, text: str) -> Question:
    question = Question(
        quiz_id=quiz_id,
        text=text,
        options=["A", "B", "C", "D"],
        correct_index=1,
        time_limit=30,
        source_snippet="Source excerpt",
        origin="manual",
    )
    db_session.add(question)
    db_session.commit()
    return question


def test_host_session_flags_grouped_by_question(host_client, db_session: Session) -> None:
    add_host(db_session, 1)
    quiz = add_quiz(db_session, 1)
    first_question = add_question(db_session, quiz.id, "First question")
    second_question = add_question(db_session, quiz.id, "Second question")
    session = QuizSession(quiz_id=quiz.id, join_code="123456", status="ended")
    db_session.add(session)
    db_session.flush()
    participants = [
        Participant(session_id=session.id, display_name="Learner 1"),
        Participant(session_id=session.id, display_name="Learner 2"),
        Participant(session_id=session.id, display_name="Learner 3"),
    ]
    db_session.add_all(participants)
    db_session.flush()
    db_session.add_all(
        [
            Flag(session_id=session.id, question_id=first_question.id, participant_id=participants[0].id),
            Flag(session_id=session.id, question_id=first_question.id, participant_id=participants[1].id),
            Flag(session_id=session.id, question_id=second_question.id, participant_id=participants[2].id),
        ]
    )
    db_session.commit()

    response = host_client.get(f"/api/flags/sessions/{session.id}/flags")

    assert response.status_code == 200
    data = response.json()
    assert data["total_flags"] == 3
    assert [
        (question["question_id"], question["flag_count"])
        for question in data["flagged_questions"]
    ] == [(first_question.id, 2), (second_question.id, 1)]
    assert data["flagged_questions"][0]["options"] == ["A", "B", "C", "D"]


def test_session_flags_require_host_ownership(host_client, db_session: Session) -> None:
    add_host(db_session, 1)
    add_host(db_session, 2)
    quiz = add_quiz(db_session, 2)
    session = QuizSession(quiz_id=quiz.id, join_code="123456", status="ended")
    db_session.add(session)
    db_session.commit()

    response = host_client.get(f"/api/flags/sessions/{session.id}/flags")

    assert response.status_code == 404


def test_question_edit_requires_authentication(client, db_session: Session) -> None:
    add_host(db_session, 1)
    quiz = add_quiz(db_session, 1)
    question = add_question(db_session, quiz.id, "Original question")
    payload = {
        "text": "Updated question",
        "options": ["One", "Two", "Three", "Four"],
        "correct_index": 2,
        "time_limit": 45,
    }

    assert client.put(f"/api/questions/{question.id}", json=payload).status_code == 401


def test_host_can_edit_owned_question(host_client, db_session: Session) -> None:
    add_host(db_session, 1)
    quiz = add_quiz(db_session, 1)
    question = add_question(db_session, quiz.id, "Original question")
    payload = {
        "text": "Updated question",
        "options": ["One", "Two", "Three", "Four"],
        "correct_index": 2,
        "time_limit": 45,
    }

    response = host_client.put(f"/api/questions/{question.id}", json=payload)

    assert response.status_code == 200
    assert response.json()["text"] == "Updated question"
    assert response.json()["correct_index"] == 2
    assert db_session.get(Question, question.id).options == payload["options"]


def test_host_cannot_edit_another_hosts_question(host_client, db_session: Session) -> None:
    add_host(db_session, 1)
    add_host(db_session, 2)
    quiz = add_quiz(db_session, 2)
    question = add_question(db_session, quiz.id, "Private question")

    response = host_client.put(
        f"/api/questions/{question.id}",
        json={
            "text": "Changed question",
            "options": ["One", "Two", "Three", "Four"],
            "correct_index": 2,
            "time_limit": 45,
        },
    )

    assert response.status_code == 404
    assert db_session.get(Question, question.id).text == "Private question"
