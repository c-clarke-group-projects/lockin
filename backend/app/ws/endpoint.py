"""The /ws endpoint: lobby part of docs/WEBSOCKET_PROTOCOL.md.

Built here: join, rejoin, host_join, kick, leave and the lobby broadcast.
The game loop messages (start, answer, next, end, flag, void) get wrong_phase
until the live play tasks T08 to T10 are built.
"""
import logging
from dataclasses import dataclass

from fastapi import APIRouter, Depends, WebSocket
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import QuizSession
from app.services import live_lobby, session_service
from app.services.live_lobby import LobbyError
from app.ws import messages
from app.ws.messages import BadMessage
from app.ws.rooms import registry, send_safely

logger = logging.getLogger(__name__)
router = APIRouter()

HOST_SCREENS = {"control", "big_screen"}


@dataclass
class Connection:
    socket: WebSocket
    db: Session
    role: str | None = None
    session_id: int | None = None
    participant_id: int | None = None
    host_id: int | None = None
    closed: bool = False


async def _db(conn: Connection, fn, *args):
    def run():
        conn.db.expire_all()
        return fn(conn.db, *args)

    return await run_in_threadpool(run)


def _room_for_code(db: Session, join_code: str, allow_running: bool) -> dict:
    session = live_lobby.session_for_code(db, join_code, allow_running)
    return {"session_id": session.id, "quiz_title": session.quiz.title}


def _host_room(db: Session, host_id: int, session_id: int) -> dict | None:
    session = session_service.get_host_session(db, host_id, session_id)
    if session is None:
        return None
    return {
        "quiz_title": session.quiz.title,
        "join_code": session.join_code,
        "status": session.status,
    }


def _session_status(db: Session, session_id: int) -> str | None:
    return db.scalar(select(QuizSession.status).where(QuizSession.id == session_id))


def _seat_id(db: Session, session_id: int, name: str) -> int | None:
    seat = live_lobby.find_seat(db, session_id, name)
    return seat.id if seat else None


def _add_seat(db: Session, session_id: int, name: str) -> int:
    return live_lobby.add_participant(db, session_id, name).id


async def _send(conn: Connection, message: dict) -> None:
    await send_safely(conn.socket, message)


async def _broadcast_lobby(conn: Connection, session_id: int) -> None:
    rows = await _db(conn, live_lobby.lobby_rows, session_id, registry.connected_ids(session_id))
    lobby = messages.build("lobby", session_id, {"participants": rows, "count": len(rows)})
    await registry.broadcast(session_id, lobby)


def _require_fresh(conn: Connection) -> None:
    if conn.role is not None:
        raise BadMessage("This connection has already joined a room.")


def _check_host(conn: Connection, token: str | None) -> None:
    if conn.role != "host" or token is None or decode_access_token(token) != conn.host_id:
        raise LobbyError("unauthorised", "Sign in again to control this room.")


async def handle_join(conn: Connection, message: dict) -> None:
    _require_fresh(conn)
    data = message["data"]
    join_code = messages.require_str(data, "join_code")
    name = live_lobby.clean_display_name(messages.require_str(data, "display_name"))
    room = await _db(conn, _room_for_code, join_code, False)
    session_id = room["session_id"]

    async with registry.room(session_id).lock:
        participant_id = await _db(conn, _add_seat, session_id, name)
        registry.take_seat(session_id, participant_id, conn.socket)

    conn.role, conn.session_id, conn.participant_id = "participant", session_id, participant_id
    await _send(conn, messages.build("joined", session_id, {
        "participant_id": participant_id,
        "display_name": name,
        "quiz_title": room["quiz_title"],
        "score": 0,
        "rejoined": False,
    }))
    await _broadcast_lobby(conn, session_id)


async def handle_rejoin(conn: Connection, message: dict) -> None:
    _require_fresh(conn)
    data = message["data"]
    join_code = messages.require_str(data, "join_code")
    name = live_lobby.clean_display_name(messages.require_str(data, "display_name"))
    room = await _db(conn, _room_for_code, join_code, True)
    session_id = room["session_id"]

    async with registry.room(session_id).lock:
        participant_id = await _db(conn, _seat_id, session_id, name)
        if participant_id is None:
            raise LobbyError("seat_not_found", "That name has not joined this room.")
        if registry.seat_socket(session_id, participant_id) is not None:
            raise LobbyError("seat_in_use", "That name is connected on another device.")
        registry.take_seat(session_id, participant_id, conn.socket)

    conn.role, conn.session_id, conn.participant_id = "participant", session_id, participant_id
    await _send(conn, messages.build("joined", session_id, {
        "participant_id": participant_id,
        "display_name": name,
        "quiz_title": room["quiz_title"],
        "score": 0,
        "rejoined": True,
    }))
    await _broadcast_lobby(conn, session_id)


