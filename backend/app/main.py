from fastapi import FastAPI

from app.api.quizzes import router as quizzes_router

app = FastAPI()
app.include_router(quizzes_router, prefix="/api/quizzes", tags=["quizzes"])
