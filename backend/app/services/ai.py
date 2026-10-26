import os
import json
import time
import requests
from typing import Dict, Any, List

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

PROMPT_TEMPLATE = """
Generate multiple choice questions based on the text below.
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

def call_ai_provider_with_retry(prompt: str, max_retries: int = 3, timeout: int = 30) -> str:
    """
    Calls AI provider with timeout, retry limit, and exponential backoff.
    """
    for attempt in range(max_retries):
        try:
            if AI_PROVIDER == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
                response = requests.post(url, json=payload, timeout=timeout)
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            
            elif AI_PROVIDER == "ollama":
                payload = {
                    "model": "llama3",
                    "prompt": prompt,
                    "stream": False
                }
                response = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
                response.raise_for_status()
                return response.json().get("response", "")
            
            else:
                raise ValueError(f"Unsupported AI provider: {AI_PROVIDER}")

        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            sleep_time = 2 ** attempt
            time.sleep(sleep_time)

    return ""