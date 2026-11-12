"""Live connections per room, held in this process.

The live play plan (T03) puts this state in Redis behind a RoomStore. Until that
lands, 1 backend process holds it in memory, which matches the 1 process limit in
docs/ARCHITECTURE.md section 9.
"""
import asyncio
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class Room:
    seats: dict[int, WebSocket] = field(default_factory=dict)
    hosts: set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RoomRegistry:
    def __init__(self) -> None:
        self._rooms: dict[int, Room] = {}

    def room(self, session_id: int) -> Room:
        return self._rooms.setdefault(session_id, Room())

    def connected_ids(self, session_id: int) -> set[int]:
        return set(self.room(session_id).seats)

    def seat_socket(self, session_id: int, participant_id: int) -> WebSocket | None:
        return self.room(session_id).seats.get(participant_id)

    def take_seat(self, session_id: int, participant_id: int, socket: WebSocket) -> None:
        self.room(session_id).seats[participant_id] = socket

    def free_seat(self, session_id: int, participant_id: int, socket: WebSocket) -> None:
        seats = self.room(session_id).seats
        if seats.get(participant_id) is socket:
            del seats[participant_id]

    def add_host(self, session_id: int, socket: WebSocket) -> None:
        self.room(session_id).hosts.add(socket)

    def remove_host(self, session_id: int, socket: WebSocket) -> None:
        self.room(session_id).hosts.discard(socket)

    async def broadcast(self, session_id: int, message: dict) -> None:
        room = self.room(session_id)
        for socket in [*room.seats.values(), *room.hosts]:
            await send_safely(socket, message)


async def send_safely(socket: WebSocket, message: dict) -> None:
    """Send and log a failure. A dead socket is cleaned up by its own receive loop."""
    try:
        await socket.send_json(message)
    except Exception as exc:
        logger.info("Skipped %s to a closed socket: %s", message.get("type"), exc)


registry = RoomRegistry()