async def handle_host_join(conn: Connection, message: dict) -> None:
    _require_fresh(conn)
    screen = messages.require_str(message["data"], "screen")
    if screen not in HOST_SCREENS:
        raise BadMessage("screen must be control or big_screen.")

    token, session_id = message["token"], message["session_id"]
    host_id = decode_access_token(token) if token else None
    room = None
    if host_id is not None and session_id is not None:
        room = await _db(conn, _host_room, host_id, session_id)
    if room is None:
        raise LobbyError("unauthorised", "Sign in again to open this room.")

    conn.role, conn.session_id, conn.host_id = "host", session_id, host_id
    registry.add_host(session_id, conn.socket)
    await _send(conn, messages.build("host_joined", session_id, {"screen": screen, **room}))
    rows = await _db(conn, live_lobby.lobby_rows, session_id, registry.connected_ids(session_id))
    await _send(conn, messages.build("lobby", session_id, {"participants": rows, "count": len(rows)}))


async def handle_kick(conn: Connection, message: dict) -> None:
    _check_host(conn, message["token"])
    participant_id = messages.require_int(message["data"], "participant_id")
    session_id = conn.session_id

    if await _db(conn, _session_status, session_id) != "waiting":
        raise LobbyError("wrong_phase", "Players can only be removed before the quiz starts.")

    await _db(conn, live_lobby.remove_participant, session_id, participant_id)
    socket = registry.seat_socket(session_id, participant_id)
    if socket is not None:
        registry.free_seat(session_id, participant_id, socket)
        await send_safely(socket, messages.error(
            "removed_by_host", "The host removed you from this room.", session_id
        ))
        await socket.close()
    logger.info("Host %s removed participant %s from session %s", conn.host_id, participant_id, session_id)
    await _broadcast_lobby(conn, session_id)


async def handle_leave(conn: Connection, message: dict) -> None:
    session_id = conn.session_id
    if conn.role == "participant":
        # Before the quiz starts, leaving frees the name so the person can join again.
        # A dropped connection keeps the seat for rejoin, see _drop.
        if await _db(conn, _session_status, session_id) == "waiting":
            await _db(conn, live_lobby.remove_participant, session_id, conn.participant_id)
        registry.free_seat(session_id, conn.participant_id, conn.socket)
        await _broadcast_lobby(conn, session_id)
    elif conn.role == "host":
        registry.remove_host(session_id, conn.socket)
    conn.role = None
    conn.closed = True
    await conn.socket.close()


async def handle_not_built(conn: Connection, message: dict) -> None:
    raise LobbyError("wrong_phase", "Starting and playing the quiz is not available yet.")


HANDLERS = {
    "join": handle_join,
    "rejoin": handle_rejoin,
    "host_join": handle_host_join,
    "kick": handle_kick,
    "leave": handle_leave,
    "start": handle_not_built,
    "answer": handle_not_built,
    "next": handle_not_built,
    "end": handle_not_built,
    "flag": handle_not_built,
    "void": handle_not_built,
}


async def _handle(conn: Connection, raw: str) -> None:
    try:
        message = messages.parse_envelope(raw)
    except BadMessage as exc:
        logger.info("Refused message on session %s: %s", conn.session_id, exc)
        await _send(conn, messages.error("bad_message", str(exc), conn.session_id))
        return

    message_type = message["type"]
    if conn.role is None and message_type not in messages.FIRST_MESSAGE_TYPES:
        await _send(conn, messages.error("not_joined", "Join a room first.", conn.session_id))
        return

    try:
        await HANDLERS[message_type](conn, message)
        logger.info("Handled %s on session %s", message_type, conn.session_id)
    except BadMessage as exc:
        await _send(conn, messages.error("bad_message", str(exc), conn.session_id))
    except LobbyError as exc:
        logger.info("%s on session %s returned %s", message_type, conn.session_id, exc.code)
        await _send(conn, messages.error(exc.code, exc.message, conn.session_id))


async def _drop(conn: Connection) -> None:
    if conn.role == "participant":
        registry.free_seat(conn.session_id, conn.participant_id, conn.socket)
        await _broadcast_lobby(conn, conn.session_id)
    elif conn.role == "host":
        registry.remove_host(conn.session_id, conn.socket)
    logger.info("Connection closed for %s on session %s", conn.role, conn.session_id)


@router.websocket("/ws")
async def live_socket(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    conn = Connection(socket=websocket, db=db)
    try:
        while not conn.closed:
            event = await websocket.receive()
            if event["type"] == "websocket.disconnect":
                break
            raw = event.get("text")
            if raw is None:
                raw = (event.get("bytes") or b"").decode("utf-8", errors="replace")
            await _handle(conn, raw)
    finally:
        await _drop(conn)
