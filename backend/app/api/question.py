
import os
import json
import re

import psycopg
from psycopg.types.json import Jsonb
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai import (
    validate_question_count_request,
    build_generation_prompt,
    call_ai_provider_with_retry,
)
from app.services.ai_validation import validate_question

router = APIRouter()


def get_db():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(database_url)


class QuestionCreate(BaseModel):
    text: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    time_limit: int = Field(default=30, gt=0)


class QuestionUpdate(BaseModel):
    text: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    time_limit: int = Field(default=30, gt=0)


class RegenerateRequest(BaseModel):
    page_id: int
    count: int = Field(default=5, ge=1, le=30)


def check_question(data):
    if len(data.options) != 4:
        raise HTTPException(400, "Exactly 4 options are required")

    if any(not option.strip() for option in data.options):
        raise HTTPException(400, "Options cannot be empty")


@router.get("/quizzes/{quiz_id}/questions")
def get_questions(quiz_id: int):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, quiz_id, text, options, correct_index,
                   time_limit, source_page_id, source_snippet, origin
            FROM questions
            WHERE quiz_id = %s
            ORDER BY id
            """,
            (quiz_id,)
        ).fetchall()

        return [
            {
                "id": row[0],
                "quiz_id": row[1],
                "text": row[2],
                "options": row[3],
                "correct_index": row[4],
                "time_limit": row[5],
                "source_page_id": row[6],
                "source_snippet": row[7],
                "origin": row[8],
            }
            for row in rows
        ]


@router.post("/quizzes/{quiz_id}/questions", status_code=201)
def create_question(quiz_id: int, data: QuestionCreate):
    check_question(data)

    with get_db() as conn:
        quiz = conn.execute(
            "SELECT id FROM quizzes WHERE id = %s",
            (quiz_id,)
        ).fetchone()

        if not quiz:
            raise HTTPException(404, "Quiz not found")

        row = conn.execute(
            """
            INSERT INTO questions
            (quiz_id, text, options, correct_index, time_limit, origin)
            VALUES (%s, %s, %s, %s, %s, 'manual')
            RETURNING id
            """,
            (
                quiz_id,
                data.text,
                Jsonb(data.options),
                data.correct_index,
                data.time_limit,
            )
        ).fetchone()

        return {"message": "Question saved", "question_id": row[0]}


@router.put("/questions/{question_id}")
def update_question(question_id: int, data: QuestionUpdate):
    check_question(data)

    with get_db() as conn:
        row = conn.execute(
            """
            UPDATE questions
            SET text = %s,
                options = %s,
                correct_index = %s,
                time_limit = %s
            WHERE id = %s
            RETURNING id
            """,
            (
                data.text,
                Jsonb(data.options),
                data.correct_index,
                data.time_limit,
                question_id,
            )
        ).fetchone()

        if not row:
            raise HTTPException(404, "Question not found")

        return {"message": "Question updated", "question_id": row[0]}


@router.delete("/questions/{question_id}")
def delete_question(question_id: int):
    with get_db() as conn:
        row = conn.execute(
            """
            DELETE FROM questions
            WHERE id = %s
            RETURNING id
            """,
            (question_id,)
        ).fetchone()

        if not row:
            raise HTTPException(404, "Question not found")

        return {"message": "Question deleted", "question_id": row[0]}


def parse_ai_json(response):
    response = response.strip()
    response = re.sub(r"^```(?:json)?\s*", "", response)
    response = re.sub(r"\s*```$", "", response)
    return json.loads(response)


@router.post("/quizzes/{quiz_id}/questions/regenerate")
def regenerate_questions(quiz_id: int, data: RegenerateRequest):
    try:
        count = validate_question_count_request(data.count)

        with get_db() as conn:
            quiz = conn.execute(
                "SELECT id FROM quizzes WHERE id = %s",
                (quiz_id,)
            ).fetchone()

            if not quiz:
                raise HTTPException(404, "Quiz not found")

            page = conn.execute(
                """
                SELECT page_number, text
                FROM material_pages
                WHERE id = %s
                """,
                (data.page_id,)
            ).fetchone()

            if not page:
                raise HTTPException(404, "Material page not found")

            page_number, page_text = page

            prompt = build_generation_prompt(
                page_text=page_text,
                page_number=page_number,
                num_questions=count,
            )

            response = call_ai_provider_with_retry(prompt)
            generated = parse_ai_json(response)

            if isinstance(generated, dict):
                generated = generated.get("questions")

            if not isinstance(generated, list) or len(generated) != count:
                raise HTTPException(422, "AI returned an invalid question list")

            saved_ids = []

            for question in generated:
                valid, error = validate_question(question, page_text)

                if not valid:
                    raise HTTPException(422, f"Invalid AI question: {error}")

                options = question["options"]
                correct_index = question["correct_index"]

                if len(options) != 4 or not 0 <= correct_index <= 3:
                    raise HTTPException(422, "Invalid options or correct answer")

                row = conn.execute(
                    """
                    INSERT INTO questions
                    (quiz_id, text, options, correct_index, time_limit,
                     source_page_id, source_snippet, origin)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'ai')
                    RETURNING id
                    """,
                    (
                        quiz_id,
                        question["text"],
                        Jsonb(options),
                        correct_index,
                        question.get("time_limit", 30),
                        data.page_id,
                        question["source_snippet"],
                    )
                ).fetchone()

                saved_ids.append(row[0])

            # Replace old questions only after all new questions are saved.
            conn.execute(
                """
                DELETE FROM questions
                WHERE quiz_id = %s AND id NOT IN (
                    SELECT unnest(%s::bigint[])
                )
                """,
                (quiz_id, saved_ids)
            )

            return {
                "message": "Questions regenerated successfully",
                "count": len(saved_ids),
                "question_ids": saved_ids,
            }

    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON")
    except Exception as error:
        raise HTTPException(500, str(error))
