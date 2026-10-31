import json

import pytest

from app.services.ai_validation import (
    parse_and_validate_ai_response,
    validate_question,
)

PAGE_TEXT = "Photosynthesis happens in the chloroplast. It turns light into sugar."


def make_question(**changes):
    question = {
        "text": "Where does photosynthesis happen?",
        "options": ["Nucleus", "Chloroplast", "Ribosome", "Vacuole"],
        "correct_index": 1,
        "source_snippet": "happens in the chloroplast",
    }
    question.update(changes)
    return question


# Rules from docs/AI_PIPELINE.md section 4 that validate_question does not check yet.
# Each test states the expected behaviour. While the rule is missing the test is
# marked xfail with strict=True, so the suite stays green now and the test fails
# loudly (XPASS) once the rule is added and the marker should be removed.

NOT_CHECKED = "rule is not implemented in validate_question yet"


# Rule: duplicate options

def test_distinct_options_pass():
    options = ["Nucleus", "Chloroplast", "Ribosome", "Vacuole"]
    ok, _ = validate_question(make_question(options=options), PAGE_TEXT)
    assert ok is True


@pytest.mark.xfail(strict=True, reason=NOT_CHECKED)
def test_duplicate_options_rejected():
    options = ["Chloroplast", "Chloroplast", "Ribosome", "Vacuole"]
    ok, _ = validate_question(make_question(options=options), PAGE_TEXT)
    assert ok is False


# Rule: empty fields

@pytest.mark.xfail(strict=True, reason=NOT_CHECKED)
def test_empty_question_text_rejected():
    ok, _ = validate_question(make_question(question=""), PAGE_TEXT)
    assert ok is False


@pytest.mark.xfail(strict=True, reason=NOT_CHECKED)
def test_empty_option_rejected():
    options = ["Nucleus", "", "Ribosome", "Vacuole"]
    ok, _ = validate_question(make_question(options=options), PAGE_TEXT)
    assert ok is False


# Rule: correct answer must be 1 of the 4 options

@pytest.mark.xfail(strict=True, reason="True is accepted because bool is a subclass of int")
def test_boolean_correct_index_rejected():
    ok, _ = validate_question(make_question(correct_index=True), PAGE_TEXT)
    assert ok is False


# Rule: snippet

def test_missing_snippet_key_rejected():
    question = make_question()
    del question["source_snippet"]
    ok, _ = validate_question(question, PAGE_TEXT)
    assert ok is False


@pytest.mark.xfail(strict=True, raises=AttributeError, reason="None.strip() raises instead of rejecting")
def test_null_snippet_rejected_without_crashing():
    ok, _ = validate_question(make_question(source_snippet=None), PAGE_TEXT)
    assert ok is False


# Rule: JSON does not match the agreed shape

def test_parse_ignores_items_that_are_not_objects():
    raw = json.dumps(["just text", 5, None])
    assert parse_and_validate_ai_response(raw, PAGE_TEXT) == []


def test_parse_returns_empty_list_when_every_question_fails():
    raw = json.dumps([make_question(options=["A"]), make_question(correct_index=9)])
    assert parse_and_validate_ai_response(raw, PAGE_TEXT) == []


def test_parse_one_bad_item_does_not_stop_the_rest():
    raw = json.dumps([make_question(options=["A"]), make_question()])
    assert len(parse_and_validate_ai_response(raw, PAGE_TEXT)) == 1