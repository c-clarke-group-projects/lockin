import pytest
from pydantic import ValidationError

from app.schemas.questions import QuestionManualCreate


def test_valid_manual_question_schema():
    payload = QuestionManualCreate(
        text="What is the capital of Japan?",
        options=["Kyoto", "Tokyo", "Osaka", "Nagoya"],
        correct_index=1,
        time_limit=30,
        source_note="Geography notes",
    )
    assert payload.text == "What is the capital of Japan?"
    assert len(payload.options) == 4
    assert payload.correct_index == 1
    assert payload.time_limit == 30
    assert payload.source_note == "Geography notes"
    assert payload.source_snippet == "Geography notes"


def test_source_note_is_optional():
    payload = QuestionManualCreate(
        text="What is 5 * 5?",
        options=["10", "20", "25", "30"],
        correct_index=2,
    )
    assert payload.source_note is None
    assert payload.source_snippet is None
    assert payload.time_limit == 30


def test_rejects_fewer_than_4_options():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Incomplete question?",
            options=["1", "2", "3"],
            correct_index=0,
        )


def test_rejects_more_than_4_options():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Too many options?",
            options=["1", "2", "3", "4", "5"],
            correct_index=0,
        )


def test_rejects_blank_options():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Blank option question?",
            options=["1", "   ", "3", "4"],
            correct_index=0,
        )


def test_rejects_empty_question_text():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="    ",
            options=["1", "2", "3", "4"],
            correct_index=0,
        )


def test_rejects_out_of_range_correct_index():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Out of range index?",
            options=["1", "2", "3", "4"],
            correct_index=4,
        )

    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Negative index?",
            options=["1", "2", "3", "4"],
            correct_index=-1,
        )


def test_rejects_non_positive_time_limit():
    with pytest.raises(ValidationError):
        QuestionManualCreate(
            text="Zero time limit?",
            options=["1", "2", "3", "4"],
            correct_index=0,
            time_limit=0,
        )
