import pytest

from app.services.csv_import import (
    CSV_TEMPLATE,
    EmptyCsvError,
    InvalidCsvHeaderError,
    parse_csv_content,
)


def test_parse_csv_template():
    valid_rows, rejected_rows = parse_csv_content(CSV_TEMPLATE)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 1
    row = valid_rows[0]
    assert row["text"] == "What is the capital of France?"
    assert row["options"] == ["London", "Paris", "Berlin", "Madrid"]
    assert row["correct_index"] == 1
    assert row["time_limit"] == 30
    assert row["source_snippet"] == "Geography textbook"
    assert row["origin"] == "manual"


def test_parse_csv_with_1_based_index():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
What is 2 + 2?,3,4,5,6,2
What is 3 + 3?,4,5,6,7,3
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 2
    assert valid_rows[0]["correct_index"] == 1  # 2nd option
    assert valid_rows[1]["correct_index"] == 2  # 3rd option


def test_parse_csv_with_letter_answers():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Q1,A,B,C,D,a
Q2,A,B,C,D,B
Q3,A,B,C,D,c
Q4,A,B,C,D,D
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 4
    assert [r["correct_index"] for r in valid_rows] == [0, 1, 2, 3]


def test_parse_csv_with_matching_option_text():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Largest planet?,Mars,Jupiter,Earth,Saturn,Jupiter
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 1
    assert valid_rows[0]["correct_index"] == 1


def test_parse_csv_with_header_aliases():
    csv_text = """text,option1,option2,option3,option4,correct_index,time,source_snippet
Gravity on Earth?,8.8,9.8,10.8,11.8,2,20,Physics book
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 1
    assert valid_rows[0]["text"] == "Gravity on Earth?"
    assert valid_rows[0]["time_limit"] == 20
    assert valid_rows[0]["source_snippet"] == "Physics book"


def test_missing_required_headers_raises_error():
    csv_text = """title,option_1,option_2,option_3,option_4
Question without correct answer,A,B,C,D
"""
    with pytest.raises(InvalidCsvHeaderError) as exc_info:
        parse_csv_content(csv_text)
    assert "Missing required headers" in str(exc_info.value)


def test_empty_csv_raises_error():
    with pytest.raises(EmptyCsvError):
        parse_csv_content("")

    with pytest.raises(EmptyCsvError):
        parse_csv_content("   \n\n  ")


def test_rejected_row_for_empty_question():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
,A,B,C,D,1
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 0
    assert len(rejected_rows) == 1
    assert rejected_rows[0].row_number == 2
    assert "Question text is required" in rejected_rows[0].reason


def test_rejected_row_for_empty_option():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Valid question?,A,,C,D,1
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 0
    assert len(rejected_rows) == 1
    assert "All 4 options must be non-empty" in rejected_rows[0].reason


def test_rejected_row_for_duplicate_options():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Duplicate options?,Apple,Banana,apple,Orange,1
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 0
    assert len(rejected_rows) == 1
    assert "All 4 options must be distinct" in rejected_rows[0].reason


def test_rejected_row_for_invalid_correct_answer():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Question?,A,B,C,D,5
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 0
    assert len(rejected_rows) == 1
    assert "Correct answer index must be between 1 and 4" in rejected_rows[0].reason


def test_rejected_row_for_invalid_time_limit():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer,time_limit
Question?,A,B,C,D,1,not-a-number
Question 2?,A,B,C,D,1,-5
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 0
    assert len(rejected_rows) == 2
    assert "Time limit must be an integer" in rejected_rows[0].reason
    assert "Time limit must be an integer greater than 0" in rejected_rows[1].reason


def test_mixed_valid_and_invalid_rows():
    csv_text = """question,option_1,option_2,option_3,option_4,correct_answer
Good question 1,A,B,C,D,1
Bad question,,B,C,D,1
Good question 2,E,F,G,H,2
"""
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(valid_rows) == 2
    assert len(rejected_rows) == 1
    assert rejected_rows[0].row_number == 3
    assert rejected_rows[0].row_data["question"] == "Bad question"


def test_quoted_values_with_commas():
    csv_text = '''question,option_1,option_2,option_3,option_4,correct_answer
"What is 1, 2, and 3?",First,Second,Third,Fourth,1
'''
    valid_rows, rejected_rows = parse_csv_content(csv_text)
    assert len(rejected_rows) == 0
    assert len(valid_rows) == 1
    assert valid_rows[0]["text"] == "What is 1, 2, and 3?"

