from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Host, Question, Quiz

HOST_ID = 1
OTHER_HOST_ID = 2


def add_host(db_session: Session, host_id: int) -> None:
    db_session.add(
        Host(
            id=host_id,
            email=f"host-{host_id}@example.test",
            password_hash="test-hash",
        )
    )
    db_session.commit()


def add_quiz(
    db_session: Session,
    host_id: int,
    title: str,
) -> Quiz:
    quiz = Quiz(host_id=host_id, title=title, created_at=datetime(2026, 10, 20))
    db_session.add(quiz)
    db_session.commit()
    db_session.refresh(quiz)
    return quiz


def test_import_csv_valid_template(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Science Quiz")

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer,time_limit,source_note
What is H2O?,Water,Hydrogen,Oxygen,Helium,1,20,Chemistry 101
Speed of light?,300000 km/s,150000 km/s,1000 km/s,30000 km/s,1,30,Physics book
Chemical symbol for Gold?,Au,Ag,Fe,Pb,Au,25,Periodic table
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["imported_count"] == 3
    assert data["rejected_count"] == 0
    assert len(data["rejected_rows"]) == 0
    assert len(data["imported_questions"]) == 3

    questions = list(
        db_session.scalars(
            select(Question).where(Question.quiz_id == quiz.id).order_by(Question.id)
        ).all()
    )
    assert len(questions) == 3
    assert questions[0].text == "What is H2O?"
    assert questions[0].correct_index == 0
    assert questions[0].time_limit == 20
    assert questions[0].source_snippet == "Chemistry 101"
    assert questions[2].correct_index == 0  # "Au" matched option 1


def test_import_csv_with_rejected_rows(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Mixed Quiz")

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
Valid question 1,Alpha,Beta,Gamma,Delta,1
,Alpha,Beta,Gamma,Delta,1
Valid question 2,One,Two,Three,Four,B
Missing option,A,,C,D,1
Invalid answer,A,B,C,D,9
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["imported_count"] == 2
    assert data["rejected_count"] == 3
    assert len(data["rejected_rows"]) == 3

    rejections = data["rejected_rows"]
    assert rejections[0]["row_number"] == 3
    assert "Question text is required" in rejections[0]["reason"]

    assert rejections[1]["row_number"] == 5
    assert "All 4 options must be non-empty" in rejections[1]["reason"]

    assert rejections[2]["row_number"] == 6
    assert "Correct answer" in rejections[2]["reason"]

    stored = list(
        db_session.scalars(
            select(Question).where(Question.quiz_id == quiz.id)
        ).all()
    )
    assert len(stored) == 2
    assert stored[0].text == "Valid question 1"
    assert stored[1].text == "Valid question 2"


def test_import_csv_wrong_headers_returns_400(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    bad_csv = """name,first_choice,second_choice
Q1,A,B
"""
    files = {"file": ("questions.csv", bad_csv.encode("utf-8"), "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 400
    assert "Invalid CSV headers" in response.json()["detail"]
    assert "Missing required headers" in response.json()["detail"]


def test_import_empty_csv_returns_400(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    files = {"file": ("questions.csv", b"", "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 400
    assert "CSV file is empty" in response.json()["detail"]


def test_import_non_csv_file_returns_400(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Quiz")

    files = {"file": ("questions.txt", b"some text", "text/plain")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 400
    assert "Only CSV files are allowed" in response.json()["detail"]


def test_import_csv_to_missing_quiz_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
Q,A,B,C,D,1
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = host_client.post(
        "/api/quizzes/999/questions/import-csv",
        files=files,
    )

    assert response.status_code == 404


def test_import_csv_to_other_hosts_quiz_returns_404(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    add_host(db_session, OTHER_HOST_ID)
    quiz = add_quiz(db_session, OTHER_HOST_ID, "Other host quiz")

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
Q,A,B,C,D,1
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 404


def test_import_csv_unauthenticated_returns_401(client) -> None:
    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
Q,A,B,C,D,1
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = client.post(
        "/api/quizzes/1/questions/import-csv",
        files=files,
    )

    assert response.status_code == 401


def test_get_csv_template(client) -> None:
    response = client.get("/api/quizzes/questions/template/csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    content = response.text
    assert "question" in content
    assert "option_1" in content
    assert "option_4" in content
    assert "correct_answer" in content


def test_import_csv_via_direct_questions_endpoint(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "Direct Quiz")

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
Direct question?,One,Two,Three,Four,1
"""
    files = {"file": ("questions.csv", csv_content.encode("utf-8"), "text/csv")}
    response = host_client.post(
        "/api/questions/import-csv",
        data={"quiz_id": quiz.id},
        files=files,
    )

    assert response.status_code == 200
    assert response.json()["imported_count"] == 1


def test_import_csv_with_utf8_bom(host_client, db_session: Session) -> None:
    add_host(db_session, HOST_ID)
    quiz = add_quiz(db_session, HOST_ID, "BOM Quiz")

    csv_content = """question,option_1,option_2,option_3,option_4,correct_answer
BOM question?,A,B,C,D,1
"""
    bom_bytes = b"\xef\xbb\xbf" + csv_content.encode("utf-8")
    files = {"file": ("bom.csv", bom_bytes, "text/csv")}
    response = host_client.post(
        f"/api/quizzes/{quiz.id}/questions/import-csv",
        files=files,
    )

    assert response.status_code == 200
    assert response.json()["imported_count"] == 1

