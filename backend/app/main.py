
from fastapi import FastAPI

from app.api.uplode import router as upload_router

app = FastAPI(title="LockIn API")

app.include_router(upload_router, prefix="/api", tags=["Upload"])


@app.get("/")
async def root():
    return {"message": "LockIn API is running"}
