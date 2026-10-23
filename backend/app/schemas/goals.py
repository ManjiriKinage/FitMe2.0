"""Goal update and comparison schemas."""
from pydantic import BaseModel, Field
from typing import Optional
from app.schemas.user import ActivityLevelType, FitnessGoalType, CalorieCalculationResult

class GoalUpdateRequest(BaseModel):
    current_weight_kg: Optional[float] = Field(None, ge=20, le=500)
    target_weight_kg: Optional[float] = Field(None, ge=20, le=500)
    activity_level: Optional[ActivityLevelType] = None
    fitness_goal: Optional[FitnessGoalType] = None
    age: Optional[int] = Field(None, ge=10, le=120)
    height_cm: Optional[float] = Field(None, ge=50, le=300)

class GoalRecalculateResponse(BaseModel):
    previous_daily_calorie_target: int
    new_daily_calorie_target: int
    difference: int
    calculation_details: CalorieCalculationResult
    change_reasons: list[str]
