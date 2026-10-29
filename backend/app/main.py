from fastapi import FastAPI

from app.api.questions import router as questions_router
from app.api.quizzes import router as quizzes_router
from app.api.uplode import router as upload_router

app = FastAPI(title="LockIn API")

app.include_router(upload_router, prefix="/api", tags=["Upload"])
app.include_router(quizzes_router, prefix="/api/quizzes", tags=["Quizzes"])
app.include_router(questions_router, prefix="/api/questions", tags=["Questions"])


@app.get("/")
async def root():
    return {"message": "LockIn API is running"}
