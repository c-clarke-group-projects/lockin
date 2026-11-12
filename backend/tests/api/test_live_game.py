from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_access_token
from app.models.entities import Answer, Host, Question, Quiz, QuizSession

HOST_ID = 1
JOIN_CODE = "012345"

# TestClient runs each WebSocket on its own event loop. As in test_live_lobby.py,
# each step reads the socket that sent a message first, which proves its handler
# has finished, then reads the other sockets.


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret-of-at-least-32-bytes-long")


def make_room(db_session: Session, time_limits: list[int]) -> QuizSession:
    db_session.add(Host(id=HOST_ID, email="host@example.test", password_hash="x"))
    quiz = Quiz(host_id=HOST_ID, title="Cells", created_at=datetime(2026, 11, 1))
    db_session.add(quiz)
    db_session.flush()
    for number, seconds in enumerate(time_limits, start=1):
        db_session.add(Question(
            quiz_id=quiz.id,
            text=f"Question {number}?",
            options=["A", "B", "C", "D"],
            correct_index=1,
            time_limit=seconds,
            source_snippet=f"Note {number}",
            origin="manual",
        ))
    session = QuizSession(quiz_id=quiz.id, join_code=JOIN_CODE, status="waiting")
    db_session.add(session)
    db_session.commit()
    return session


@pytest.fixture
def room(db_session: Session) -> QuizSession:
    return make_room(db_session, [20, 20])


def send(ws, message_type: str, data: dict, session_id=None, token=None) -> None:
    message = {"type": message_type, "session_id": session_id, "data": data}
    if token is not None:
        message["token"] = token
    ws.send_json(message)


def host_in(ws, room: QuizSession) -> str:
    token = create_access_token(HOST_ID)
    send(ws, "host_join", {"screen": "control"}, room.id, token)
    ws.receive_json()
    ws.receive_json()
    return token


def phone_in(ws, host, name: str) -> int:
    send(ws, "join", {"join_code": JOIN_CODE, "display_name": name})
    joined = ws.receive_json()
    ws.receive_json()
    host.receive_json()
    return joined["data"]["participant_id"]


def test_a_2_question_game_runs_from_start_to_ended(client, db_session: Session, room) -> None:
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana, client.websocket_connect("/ws") as ben:
            phone_in(ana, host, "Ana")
            phone_in(ben, host, "Ben")
            ana.receive_json()

            send(host, "start", {}, room.id, token)
            question = host.receive_json()
            assert question["type"] == "question"
            assert question["data"]["number"] == 1 and question["data"]["total"] == 2
            assert "correct_index" not in question["data"]
            assert question["data"]["remaining_ms"] == question["data"]["time_limit_ms"] == 20000
            assert ana.receive_json()["type"] == ben.receive_json()["type"] == "question"
            question_id = question["data"]["question_id"]

            send(ana, "answer", {"question_id": question_id, "option": 1}, room.id)
            assert ana.receive_json()["data"] == {"for": "answer", "question_id": question_id}
            assert host.receive_json()["data"]["answered"] == 1

            send(ben, "answer", {"question_id": question_id, "option": 3}, room.id)
            assert ben.receive_json()["type"] == "ack"
            assert ben.receive_json()["data"]["reason"] == "all_answered"
            ben_reveal = ben.receive_json()["data"]
            assert ben_reveal["correct_index"] == 1
            assert ben_reveal["distribution"] == [0, 1, 0, 1]
            assert ben_reveal["you"] == {"chosen_index": 3, "is_correct": False, "points": 0}
            assert ana.receive_json()["type"] == "locked"
            ana_reveal = ana.receive_json()["data"]
            assert ana_reveal["you"]["is_correct"] is True
            assert ana_reveal["you"]["points"] > 500
            assert ana_reveal["source"] == {"page_number": None, "snippet": "Note 1"}
            assert [host.receive_json()["type"] for _ in range(3)] == ["answer_count", "locked", "reveal"]

            send(host, "next", {}, room.id, token)
            board = host.receive_json()
            assert board["type"] == "leaderboard"
            assert [row["display_name"] for row in board["data"]["top"]] == ["Ana", "Ben"]
            assert "you" not in board["data"]
            assert ana.receive_json()["data"]["you"]["rank"] == 1
            assert ben.receive_json()["data"]["you"] == {"rank": 2, "score": 0}

            send(host, "next", {}, room.id, token)
            second = host.receive_json()
            assert second["data"]["number"] == 2
            ana.receive_json()
            ben.receive_json()

            send(host, "end", {}, room.id, token)
            ended = host.receive_json()
            assert ended["type"] == "ended" and ended["data"]["reason"] == "ended_by_host"
            assert ana.receive_json()["type"] == "ended"

            send(ana, "answer", {"question_id": second["data"]["question_id"], "option": 1}, room.id)
            assert ana.receive_json()["data"]["code"] == "room_closed"

    db_session.expire_all()
    assert db_session.get(QuizSession, room.id).status == "ended"


