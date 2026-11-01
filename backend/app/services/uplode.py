
from fastapi import HTTPException, UploadFile

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
PDF_SIGNATURE = b"%PDF-"


async def validate_pdf_upload(file: UploadFile) -> int:
    """Validate the uploaded file type and size."""

    filename = file.filename or ""

    
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PDF files are allowed.",
        )

    
    content = await file.read(MAX_FILE_SIZE + 1)
    await file.seek(0)

   
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum allowed size is 10 MB.",
        )

    
    if not content.startswith(PDF_SIGNATURE):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file. The file content is not a valid PDF signature.",
        )

    return len(content)
