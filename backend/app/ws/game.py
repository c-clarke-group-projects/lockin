"""Live game state per room, held in this process like app.ws.rooms.

Phases follow docs/WEBSOCKET_PROTOCOL.md section 5. Every phase change happens in
1 synchronous step with no await in between, so 2 messages handled at the same
time cannot both pass the same phase check.
"""
import time
from dataclasses import dataclass, field

from app.services.live_game import LEADERBOARD_SIZE
from app.ws import messages

QUESTION, LOCKED, REVEAL, LEADERBOARD, ENDED = "question", "locked", "reveal", "leaderboard", "ended"


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class ChosenAnswer:
    chosen_index: int
    is_correct: bool
    points: int


@dataclass
class Game:
    session_id: int
    questions: list[dict]
    phase: str = QUESTION
    index: int = 0
    round: int = 0
    sent_at: int = 0
    answers: dict[int, ChosenAnswer] = field(default_factory=dict)
    lock_reason: str = "timer"
    seat_count: int = 0
    standings: list[dict] = field(default_factory=list)
    end_reason: str | None = None

    @property
    def current(self) -> dict:
        return self.questions[self.index]

    @property
    def is_last(self) -> bool:
        return self.index >= len(self.questions) - 1

    def open_question(self, index: int) -> int:
        """Move to a question and return the round number its lock timer must match."""
        self.index = index
        self.phase = QUESTION
        self.round += 1
        self.sent_at = now_ms()
        self.answers = {}
        return self.round

    def try_lock(self, reason: str, round_number: int | None = None) -> bool:
        if self.phase != QUESTION or (round_number is not None and round_number != self.round):
            return False
        self.phase = LOCKED
        self.lock_reason = reason
        return True


games: dict[int, Game] = {}


def question_message(game: Game) -> dict:
    question = game.current
    remaining = max(question["time_limit_ms"] - (now_ms() - game.sent_at), 0)
    return messages.build("question", game.session_id, {
        "question_id": question["question_id"],
        "number": game.index + 1,
        "total": len(game.questions),
        "text": question["text"],
        "options": question["options"],
        "time_limit_ms": question["time_limit_ms"],
        "remaining_ms": remaining,
        "sent_at": game.sent_at,
    })


def locked_message(game: Game, reason: str) -> dict:
    return messages.build("locked", game.session_id, {
        "question_id": game.current["question_id"],
        "reason": reason,
    })


def reveal_message(game: Game, participant_id: int | None) -> dict:
    question = game.current
    distribution = [0, 0, 0, 0]
    for answer in game.answers.values():
        distribution[answer.chosen_index] += 1
    data = {
        "question_id": question["question_id"],
        "correct_index": question["correct_index"],
        "distribution": distribution,
        "no_answer": max(game.seat_count - len(game.answers), 0),
        "source": question["source"],
    }
    if participant_id is not None:
        answer = game.answers.get(participant_id)
        data["you"] = {
            "chosen_index": answer.chosen_index if answer else None,
            "is_correct": answer.is_correct if answer else False,
            "points": answer.points if answer else 0,
        }
    return messages.build("reveal", game.session_id, data)


def _ranking_data(game: Game, participant_id: int | None) -> dict:
    data = {
        "top": [
            {"rank": row["rank"], "display_name": row["display_name"], "score": row["total_score"]}
            for row in game.standings[:LEADERBOARD_SIZE]
        ],
        "count": len(game.standings),
    }
    if participant_id is not None:
        mine = next((row for row in game.standings if row["participant_id"] == participant_id), None)
        data["you"] = {"rank": mine["rank"], "score": mine["total_score"]} if mine else {"rank": None, "score": 0}
    return data


def leaderboard_message(game: Game, participant_id: int | None) -> dict:
    return messages.build("leaderboard", game.session_id, _ranking_data(game, participant_id))


def ended_message(game: Game, participant_id: int | None) -> dict:
    data = _ranking_data(game, participant_id)
    data["reason"] = game.end_reason
    return messages.build("ended", game.session_id, data)


def state_message(game: Game, participant_id: int | None) -> dict:
    """The 1 message that describes the current phase, for docs section 6."""
    if game.phase == QUESTION:
        return question_message(game)
    if game.phase == LOCKED:
        return locked_message(game, game.lock_reason)
    if game.phase == REVEAL:
        return reveal_message(game, participant_id)
    if game.phase == LEADERBOARD:
        return leaderboard_message(game, participant_id)
    return ended_message(game, participant_id)
