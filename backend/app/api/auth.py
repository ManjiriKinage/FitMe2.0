"""Authentication and onboarding endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from app.schemas.user import CalorieCalculationInput, CalorieCalculationResult
from app.services.calorie_calculator import calculate_calories
from app.db.supabase import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication & Onboarding"])

@router.post("/calculate", response_model=CalorieCalculationResult)
async def preview_calorie_recommendation(payload: CalorieCalculationInput):
    """
    Computes live personalized calorie recommendations, BMR, TDEE, and macro targets
    during registration or profile setup.
    """
    try:
        return calculate_calories(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate recommendation: {str(e)}"
        )

@router.get("/me")
async def get_current_session(user: Dict[str, Any] = Depends(get_current_user)):
    """Returns basic token authentication state."""
    return {"authenticated": True, "user": user}
