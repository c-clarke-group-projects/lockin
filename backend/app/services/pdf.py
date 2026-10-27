from typing import List, Dict, Any
import pdfplumber

def extract_text_by_page(file_path: str) -> List[Dict[str, Any]]:
    """
    Extracts text per page from a PDF file using pdfplumber.
    Returns a list of dicts with page_number and extracted text.
    Skipped or empty pages return empty strings.
    """
    extracted_pages = []
    with pdfplumber.open(file_path) as pdf:
        for index, page in enumerate(pdf.pages):
            page_number = index + 1
            text = page.extract_text() or ""
            extracted_pages.append({
                "page_number": page_number,
                "text": text.strip()
            })
    return extracted_pages