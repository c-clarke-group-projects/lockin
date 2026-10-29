from fastapi import FastAPI

from app.api.uplode import router as upload_router
from app.api.rooms import router as rooms_router

app = FastAPI(title="LockIn API")

app.include_router(upload_router, prefix="/api", tags=["Upload"])
app.include_router(rooms_router, prefix="/api", tags=["Rooms"])


@app.get("/")
async def root():
    return {"message": "LockIn API is running"}
