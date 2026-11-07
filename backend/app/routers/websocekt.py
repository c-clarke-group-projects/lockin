import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List

router = APIRouter()

# Simple in-memory ConnectionManager for active WebSocket connections
class ConnectionManager:
    def __init__(self):
        # Format: { session_id: { "host": WebSocket, "participants": { participant_id: WebSocket } } }
        self.active_rooms: Dict[str, Dict] = {}
        # Stores participants details per session: { session_id: [ {"id": str, "name": str} ] }
        self.participants: Dict[str, List[dict]] = {}

    async def connect_host(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_rooms:
            self.active_rooms[session_id] = {"host": None, "participants": {}}
            self.participants[session_id] = []
        self.active_rooms[session_id]["host"] = websocket
        # Sync current participants to host on connect
        await websocket.send_json({
            "event": "lobby_state",
            "participants": self.participants.get(session_id, [])
        })

    async def connect_participant(self, session_id: str, participant_id: str, display_name: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_rooms:
            self.active_rooms[session_id] = {"host": None, "participants": {}}
            self.participants[session_id] = []

        self.active_rooms[session_id]["participants"][participant_id] = websocket
        self.participants[session_id].append({"id": participant_id, "name": display_name})

        # Broadcast updated list to Host
        await self.broadcast_participant_list(session_id)

    async def disconnect_participant(self, session_id: str, participant_id: str):
        if session_id in self.active_rooms:
            self.active_rooms[session_id]["participants"].pop(participant_id, None)
            self.participants[session_id] = [
                p for p in self.participants.get(session_id, []) if p["id"] != participant_id
            ]
            await self.broadcast_participant_list(session_id)

    async def broadcast_participant_list(self, session_id: str):
        host_ws = self.active_rooms.get(session_id, {}).get("host")
        if host_ws:
            await host_ws.send_json({
                "event": "participant_list_updated",
                "participants": self.participants.get(session_id, [])
            })

    async def kick_participant(self, session_id: str, participant_id: str):
        if session_id in self.active_rooms:
            participant_ws = self.active_rooms[session_id]["participants"].get(participant_id)
            if participant_ws:
                await participant_ws.send_json({"event": "kicked"})
                await participant_ws.close()
            await self.disconnect_participant(session_id, participant_id)

    async def broadcast_to_room(self, session_id: str, message: dict):
        room = self.active_rooms.get(session_id, {})
        # Send to host
        if room.get("host"):
            await room["host"].send_json(message)
        # Send to all participants
        for ws in room.get("participants", {}).values():
            await ws.send_json(message)

manager = ConnectionManager()

@websocket_router.websocket("/ws/quiz/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, role: str, participant_id: str = None, display_name: str = None):
    if role == "host":
        await manager.connect_host(session_id, websocket)
        try:
            while True:
                data = await websocket.receive_json()
                event = data.get("event")

                if event == "kick_participant":
                    target_id = data.get("participant_id")
                    await manager.kick_participant(session_id, target_id)

                elif event == "start_quiz":
                    await manager.broadcast_to_room(session_id, {
                        "event": "quiz_started",
                        "status": "in_progress",
                        "current_question_index": 0
                    })

                elif event == "next_question":
                    next_index = data.get("next_index")
                    await manager.broadcast_to_room(session_id, {
                        "event": "question_advanced",
                        "current_question_index": next_index
                    })
        except WebSocketDisconnect:
            pass

    elif role == "participant":
        await manager.connect_participant(session_id, participant_id, display_name, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            await manager.disconnect_participant(session_id, participant_id)




    elif event == "reveal_question":
     question_id = data.get("question_id")
    
    # 1. Fetch question and source snippet from PostgreSQL
    # query = db.query(Question).filter(Question.id == question_id).first()
    # For demonstration, assume we retrieve:
    # correct_index = query.correct_index
    # source_page = query.source_page_id
    # source_snippet = query.source_snippet

    # 2. Calculate answer distribution from Redis / answers table
    # Example distribution format: { "0": 5, "1": 12, "2": 2, "3": 3 }
    distribution = {"0": 5, "1": 12, "2": 2, "3": 3} # placeholder logic

    await manager.broadcast_to_room(session_id, {
        "event": "question_revealed",
        "question_id": question_id,
        "correct_index": 1, # Example correct option index
        "distribution": distribution,
        "source_page": 14,
        "source_snippet": "The mitochondria is the powerhouse of the cell, responsible for generating chemical energy."
    })




# Add this event handler inside your host WebSocket loop in backend/app/routers/websocket.py

