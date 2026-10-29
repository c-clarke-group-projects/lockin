import os
import json
import time
import requests
from typing import Dict, Any, List

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

AI_TIMEOUT_SECONDS = int(os.getenv("AI_TIMEOUT_SECONDS", "60"))
AI_MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "3"))
AI_RETRY_BACKOFF_SECONDS = int(os.getenv("AI_RETRY_BACKOFF_SECONDS", "2"))

AI_MIN_QUESTIONS = int(os.getenv("AI_MIN_QUESTIONS", "5"))
AI_MAX_QUESTIONS = int(os.getenv("AI_MAX_QUESTIONS", "30"))


def validate_question_count_request(requested_count: int) -> int:
    """
    Validates and clamps requested question count within AI_MIN_QUESTIONS and AI_MAX_QUESTIONS limits.
    """
    if not isinstance(requested_count, int):
        raise ValueError("Question count must be an integer.")
        
    if requested_count < AI_MIN_QUESTIONS or requested_count > AI_MAX_QUESTIONS:
        raise ValueError(
            f"Question count must be between {AI_MIN_QUESTIONS} and {AI_MAX_QUESTIONS}. "
            f"Received: {requested_count}"
        )
        
    return requested_count


def build_generation_prompt(page_text: str, page_number: int, num_questions: int = 5) -> str:
    """
    Builds the structured prompt for AI question generation.
    """
    validated_count = validate_question_count_request(num_questions)
    
    return f"""
Generate exactly {validated_count} multiple choice questions based on the text below.
Format your response as a strict JSON array of objects. Do not include markdown code block syntax.

Each question object must match this schema:
{{
  "text": "Question text",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "correct_index": 0,
  "source_snippet": "Exact quote from the source text"
}}

Source Text (Page {page_number}):
{page_text}
"""


def call_ai_provider_with_retry(prompt: str) -> str:
    """
    Calls AI provider (Gemini or Ollama) with timeout, retry limit, and exponential backoff.
    """
    for attempt in range(AI_MAX_RETRIES):
        try:
            if AI_PROVIDER == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
                response = requests.post(url, json=payload, timeout=AI_TIMEOUT_SECONDS)
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            
            elif AI_PROVIDER == "ollama":
                url = f"{OLLAMA_BASE_URL}/api/generate"
                payload = {
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False
                }
                response = requests.post(url, json=payload, timeout=AI_TIMEOUT_SECONDS)
                response.raise_for_status()
                return response.json().get("response", "")
            
            else:
                raise ValueError(f"Unsupported AI provider: {AI_PROVIDER}")

        except Exception as e:
            if attempt == AI_MAX_RETRIES - 1:
                raise e
            sleep_time = AI_RETRY_BACKOFF_SECONDS ** attempt
            time.sleep(sleep_time)

    return ""