"""The /ws endpoint for docs/WEBSOCKET_PROTOCOL.md.

Built here: join, rejoin, host_join, kick, leave, the lobby broadcast and the game
loop (start, answer, next, end). flag and void get wrong_phase until they are built.
"""
import asyncio
import logging
from dataclasses import asdict, dataclass

from fastapi import APIRouter, Depends, WebSocket
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import QuizSession
from app.services import live_game, live_lobby, session_service
from app.services.live_lobby import LobbyError
from app.services.scoring import calculate_score
from app.ws import game as live
from app.ws import messages
from app.ws.game import ChosenAnswer, Game, games
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


# Sessions between the start check and the game being created, so 2 starts
# cannot both pass, and lock timers kept referenced until they finish.
_starting: set[int] = set()
_timers: set[asyncio.Task] = set()


async def _run(db: Session, fn, *args):
    def run():
        db.expire_all()
        return fn(db, *args)

    return await run_in_threadpool(run)


async def _db(conn: Connection, fn, *args):
    return await _run(conn.db, fn, *args)


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
    # Once the game runs a lobby message would send every phone back to the lobby.
    if session_id in games:
        return
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
    if session_id in games or session_id in _starting:
        raise LobbyError("wrong_phase", "The quiz has already started.")

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
    score = await _db(conn, live_game.participant_score, participant_id)
    await _send(conn, messages.build("joined", session_id, {
        "participant_id": participant_id,
        "display_name": name,
        "quiz_title": room["quiz_title"],
        "score": score,
        "rejoined": True,
    }))
    current = games.get(session_id)
    if current is not None:
        await _send(conn, live.state_message(current, participant_id))
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
    current = games.get(session_id)
    if current is not None:
        await _send(conn, live.state_message(current, None))
        return
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


async def _send_each(session_id: int, build) -> None:
    """Send every seat and host screen its own copy, for messages that carry you."""
    room = registry.room(session_id)
    for participant_id, socket in list(room.seats.items()):
        await send_safely(socket, build(participant_id))
    for socket in list(room.hosts):
        await send_safely(socket, build(None))


async def _send_hosts(session_id: int, message: dict) -> None:
    for socket in list(registry.room(session_id).hosts):
        await send_safely(socket, message)


def _everyone_answered(current: Game) -> bool:
    connected = registry.connected_ids(current.session_id)
    return bool(connected) and connected <= set(current.answers)


async def _lock(db: Session, current: Game, reason: str, round_number: int | None = None) -> None:
    if not current.try_lock(reason, round_number):
        return
    session_id, question_id = current.session_id, current.current["question_id"]
    logger.info("Locked question %s on session %s: %s", question_id, session_id, reason)
    await registry.broadcast(session_id, live.locked_message(current, reason))
    answers = {pid: asdict(answer) for pid, answer in current.answers.items()}
    current.seat_count = await _run(db, live_game.close_question, session_id, question_id, answers)
    if current.phase == live.LOCKED:
        current.phase = live.REVEAL
        await _send_each(session_id, lambda pid: live.reveal_message(current, pid))


async def _lock_when_time_is_up(db: Session, current: Game, round_number: int) -> None:
    try:
        await asyncio.sleep(current.current["time_limit_ms"] / 1000)
        await _lock(db, current, "timer", round_number)
    except Exception:
        logger.exception("Lock timer failed on session %s", current.session_id)


async def _ask_question(db: Session, current: Game, index: int) -> None:
    round_number = current.open_question(index)
    logger.info("Session %s question %s of %s", current.session_id, index + 1, len(current.questions))
    await registry.broadcast(current.session_id, live.question_message(current))
    task = asyncio.create_task(_lock_when_time_is_up(db, current, round_number))
    _timers.add(task)
    task.add_done_callback(_timers.discard)


async def _finish(db: Session, current: Game, reason: str) -> None:
    if current.phase == live.ENDED:
        return
    # Ending during a question still saves the answers already given to it.
    open_question = current.phase == live.QUESTION
    current.phase, current.end_reason = live.ENDED, reason
    if open_question:
        answers = {pid: asdict(answer) for pid, answer in current.answers.items()}
        await _run(db, live_game.close_question, current.session_id,
                   current.current["question_id"], answers)
    await _run(db, live_game.end_session, current.session_id)
    current.standings = await _run(db, live_game.standings, current.session_id)
    await _send_each(current.session_id, lambda pid: live.ended_message(current, pid))


