
from fastapi import APIRouter, File, UploadFile

from app.services.uplode import validate_pdf_upload

router = APIRouter()


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    file_size = await validate_pdf_upload(file)

    return {
        "message": "PDF uploaded and validated successfully.",
        "filename": file.filename,
        "size_bytes": file_size,
        "size_mb": round(file_size / (1024 * 1024), 2),
    }
