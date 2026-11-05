"""Logging helpers for the AI question pipeline.

Records what was sent to the AI provider, what came back, and what was skipped or
rejected, so that a missing question can always be explained from the log.

Rules kept here:
- The full page text is never logged, only its size and the page number.
- API keys never reach the log. Error text is redacted before it is written.
- The log level is read from LOG_LEVEL, which is already listed in .env.example.
"""
import logging
import os
import re
import time
from typing import Any, Optional

LOGGER_NAME = "lockin.ai"
RESPONSE_PREVIEW_CHARS = 200
QUESTION_PREVIEW_CHARS = 120

logger = logging.getLogger(LOGGER_NAME)

_KEY_PARAM = re.compile(r"(key=)[^&\s\"']+", re.IGNORECASE)
_PAGE_IN_PROMPT = re.compile(r"Source Text \(Page (\d+)\)")


def configure_ai_logging() -> None:
    """Attach a console handler once, unless the application already set one up."""
    if logger.handlers or logging.getLogger().handlers:
        return
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    logger.addHandler(handler)
    logger.setLevel(level)


def redact(text: str) -> str:
    """Remove API keys from text before it is logged."""
    text = _KEY_PARAM.sub(r"\1[redacted]", text)
    api_key = os.getenv("GEMINI_API_KEY", "")
    if api_key:
        text = text.replace(api_key, "[redacted]")
    return text


def preview(text: Any, limit: int) -> str:
    """Return a single line version of text, cut to limit characters."""
    one_line = " ".join(str(text).split())
    if len(one_line) <= limit:
        return one_line
    return one_line[:limit] + "..."


def page_from_prompt(prompt: str) -> Optional[int]:
    match = _PAGE_IN_PROMPT.search(prompt)
    return int(match.group(1)) if match else None


def log_attempt(
    attempt: int,
    max_attempts: int,
    provider: str,
    model: str,
    prompt: str,
    source_label: str = "",
) -> None:
    logger.info(
        "ai call sent: attempt=%s/%s provider=%s model=%s source=%s page=%s prompt_chars=%s",
        attempt,
        max_attempts,
        provider,
        model,
        source_label or "unknown",
        page_from_prompt(prompt),
        len(prompt),
    )


def log_response(attempt: int, started: float, response_text: str) -> None:
    logger.info(
        "ai call returned: attempt=%s elapsed=%.2fs response_chars=%s preview=%r",
        attempt,
        time.monotonic() - started,
        len(response_text),
        preview(response_text, RESPONSE_PREVIEW_CHARS),
    )


def log_attempt_failed(
    attempt: int, max_attempts: int, error: Exception, will_retry: bool
) -> None:
    level = logging.WARNING if will_retry else logging.ERROR
    logger.log(
        level,
        "ai call failed: attempt=%s/%s error_type=%s error=%s will_retry=%s",
        attempt,
        max_attempts,
        type(error).__name__,
        preview(redact(str(error)), RESPONSE_PREVIEW_CHARS),
        will_retry,
    )


def log_response_skipped(reason: str, raw_response: str) -> None:
    logger.warning(
        "ai response skipped: reason=%s response_chars=%s preview=%r",
        reason,
        len(raw_response),
        preview(raw_response, RESPONSE_PREVIEW_CHARS),
    )


def log_item_skipped(index: int, item: Any) -> None:
    logger.warning(
        "ai item skipped: index=%s reason=not a JSON object type=%s",
        index,
        type(item).__name__,
    )


def log_question_rejected(reason: str, question: Any) -> None:
    text = question.get("text") if isinstance(question, dict) else question
    logger.warning(
        "ai question rejected: reason=%s question=%r",
        reason,
        preview(text, QUESTION_PREVIEW_CHARS),
    )


def log_validation_summary(received: int, kept: int) -> None:
    logger.info(
        "ai validation summary: received=%s kept=%s rejected=%s",
        received,
        kept,
        received - kept,
    )


configure_ai_logging()