async def handle_start(conn: Connection, message: dict) -> None:
    _check_host(conn, message["token"])
    session_id = conn.session_id
    if session_id in games or session_id in _starting:
        raise LobbyError("wrong_phase", "The quiz has already started.")
    if not registry.connected_ids(session_id):
        raise LobbyError("no_participants", "Wait for at least 1 player to join.")

    _starting.add(session_id)
    try:
        if await _db(conn, _session_status, session_id) != "waiting":
            raise LobbyError("wrong_phase", "The quiz has already started.")
        questions = await _db(conn, live_game.start_session, session_id)
        if not questions:
            raise LobbyError("wrong_phase", "Add at least 1 question before starting.")
        current = games[session_id] = Game(session_id=session_id, questions=questions)
    finally:
        _starting.discard(session_id)
    await _ask_question(conn.db, current, 0)


async def handle_answer(conn: Connection, message: dict) -> None:
    data = message["data"]
    question_id = messages.require_int(data, "question_id")
    option = messages.require_int(data, "option")
    if not 0 <= option <= 3:
        raise BadMessage("option must be 0 to 3.")

    current, participant_id = games.get(conn.session_id), conn.participant_id
    if (
        conn.role != "participant"
        or current is None
        or current.phase != live.QUESTION
        or current.current["question_id"] != question_id
        or participant_id in current.answers
    ):
        logger.info("Skipped answer from %s to question %s", participant_id, question_id)
        return

    question = current.current
    answer_ms = live.now_ms() - current.sent_at
    if answer_ms > question["time_limit_ms"]:
        logger.info("Skipped late answer from %s after %s ms", participant_id, answer_ms)
        return
    is_correct = option == question["correct_index"]
    points = calculate_score(is_correct, answer_ms, question["time_limit_ms"] // 1000)
    current.answers[participant_id] = ChosenAnswer(option, is_correct, answer_ms, points)

    session_id = conn.session_id
    await _send(conn, messages.build("ack", session_id, {"for": "answer", "question_id": question_id}))
    await _send_hosts(session_id, messages.build("answer_count", session_id, {
        "question_id": question_id,
        "answered": len(current.answers),
        "connected": len(registry.connected_ids(session_id)),
    }))
    if _everyone_answered(current):
        await _lock(conn.db, current, "all_answered")


async def handle_next(conn: Connection, message: dict) -> None:
    _check_host(conn, message["token"])
    current = games.get(conn.session_id)
    if current is None or current.phase not in (live.REVEAL, live.LEADERBOARD):
        raise LobbyError("wrong_phase", "Next works after the answers are revealed.")

    if current.phase == live.REVEAL:
        current.phase = live.LEADERBOARD
        current.standings = await _db(conn, live_game.standings, conn.session_id)
        await _send_each(conn.session_id, lambda pid: live.leaderboard_message(current, pid))
    elif current.is_last:
        await _finish(conn.db, current, "finished")
    else:
        await _ask_question(conn.db, current, current.index + 1)


async def handle_end(conn: Connection, message: dict) -> None:
    _check_host(conn, message["token"])
    current = games.get(conn.session_id)
    if current is None:
        current = games[conn.session_id] = Game(session_id=conn.session_id, questions=[])
    await _finish(conn.db, current, "ended_by_host")


async def handle_not_built(conn: Connection, message: dict) -> None:
    raise LobbyError("wrong_phase", "Flags and voiding are not available yet.")


HANDLERS = {
    "join": handle_join,
    "rejoin": handle_rejoin,
    "host_join": handle_host_join,
    "kick": handle_kick,
    "leave": handle_leave,
    "start": handle_start,
    "answer": handle_answer,
    "next": handle_next,
    "end": handle_end,
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
    current = games.get(conn.session_id)
    if current is not None and current.phase == live.ENDED and message_type != "leave":
        await _send(conn, messages.error("room_closed", "This quiz has ended.", conn.session_id))
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
        current = games.get(conn.session_id)
        if current is not None and current.phase == live.QUESTION and _everyone_answered(current):
            await _lock(conn.db, current, "all_answered")
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
