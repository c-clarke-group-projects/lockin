import json

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


# Rule: exactly 4 options

def test_valid_question_passes():
    assert validate_question(make_question(), PAGE_TEXT) == (True, "Valid")


def test_three_options_rejected():
    ok, reason = validate_question(make_question(options=["A", "B", "C"]), PAGE_TEXT)
    assert ok is False
    assert "4 options" in reason


def test_five_options_rejected():
    ok, _ = validate_question(make_question(options=["A", "B", "C", "D", "E"]), PAGE_TEXT)
    assert ok is False


def test_missing_options_rejected():
    question = make_question()
    del question["options"]
    ok, _ = validate_question(question, PAGE_TEXT)
    assert ok is False


# Rule: correct_index is an integer from 0 to 3

def test_correct_index_out_of_range_rejected():
    ok, reason = validate_question(make_question(correct_index=4), PAGE_TEXT)
    assert ok is False
    assert "correct_index" in reason


def test_correct_index_negative_rejected():
    ok, _ = validate_question(make_question(correct_index=-1), PAGE_TEXT)
    assert ok is False


def test_correct_index_as_text_rejected():
    ok, _ = validate_question(make_question(correct_index="1"), PAGE_TEXT)
    assert ok is False


def test_correct_index_missing_rejected():
    question = make_question()
    del question["correct_index"]
    ok, _ = validate_question(question, PAGE_TEXT)
    assert ok is False


# Rule: the source snippet must be in the page text

def test_snippet_not_in_page_rejected():
    ok, reason = validate_question(make_question(source_snippet="mitochondria"), PAGE_TEXT)
    assert ok is False
    assert "snippet" in reason.lower()


def test_empty_snippet_rejected():
    ok, _ = validate_question(make_question(source_snippet="   "), PAGE_TEXT)
    assert ok is False


def test_snippet_match_ignores_case():
    ok, _ = validate_question(make_question(source_snippet="HAPPENS IN THE CHLOROPLAST"), PAGE_TEXT)
    assert ok is True


# Parsing the AI response

def test_parse_keeps_only_valid_questions():
    raw = json.dumps([make_question(), make_question(options=["A", "B"])])
    result = parse_and_validate_ai_response(raw, PAGE_TEXT)
    assert len(result) == 1


def test_parse_accepts_markdown_fenced_json():
    raw = "```json\n" + json.dumps([make_question()]) + "\n```"
    assert len(parse_and_validate_ai_response(raw, PAGE_TEXT)) == 1


def test_parse_invalid_json_returns_empty_list():
    assert parse_and_validate_ai_response("not json at all", PAGE_TEXT) == []


def test_parse_non_list_json_returns_empty_list():
    assert parse_and_validate_ai_response('{"question": "x"}', PAGE_TEXT) == []