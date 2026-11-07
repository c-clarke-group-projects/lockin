from app.services.scoring import calculate_score, compute_leaderboard

def test_calculate_score_correct():
    # 10s left out of 20s (50% speed bonus) -> 500 + 250 = 750
    assert calculate_score(is_correct=True, answer_time_ms=10000, time_limit_seconds=20) == 750

def test_calculate_score_wrong():
    assert calculate_score(is_correct=False, answer_time_ms=2000, time_limit_seconds=20) == 0

def test_leaderboard_tie_breaking():
    players = [
        {"participant_id": "1", "display_name": "Player A", "total_score": 1000, "total_answer_ms": 10000, "questions_answered": 2}, # avg 5000ms
        {"participant_id": "2", "display_name": "Player B", "total_score": 1000, "total_answer_ms": 6000, "questions_answered": 2},  # avg 3000ms
    ]
    board = compute_leaderboard(players)
    assert board[0]["display_name"] == "Player B" # Player B ranks higher due to lower average answer time