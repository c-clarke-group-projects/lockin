from typing import List, Dict, Any
import logging
import pdfplumber

logger = logging.getLogger(__name__)


def extract_text_by_page(file_path: str) -> List[Dict[str, Any]]:
    """
    Extracts text per page from a PDF file using pdfplumber.
    Returns a list of dicts with page_number and extracted text.
    Pages with no extractable text are logged as skipped.
    """
    extracted_pages = []

    with pdfplumber.open(file_path) as pdf:
        for index, page in enumerate(pdf.pages):
            page_number = index + 1
            text = (page.extract_text() or "").strip()

            if not text:
                logger.warning(
                    "Skipped page %s in %s: no extractable text (possibly scanned)",
                    page_number,
                    file_path,
                )

            extracted_pages.append({
                "page_number": page_number,
                "text": text
            })

    return extracted_pages