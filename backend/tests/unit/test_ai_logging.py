import json
import logging

import pytest
import requests

from app.services import ai, ai_logging
from app.services.ai_validation import (
    parse_and_validate_ai_response,
    validate_question,
)

PAGE_TEXT = "Photosynthesis happens in the chloroplast. It turns light into sugar."
SECRET_KEY = "test-secret-key-123"


def make_question(**changes):
    question = {
        "text": "Where does photosynthesis happen?",
        "options": ["Nucleus", "Chloroplast", "Ribosome", "Vacuole"],
        "correct_index": 1,
        "source_snippet": "happens in the chloroplast",
    }
    question.update(changes)
    return question


class FakeResponse:
    def __init__(self, body, error=None):
        self._body = body
        self._error = error

    def raise_for_status(self):
        if self._error:
            raise self._error

    def json(self):
        return self._body


@pytest.fixture(autouse=True)
def ai_log_capture(caplog):
    caplog.set_level(logging.INFO, logger=ai_logging.LOGGER_NAME)
    return caplog


@pytest.fixture
def ollama(monkeypatch):
    monkeypatch.setattr(ai, "AI_PROVIDER", "ollama")
    monkeypatch.setattr(ai, "AI_MAX_RETRIES", 3)
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)


# What was sent and what came back

def test_successful_call_logs_sent_and_returned(ollama, monkeypatch, caplog):
    monkeypatch.setattr(
        ai.requests, "post", lambda *a, **k: FakeResponse({"response": "[]"})
    )
    prompt = "Source Text (Page 7):\n" + PAGE_TEXT
    ai.call_ai_provider_with_retry(prompt, source_label="notes.pdf")
    assert "ai call sent: attempt=1/3" in caplog.text
    assert "source=notes.pdf" in caplog.text
    assert "page=7" in caplog.text
    assert "ai call returned: attempt=1" in caplog.text
    assert "response_chars=2" in caplog.text


def test_full_page_text_is_not_logged(ollama, monkeypatch, caplog):
    monkeypatch.setattr(
        ai.requests, "post", lambda *a, **k: FakeResponse({"response": "[]"})
    )
    ai.call_ai_provider_with_retry("Source Text (Page 1):\n" + PAGE_TEXT)
    assert PAGE_TEXT not in caplog.text
    assert "prompt_chars=" in caplog.text


def test_long_response_is_cut_in_the_log(ollama, monkeypatch, caplog):
    long_text = "x" * 1000
    monkeypatch.setattr(
        ai.requests, "post", lambda *a, **k: FakeResponse({"response": long_text})
    )
    ai.call_ai_provider_with_retry("prompt")
    assert "response_chars=1000" in caplog.text
    assert long_text not in caplog.text


def test_missing_source_label_is_logged_as_unknown(ollama, monkeypatch, caplog):
    monkeypatch.setattr(
        ai.requests, "post", lambda *a, **k: FakeResponse({"response": "[]"})
    )
    ai.call_ai_provider_with_retry("prompt")
    assert "source=unknown" in caplog.text


# Retries and failures

def test_failed_attempt_is_logged_then_retry_succeeds(ollama, monkeypatch, caplog):
    results = [requests.ConnectionError("network down"), FakeResponse({"response": "ok"})]

    def fake_post(*args, **kwargs):
        result = results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(ai.requests, "post", fake_post)
    assert ai.call_ai_provider_with_retry("prompt") == "ok"
    assert "ai call failed: attempt=1/3 error_type=ConnectionError" in caplog.text
    assert "will_retry=True" in caplog.text
    assert "ai call sent: attempt=2/3" in caplog.text
    assert "ai call returned: attempt=2" in caplog.text


def test_final_failure_is_logged_as_error_and_raised(ollama, monkeypatch, caplog):
    def always_fail(*args, **kwargs):
        raise requests.Timeout("timed out")

    monkeypatch.setattr(ai.requests, "post", always_fail)
    with pytest.raises(requests.Timeout):
        ai.call_ai_provider_with_retry("prompt")
    failures = [r for r in caplog.records if "ai call failed" in r.getMessage()]
    assert len(failures) == 3
    assert failures[-1].levelno == logging.ERROR
    assert "will_retry=False" in failures[-1].getMessage()


def test_api_key_never_reaches_the_log(monkeypatch, caplog):
    monkeypatch.setattr(ai, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(ai, "GEMINI_API_KEY", SECRET_KEY)
    monkeypatch.setattr(ai, "AI_MAX_RETRIES", 2)
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)
    monkeypatch.setenv("GEMINI_API_KEY", SECRET_KEY)

    def leaky_failure(url, **kwargs):
        raise requests.HTTPError(f"429 Client Error for url: {url}")

    monkeypatch.setattr(ai.requests, "post", leaky_failure)
    with pytest.raises(requests.HTTPError):
        ai.call_ai_provider_with_retry("prompt")
    assert SECRET_KEY not in caplog.text
    assert "key=[redacted]" in caplog.text


def test_redact_removes_key_value_from_text(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET_KEY)
    text = f"failed for {SECRET_KEY} and url?key={SECRET_KEY}&alt=json"
    cleaned = ai_logging.redact(text)
    assert SECRET_KEY not in cleaned


# What was rejected or skipped

def test_rejected_question_is_logged_with_reason_and_question(caplog):
    ok, reason = validate_question(make_question(options=["A", "B", "C"]), PAGE_TEXT)
    assert ok is False
    assert "ai question rejected" in caplog.text
    assert reason in caplog.text
    assert "Where does photosynthesis happen?" in caplog.text


def test_valid_question_is_not_logged_as_rejected(caplog):
    validate_question(make_question(), PAGE_TEXT)
    assert "rejected" not in caplog.text


def test_invalid_json_is_logged_as_skipped(caplog):
    assert parse_and_validate_ai_response("not json at all", PAGE_TEXT) == []
    assert "ai response skipped: reason=response is not valid JSON" in caplog.text


def test_json_that_is_not_a_list_is_logged_as_skipped(caplog):
    assert parse_and_validate_ai_response('{"question": "x"}', PAGE_TEXT) == []
    assert "reason=JSON is not a list of questions" in caplog.text


def test_item_that_is_not_an_object_is_logged_as_skipped(caplog):
    raw = json.dumps(["just text", make_question()])
    assert len(parse_and_validate_ai_response(raw, PAGE_TEXT)) == 1
    assert "ai item skipped: index=0" in caplog.text


def test_summary_counts_kept_and_rejected(caplog):
    raw = json.dumps([make_question(), make_question(options=["A"]), make_question(correct_index=9)])
    assert len(parse_and_validate_ai_response(raw, PAGE_TEXT)) == 1
    assert "received=3 kept=1 rejected=2" in caplog.text
    rejections = [r for r in caplog.records if "ai question rejected" in r.getMessage()]
    assert len(rejections) == 2
