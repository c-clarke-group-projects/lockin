from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_access_token
from app.models.entities import Host, Participant, Quiz, QuizSession

HOST_ID = 1
OTHER_HOST_ID = 2
JOIN_CODE = "012345"


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret-of-at-least-32-bytes-long")


@pytest.fixture
def room(db_session: Session) -> QuizSession:
    for host_id in (HOST_ID, OTHER_HOST_ID):
        db_session.add(Host(id=host_id, email=f"h{host_id}@example.test", password_hash="x"))
    quiz = Quiz(host_id=HOST_ID, title="Cells", created_at=datetime(2026, 11, 1))
    db_session.add(quiz)
    db_session.flush()
    session = QuizSession(quiz_id=quiz.id, join_code=JOIN_CODE, status="waiting")
    db_session.add(session)
    db_session.commit()
    return session


# TestClient runs each WebSocket on its own event loop. A test must not wait on 1
# socket for a message that another socket's handler is still sending, or the wait
# never wakes. So each test first reads a reply on the socket that sent the
# message, which proves the broadcast is finished, then reads the other sockets.


def send(ws, message_type: str, data: dict, session_id=None, token=None) -> None:
    message = {"type": message_type, "session_id": session_id, "data": data}
    if token is not None:
        message["token"] = token
    ws.send_json(message)


def join(ws, name: str, code: str = JOIN_CODE) -> dict:
    send(ws, "join", {"join_code": code, "display_name": name})
    return ws.receive_json()