def test_finishing_the_last_question_ends_with_finished(client, db_session: Session) -> None:
    room = make_room(db_session, [20])
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana:
            phone_in(ana, host, "Ana")
            send(host, "start", {}, room.id, token)
            question_id = host.receive_json()["data"]["question_id"]
            ana.receive_json()

            send(ana, "answer", {"question_id": question_id, "option": 1}, room.id)
            assert [ana.receive_json()["type"] for _ in range(3)] == ["ack", "locked", "reveal"]
            for _ in range(3):
                host.receive_json()

            send(host, "next", {}, room.id, token)
            host.receive_json()
            ana.receive_json()
            send(host, "next", {}, room.id, token)
            ended = host.receive_json()
            ana_ended = ana.receive_json()

    assert ended["data"]["reason"] == "finished"
    assert ana_ended["data"]["you"]["rank"] == 1
    db_session.expire_all()
    assert db_session.get(QuizSession, room.id).status == "ended"


def test_a_second_answer_is_ignored(client, db_session: Session, room) -> None:
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana, client.websocket_connect("/ws") as ben:
            phone_in(ana, host, "Ana")
            phone_in(ben, host, "Ben")
            ana.receive_json()
            send(host, "start", {}, room.id, token)
            question_id = host.receive_json()["data"]["question_id"]
            ana.receive_json()

            send(ana, "answer", {"question_id": question_id, "option": 1}, room.id)
            ana.receive_json()
            send(ana, "answer", {"question_id": question_id, "option": 2}, room.id)
            send(ana, "leave", {}, room.id)
            # The next thing Ana gets is the close, so the second answer got no reply.
            with pytest.raises(WebSocketDisconnect):
                ana.receive_json()

    rows = db_session.scalars(select(Answer).where(Answer.question_id == question_id)).all()
    assert [(row.chosen_index, row.is_correct) for row in rows if row.chosen_index is not None] == [(1, True)]


def test_the_timer_locks_a_question_nobody_answered(client, db_session: Session) -> None:
    room = make_room(db_session, [1])
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana:
            phone_in(ana, host, "Ana")
            send(host, "start", {}, room.id, token)
            host.receive_json()
            locked = host.receive_json()
            reveal = host.receive_json()

    assert locked["data"]["reason"] == "timer"
    assert reveal["data"]["no_answer"] == 1
    row = db_session.scalars(select(Answer)).one()
    assert row.chosen_index is None and row.points == 0


def test_only_the_host_can_start(client, room) -> None:
    with client.websocket_connect("/ws") as host:
        host_in(host, room)
        with client.websocket_connect("/ws") as ana:
            phone_in(ana, host, "Ana")
            send(ana, "start", {}, room.id, "not-a-token")
            reply = ana.receive_json()

    assert reply["data"]["code"] == "unauthorised"


def test_a_new_name_cannot_join_after_the_start(client, room) -> None:
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana:
            phone_in(ana, host, "Ana")
            send(host, "start", {}, room.id, token)
            host.receive_json()
            with client.websocket_connect("/ws") as late:
                send(late, "join", {"join_code": JOIN_CODE, "display_name": "Late"})
                reply = late.receive_json()

    assert reply["data"]["code"] == "wrong_phase"


def test_a_phone_that_rejoins_gets_the_current_question(client, room) -> None:
    with client.websocket_connect("/ws") as host:
        token = host_in(host, room)
        with client.websocket_connect("/ws") as ana:
            phone_in(ana, host, "Ana")
            send(host, "start", {}, room.id, token)
            question = host.receive_json()
            ana.receive_json()

        with client.websocket_connect("/ws") as again:
            send(again, "rejoin", {"join_code": JOIN_CODE, "display_name": "Ana"})
            joined = again.receive_json()
            state = again.receive_json()

    assert joined["data"]["rejoined"] is True and joined["data"]["score"] == 0
    assert state["type"] == "question"
    assert state["data"]["question_id"] == question["data"]["question_id"]
    assert 0 <= state["data"]["remaining_ms"] <= 20000
