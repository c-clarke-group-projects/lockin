"""Envelope checks and builders for docs/WEBSOCKET_PROTOCOL.md sections 2 to 4."""
import json
from typing import Any

MAX_MESSAGE_BYTES = 2048

CLIENT_TYPES = {
    "join",
    "rejoin",
    "host_join",
    "start",
    "answer",
    "next",
    "end",
    "flag",
    "void",
    "kick",
    "leave",
}
FIRST_MESSAGE_TYPES = {"join", "rejoin", "host_join"}


class BadMessage(Exception):
    pass


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def parse_envelope(raw: str) -> dict:
    if len(raw.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise BadMessage("Messages must be 2 KB or smaller.")
    try:
        message = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BadMessage("The message is not valid JSON.") from exc
    if not isinstance(message, dict):
        raise BadMessage("The message must be a JSON object.")

    message_type = message.get("type")
    if message_type not in CLIENT_TYPES:
        raise BadMessage("Unknown message type.")

    data = message.get("data")
    if not isinstance(data, dict):
        raise BadMessage("data must be an object.")

    session_id = message.get("session_id")
    if session_id is not None and not _is_int(session_id):
        raise BadMessage("session_id must be an integer or null.")

    token = message.get("token")
    if token is not None and not isinstance(token, str):
        raise BadMessage("token must be a string.")

    return {"type": message_type, "session_id": session_id, "token": token, "data": data}


def require_str(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise BadMessage(f"{key} must be a string.")
    return value


def require_int(data: dict, key: str) -> int:
    value = data.get(key)
    if not _is_int(value):
        raise BadMessage(f"{key} must be an integer.")
    return value


def build(message_type: str, session_id: int | None, data: dict) -> dict:
    return {"type": message_type, "session_id": session_id, "data": data}


def error(code: str, message: str, session_id: int | None = None) -> dict:
    return build("error", session_id, {"code": code, "message": message})