def test_join_replies_joined_then_lobby(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as ws:
        joined = join(ws, "  Ana  ")
        lobby = ws.receive_json()

    assert joined["type"] == "joined"
    assert joined["session_id"] == room.id
    assert joined["data"]["display_name"] == "Ana"
    assert joined["data"]["quiz_title"] == "Cells"
    assert joined["data"]["rejoined"] is False
    assert lobby["type"] == "lobby"
    assert lobby["data"]["count"] == 1
    assert lobby["data"]["participants"][0]["display_name"] == "Ana"


def test_second_join_updates_lobby_for_everyone(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as first:
        join(first, "Ana")
        first.receive_json()
        with client.websocket_connect("/ws") as second:
            join(second, "Ben")
            second_lobby = second.receive_json()
            first_lobby = first.receive_json()

    names = [p["display_name"] for p in first_lobby["data"]["participants"]]
    assert names == ["Ana", "Ben"]
    assert second_lobby["data"]["count"] == 2


def test_same_name_in_other_case_is_taken(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as first:
        join(first, "Ana")
        first.receive_json()
        with client.websocket_connect("/ws") as second:
            reply = join(second, "ana")

    assert reply["type"] == "error"
    assert reply["data"]["code"] == "name_taken"


@pytest.mark.parametrize(
    ("code", "name", "expected"),
    [
        ("999999", "Ana", "room_not_found"),
        (JOIN_CODE, "   ", "name_invalid"),
        (JOIN_CODE, "x" * 21, "name_invalid"),
    ],
)
def test_join_errors(client, room: QuizSession, code: str, name: str, expected: str) -> None:
    with client.websocket_connect("/ws") as ws:
        reply = join(ws, name, code)

    assert reply["data"]["code"] == expected


def test_join_to_running_and_ended_rooms(client, db_session: Session, room: QuizSession) -> None:
    room.status = "running"
    db_session.commit()
    with client.websocket_connect("/ws") as ws:
        assert join(ws, "Ana")["data"]["code"] == "wrong_phase"

    room.status = "ended"
    db_session.commit()
    with client.websocket_connect("/ws") as ws:
        assert join(ws, "Ana")["data"]["code"] == "room_closed"


def test_first_message_must_join(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as ws:
        send(ws, "answer", {"question_id": 1, "option": 2})
        reply = ws.receive_json()

    assert reply["data"]["code"] == "not_joined"


def test_bad_messages_keep_the_connection_open(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as ws:
        ws.send_text("{not json")
        assert ws.receive_json()["data"]["code"] == "bad_message"
        ws.send_text('{"type": "join", "session_id": null, "data": {"pad": "' + "x" * 3000 + '"}}')
        assert ws.receive_json()["data"]["code"] == "bad_message"
        send(ws, "join", {"join_code": 12345, "display_name": "Ana"})
        assert ws.receive_json()["data"]["code"] == "bad_message"
        assert join(ws, "Ana")["type"] == "joined"


def test_host_join_sends_room_details_and_lobby(client, room: QuizSession) -> None:
    token = create_access_token(HOST_ID)
    with client.websocket_connect("/ws") as host:
        send(host, "host_join", {"screen": "control"}, room.id, token)
        host_joined = host.receive_json()
        lobby = host.receive_json()
        with client.websocket_connect("/ws") as phone:
            join(phone, "Ana")
            phone.receive_json()
            update = host.receive_json()

    assert host_joined["data"] == {
        "screen": "control",
        "quiz_title": "Cells",
        "join_code": JOIN_CODE,
        "status": "waiting",
    }
    assert lobby["data"]["count"] == 0
    assert update["data"]["participants"][0]["display_name"] == "Ana"


@pytest.mark.parametrize("token_host", [None, OTHER_HOST_ID])
def test_host_join_refuses_missing_or_foreign_token(client, room: QuizSession, token_host) -> None:
    token = create_access_token(token_host) if token_host else None
    with client.websocket_connect("/ws") as host:
        send(host, "host_join", {"screen": "control"}, room.id, token)
        reply = host.receive_json()

    assert reply["data"]["code"] == "unauthorised"


def test_kick_removes_player_and_frees_the_name(
    client, db_session: Session, room: QuizSession
) -> None:
    token = create_access_token(HOST_ID)
    with client.websocket_connect("/ws") as host:
        send(host, "host_join", {"screen": "control"}, room.id, token)
        host.receive_json()
        host.receive_json()
        with client.websocket_connect("/ws") as phone:
            participant_id = join(phone, "Ana")["data"]["participant_id"]
            phone.receive_json()
            host.receive_json()

            send(host, "kick", {"participant_id": participant_id}, room.id, token)
            lobby = host.receive_json()
            removed = phone.receive_json()

    assert removed["data"]["code"] == "removed_by_host"
    assert lobby["data"]["count"] == 0
    assert db_session.scalars(select(Participant)).all() == []


def test_kick_without_host_token_is_unauthorised(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as host:
        send(host, "host_join", {"screen": "control"}, room.id, create_access_token(HOST_ID))
        host.receive_json()
        host.receive_json()
        send(host, "kick", {"participant_id": 1}, room.id)
        reply = host.receive_json()

    assert reply["data"]["code"] == "unauthorised"


def test_leave_before_start_frees_the_name(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as first:
        join(first, "Ana")
        first.receive_json()
        send(first, "leave", {}, room.id)
        # The server closes the socket once leave is handled. Leaving the block
        # earlier can cancel the handler before the name is freed.
        with pytest.raises(WebSocketDisconnect):
            first.receive_json()

    with client.websocket_connect("/ws") as again:
        assert join(again, "Ana")["type"] == "joined"


def test_dropped_phone_can_rejoin_its_seat(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as first:
        participant_id = join(first, "Ana")["data"]["participant_id"]
        first.receive_json()

    with client.websocket_connect("/ws") as again:
        send(again, "rejoin", {"join_code": JOIN_CODE, "display_name": "ANA"})
        joined = again.receive_json()

    assert joined["data"]["rejoined"] is True
    assert joined["data"]["participant_id"] == participant_id


def test_rejoin_errors(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as first:
        join(first, "Ana")
        first.receive_json()
        with client.websocket_connect("/ws") as second:
            send(second, "rejoin", {"join_code": JOIN_CODE, "display_name": "Ana"})
            in_use = second.receive_json()
            send(second, "rejoin", {"join_code": JOIN_CODE, "display_name": "Ben"})
            missing = second.receive_json()

    assert in_use["data"]["code"] == "seat_in_use"
    assert missing["data"]["code"] == "seat_not_found"


def test_start_with_nobody_in_the_lobby_is_refused(client, room: QuizSession) -> None:
    with client.websocket_connect("/ws") as host:
        send(host, "host_join", {"screen": "control"}, room.id, create_access_token(HOST_ID))
        host.receive_json()
        host.receive_json()
        send(host, "start", {}, room.id, create_access_token(HOST_ID))
        reply = host.receive_json()

    assert reply["data"]["code"] == "no_participants"
