from dotenv import load_dotenv

# Load environment variables
load_dotenv("backend/.env")

from fastapi import FastAPI

from app.api.uplode import router as upload_router
from app.api.question import router as questions_router

app = FastAPI(title="LockIn API")

app.include_router(
    upload_router,
    prefix="/api",
    tags=["Upload"]
)

app.include_router(
    questions_router,
    prefix="/api",
    tags=["Questions"]
)

@app.get("/")
async def root():
    return {"message": "LockIn API is running"}