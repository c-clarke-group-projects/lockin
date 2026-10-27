import json
from typing import List, Dict, Any, Tuple

def validate_question(question: Dict[str, Any], page_text: str) -> Tuple[bool, str]:
    """
    Validates:
    1. Exactly 4 options in options list.
    2. Exactly 1 valid correct_index (0 to 3).
    3. Source snippet quote exists in page text.
    """
    options = question.get("options")
    if not isinstance(options, list) or len(options) != 4:
        return False, "Question must have exactly 4 options"
    
    correct_idx = question.get("correct_index")
    if not isinstance(correct_idx, int) or correct_idx not in [0, 1, 2, 3]:
        return False, "Invalid correct_index (must be integer 0, 1, 2, or 3)"
    
    snippet = question.get("source_snippet", "").strip()
    if not snippet or snippet.lower() not in page_text.lower():
        return False, "Source snippet not found in page text"
    
    return True, "Valid"


def parse_and_validate_ai_response(raw_response: str, page_text: str) -> List[Dict[str, Any]]:
    """
    Parses raw AI output text into JSON array and filters out rejected questions.
    """
    cleaned_text = raw_response.strip()
    
    # Strip markdown code fencing if present
    if cleaned_text.startswith("```"):
        lines = cleaned_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned_text = "\n".join(lines).strip()

    try:
        questions = json.loads(cleaned_text)
    except json.JSONDecodeError:
        return []

    if not isinstance(questions, list):
        return []

    valid_questions = []
    for q in questions:
        if isinstance(q, dict):
            is_valid, _ = validate_question(q, page_text)
            if is_valid:
                valid_questions.append(q)

    return valid_questions