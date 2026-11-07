from pathlib import Path
from dotenv import find_dotenv, load_dotenv

# Load environment variables
load_dotenv(find_dotenv(usecwd=True))
_root_env = Path(__file__).resolve().parents[2] / ".env"
if _root_env.exists():
    load_dotenv(_root_env)

from fastapi import FastAPI

from app.api.questions import router as questions_router
from app.api.quizzes import router as quizzes_router
from app.api.uplode import router as upload_router
from app.api.question import router as question_crud_router

app = FastAPI(title="LockIn API")

app.include_router(upload_router, prefix="/api", tags=["Upload"])
app.include_router(quizzes_router, prefix="/api/quizzes", tags=["Quizzes"])
app.include_router(questions_router, prefix="/api/questions", tags=["Questions"])

app.include_router(
    question_crud_router,
    prefix="/api",
    tags=["Questions"]
)

@app.get("/")
async def root():
    return {"message": "LockIn API is running"}
