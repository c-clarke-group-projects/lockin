from typing import List, Dict, Any

SCORE_BASE_POINTS = 500
SCORE_SPEED_POINTS = 500


def calculate_score(is_correct: bool, answer_time_ms: int, time_limit_seconds: int) -> int:
    """
    SCRUM-43: Calculates server-side score for a question answer per SCORING.md.
    Formula: 500 base + round(500 * time_left / time_limit) if correct, 0 if wrong.
    Timing measured on the server.
    """
    if not is_correct:
        return 0

    time_limit_ms = time_limit_seconds * 1000
    if answer_time_ms < 0:
        answer_time_ms = 0
    if answer_time_ms >= time_limit_ms:
        return SCORE_BASE_POINTS

    time_left_ms = time_limit_ms - answer_time_ms
    speed_bonus = round(SCORE_SPEED_POINTS * (time_left_ms / time_limit_ms))
    return SCORE_BASE_POINTS + speed_bonus


def compute_leaderboard(participants_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    SCRUM-44: Ranks participants by total score descending.
    Ties broken by average answer time ascending (earlier average time ranks higher).
    """
    def calculate_avg_time(p: Dict[str, Any]) -> float:
        answered = p.get("questions_answered", 0)
        if answered <= 0:
            return float("inf")
        return p.get("total_answer_ms", 0) / answered

    sorted_p = sorted(
        participants_list,
        key=lambda p: (-p.get("total_score", 0), calculate_avg_time(p))
    )

    leaderboard = []
    for rank, p in enumerate(sorted_p, start=1):
        leaderboard.append({
            "rank": rank,
            "participant_id": p.get("participant_id"),
            "display_name": p.get("display_name"),
            "total_score": p.get("total_score", 0),
            "average_time_ms": calculate_avg_time(p) if p.get("questions_answered", 0) > 0 else 0
        })

    return leaderboard