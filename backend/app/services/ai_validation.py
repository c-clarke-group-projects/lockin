import json
from typing import List, Dict, Any, Tuple

def validate_question(question: Dict[str, Any], page_text: str) -> Tuple[bool, str]:
    """
    Validates:
    1. Exactly 4 options.
    2. Exactly 1 valid correct_index (0 to 3).
    3. Source snippet quote exists in page text.
    """
    if not isinstance(question.get("options"), list) or len(question["options"]) != 4:
        return False, "Question must have exactly 4 options"
    
    correct_idx = question.get("correct_index")
    if not isinstance(correct_idx, int) or correct_idx not in [0, 1, 2, 3]:
        return False, "Invalid correct_index (must be 0, 1, 2, or 3)"
    
    snippet = question.get("source_snippet", "").strip()
    if not snippet or snippet.lower() not in page_text.lower():
        return False, "Source snippet not found in page text"
    
    return True, "Valid"

def parse_and_validate_ai_response(raw_response: str, page_text: str) -> List[Dict[str, Any]]:
    """
    Parses raw AI text into JSON and filters out invalid questions.
    """
    cleaned_text = raw_response.strip()
    if cleaned_text.startswith("```"):
        lines = cleaned_text.splitlines()
        cleaned_text = "\n".join(lines[1:-1])

    try:
        questions = json.loads(cleaned_text)
    except json.JSONDecodeError:
        return []

    valid_questions = []
    for q in questions:
        is_valid, _ = validate_question(q, page_text)
        if is_valid:
            valid_questions.append(q)

    return valid_questions