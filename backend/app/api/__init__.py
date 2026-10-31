"""API Routers package."""
from app.api.auth import router as auth_router
from app.api.profile import router as profile_router
from app.api.goals import router as goals_router
from app.api.food import router as food_router
from app.api.dashboard import router as dashboard_router
from app.api.meals import router as meals_router

__all__ = [
    "auth_router",
    "profile_router",
    "goals_router",
    "food_router",
    "dashboard_router",
    "meals_router",
]
