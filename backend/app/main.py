"""FitMe Backend API - FastAPI Application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import (
    auth_router,
    profile_router,
    goals_router,
    food_router,
    dashboard_router,
    meals_router
)

app = FastAPI(
    title="FitMe API",
    description="AI-Powered Personalized Calorie Tracker Backend",
    version="1.0.0"
)

import logging
from fastapi.responses import JSONResponse
from fastapi import Request
from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(APIError)
async def postgrest_api_error_handler(request: Request, exc: APIError):
    logger.error(f"PostgREST error on {request.url.path}: {exc}")
    detail = exc.message if hasattr(exc, "message") else str(exc)
    return JSONResponse(
        status_code=400,
        content={"detail": detail}
    )

# Register API Routers
app.include_router(auth_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(goals_router, prefix="/api")
app.include_router(food_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(meals_router, prefix="/api")

@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "service": "FitMe Backend",
        "version": "1.0.0",
        "supabase_configured": bool(settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY),
        "gemini_configured": bool(settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith("your-"))
    }

@app.get("/", tags=["System"])
async def root():
    return {"message": "Welcome to FitMe V1 API — AI-Powered Personalized Calorie Tracker"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main.py:app", host="0.0.0.0", port=settings.PORT, reload=True)
