from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_host_id
from app.db.session import get_db
from app.models.entities import (
    Answer,
    Flag,
    Participant,
    Question,
    Quiz,
    QuizSession,
)
def build_session_leaderboard(db: Session, session_id: int):
    participants = (
        db.query(Participant)
        .filter(Participant.session_id == session_id)
        .all()
    )

    voided_question_ids = set(
        db.execute(
            text("""
                SELECT question_id
                FROM session_question_voids
                WHERE session_id = :session_id
            """),
            {"session_id": session_id},
        ).scalars().all()
    )

    leaderboard_data = []

    for participant in participants:
        answers = (
            db.query(Answer)
            .filter(
                Answer.session_id == session_id,
                Answer.participant_id == participant.id,
            )
            .all()
        )

        valid_answers = [
            answer for answer in answers
            if answer.question_id not in voided_question_ids
        ]

        total_score = sum(answer.points for answer in valid_answers)

        timed_answers = [
            answer for answer in valid_answers
            if answer.answer_ms is not None
        ]

        questions_answered = len(timed_answers)

        total_answer_ms = sum(
            answer.answer_ms for answer in timed_answers
        )

        average_time = (
            total_answer_ms / questions_answered
            if questions_answered > 0
            else float("inf")
        )

        leaderboard_data.append({
            "participant_id": participant.id,
            "display_name": participant.display_name,
            "total_score": total_score,
            "average_time": average_time,
            "average_time_ms": (
                round(average_time, 2)
                if questions_answered > 0 else 0
            ),
        })

    leaderboard_data.sort(
        key=lambda item: (
            -item["total_score"],
            item["average_time"],
        )
    )

    return [
        {
            "rank": rank,
            "participant_id": item["participant_id"],
            "display_name": item["display_name"],
            "total_score": item["total_score"],
            "average_time_ms": item["average_time_ms"],
        }
        for rank, item in enumerate(leaderboard_data, start=1)
    ]

router = APIRouter()


# Request body for creating a flag
class FlagCreate(BaseModel):
    session_id: int
    question_id: int
    participant_id: int
    reason: str | None = Field(default=None, max_length=500)


# 1. Participant flags a question
@router.post("/", status_code=status.HTTP_201_CREATED)
def create_flag(
    payload: FlagCreate,
    db: Session = Depends(get_db),
):
    # Check participant
    participant = db.query(Participant).filter(
        Participant.id == payload.participant_id,
        Participant.session_id == payload.session_id,
    ).first()

    if not participant:
        raise HTTPException(
            status_code=404,
            detail="Participant not found in this session",
        )

    # Check session
    session = db.query(QuizSession).filter(
        QuizSession.id == payload.session_id
    ).first()

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    # Check question
    question = db.query(Question).filter(
        Question.id == payload.question_id,
        Question.quiz_id == session.quiz_id,
    ).first()

    if not question:
        raise HTTPException(
            status_code=404,
            detail="Question not found in this session",
        )

    # Prevent duplicate flags
    existing_flag = db.query(Flag).filter(
        Flag.participant_id == payload.participant_id,
        Flag.question_id == payload.question_id,
    ).first()

    if existing_flag:
        raise HTTPException(
            status_code=409,
            detail="You have already flagged this question",
        )

    # Create flag
    flag = Flag(
        session_id=payload.session_id,
        question_id=payload.question_id,
        participant_id=payload.participant_id,
        reason=payload.reason,
    )

    try:
        db.add(flag)
        db.commit()
        db.refresh(flag)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="You have already flagged this question",
        )

    return {
        "message": "Question flagged successfully",
        "flag_id": flag.id,
        "question_id": flag.question_id,
    }


# 2. Host views flagged questions
@router.get("/sessions/{session_id}/flags")
def get_session_flags(
    session_id: int,
    db: Session = Depends(get_db),
    host_id: int = Depends(current_host_id),
):
    # Check session ownership
    session = (
        db.query(QuizSession)
        .join(Quiz, Quiz.id == QuizSession.quiz_id)
        .filter(
            QuizSession.id == session_id,
            Quiz.host_id == host_id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    # Get flagged questions
    flagged_questions = (
        db.query(Flag, Question, Participant)
        .join(Question, Question.id == Flag.question_id)
        .join(Participant, Participant.id == Flag.participant_id)
        .filter(Flag.session_id == session_id)
        .order_by(Flag.created_at.desc())
        .all()
    )

    return {
        "session_id": session_id,
        "total_flags": len(flagged_questions),
        "flags": [
            {
                "flag_id": flag.id,
                "question_id": question.id,
                "question_text": question.text,
                "participant_id": participant.id,
                "participant_name": participant.display_name,
                "reason": flag.reason,
                "created_at": flag.created_at,
            }
            for flag, question, participant in flagged_questions
        ],
    }


# 3. Host voids a flagged question
@router.post(
    "/sessions/{session_id}/questions/{question_id}/void"
)
def void_flagged_question(
    session_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    host_id: int = Depends(current_host_id),
):
    # Check session ownership
    session = (
        db.query(QuizSession)
        .join(Quiz, Quiz.id == QuizSession.quiz_id)
        .filter(
            QuizSession.id == session_id,
            Quiz.host_id == host_id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    # Check question belongs to the session's quiz
    question = db.query(Question).filter(
        Question.id == question_id,
        Question.quiz_id == session.quiz_id,
    ).first()

    if not question:
        raise HTTPException(
            status_code=404,
            detail="Question not found in this session",
        )

    # Check whether question was flagged
    flag = db.query(Flag).filter(
        Flag.session_id == session_id,
        Flag.question_id == question_id,
    ).first()

    if not flag:
        raise HTTPException(
            status_code=404,
            detail="This question has not been flagged",
        )

    # Check whether already voided
    existing_void = db.execute(
        text("""
            SELECT id
            FROM session_question_voids
            WHERE session_id = :session_id
              AND question_id = :question_id
        """),
        {
            "session_id": session_id,
            "question_id": question_id,
        },
    ).scalar_one_or_none()

    if existing_void:
        raise HTTPException(
            status_code=409,
            detail="Question is already voided",
        )

    # Get all answers for this question in this session
    answers = db.query(Answer).filter(
        Answer.session_id == session_id,
        Answer.question_id == question_id,
    ).all()

    # Calculate total points being removed
    points_removed = sum(
        answer.points for answer in answers
    )

    try:
        # Save void record
        db.execute(
            text("""
                INSERT INTO session_question_voids
                (session_id, question_id, voided_by)
                VALUES (:session_id, :question_id, :voided_by)
            """),
            {
                "session_id": session_id,
                "question_id": question_id,
                "voided_by": host_id,
            },
        )

        # Remove points from all participants
        for answer in answers:
            answer.points = 0

        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Question is already voided",
        )

    leaderboard = build_session_leaderboard(db, session_id)

    return {
        "message": "Question voided successfully",
        "session_id": session_id,
        "question_id": question_id,
        "answers_updated": len(answers),
        "points_removed": points_removed,
        "leaderboard": leaderboard,
    }