import json
from datetime import datetime

import pytest
import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Host, Material, Question, Quiz
from app.services import ai, generation_service

HOST_ID = 1
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n"
PAGE_TEXT = "Mitochondria produce most of the energy a cell uses."


def ai_question(snippet: str = "Mitochondria produce most of the energy") -> dict:
    return {
        "text": "Which part of the cell produces most of its energy?",
        "options": ["Mitochondria", "Nucleus", "Ribosome", "Golgi body"],
        "correct_index": 0,
        "source_snippet": snippet,
    }


@pytest.fixture
def quiz(db_session: Session) -> Quiz:
    db_session.add(Host(id=HOST_ID, email="host@example.test", password_hash="test-hash"))
    quiz = Quiz(host_id=HOST_ID, title="Cells", created_at=datetime(2026, 11, 1))
    db_session.add(quiz)
    db_session.commit()
    return quiz


@pytest.fixture
def one_text_page(monkeypatch) -> None:
    monkeypatch.setattr(
        generation_service,
        "extract_text_by_page",
        lambda path: [{"page_number": 1, "text": PAGE_TEXT}, {"page_number": 2, "text": ""}],
    )


def fake_provider(monkeypatch, questions: list[dict]) -> list[str]:
    prompts: list[str] = []

    def reply(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(questions)

    monkeypatch.setattr(ai, "call_ai_provider_with_retry", reply)
    return prompts


def generate(host_client, quiz_id: int, count: int = 5):
    return host_client.post(
        f"/api/quizzes/{quiz_id}/generate",
        files={"file": ("cells.pdf", PDF_BYTES, "application/pdf")},
        data={"count": str(count)},
    )


def test_generate_saves_ai_questions_with_their_page(
    host_client, db_session: Session, quiz: Quiz, one_text_page, monkeypatch
) -> None:
    prompts = fake_provider(monkeypatch, [ai_question()] * 5)

    response = generate(host_client, quiz.id)

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 2
    assert body["pages_used"] == 1
    assert len(body["questions"]) == 5
    assert {q["origin"] for q in body["questions"]} == {"ai"}
    saved = db_session.scalars(select(Question).where(Question.quiz_id == quiz.id)).all()
    assert len(saved) == 5
    assert saved[0].source_page.page_number == 1
    assert db_session.scalars(select(Material)).one().file_name == "cells.pdf"
    assert len(prompts) == 1 and PAGE_TEXT in prompts[0]


def test_generate_drops_questions_whose_snippet_is_not_on_the_page(
    host_client, quiz: Quiz, one_text_page, monkeypatch
) -> None:
    fake_provider(monkeypatch, [ai_question("Plants are green")] * 5)

    response = generate(host_client, quiz.id)

    assert response.status_code == 422


def test_generate_reports_unreachable_provider_as_502(
    host_client, quiz: Quiz, one_text_page, monkeypatch
) -> None:
    def down(prompt: str) -> str:
        raise requests.ConnectionError("connection refused")

    monkeypatch.setattr(ai, "call_ai_provider_with_retry", down)

    response = generate(host_client, quiz.id)

    assert response.status_code == 502


def test_generate_rejects_pdf_without_text(host_client, quiz: Quiz, monkeypatch) -> None:
    monkeypatch.setattr(
        generation_service, "extract_text_by_page", lambda path: [{"page_number": 1, "text": ""}]
    )

    response = generate(host_client, quiz.id)

    assert response.status_code == 422
    assert "No text" in response.json()["detail"]


def test_generate_rejects_count_outside_limits(host_client, quiz: Quiz) -> None:
    response = generate(host_client, quiz.id, count=ai.AI_MAX_QUESTIONS + 1)

    assert response.status_code == 422


def test_generate_for_missing_quiz_returns_404(host_client, quiz: Quiz, one_text_page) -> None:
    response = generate(host_client, quiz.id + 100)

    assert response.status_code == 404


def test_generate_without_login_returns_401(client, quiz: Quiz) -> None:
    response = generate(client, quiz.id)

    assert response.status_code == 401
