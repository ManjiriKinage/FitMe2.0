"""User and profile schemas."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime

GenderType = str
ActivityLevelType = str
FitnessGoalType = str
PaceType = str

class CalorieCalculationInput(BaseModel):
    age: int = Field(..., ge=10, le=120, description="Age in years")
    gender: GenderType
    height_cm: float = Field(..., ge=50, le=300, description="Height in centimeters")
    current_weight_kg: float = Field(..., ge=20, le=500, description="Current weight in kilograms")
    activity_level: ActivityLevelType
    fitness_goal: FitnessGoalType
    target_weight_kg: Optional[float] = Field(None, ge=20, le=500, description="Target weight in kilograms")
    pace: Optional[PaceType] = Field("steady", description="Weight loss or gain pace")

class CalorieCalculationResult(BaseModel):
    bmr: int
    tdee: int
    daily_calorie_target: int
    bmi: float
    bmi_category: str
    macro_targets: dict
    explanation: str
    warnings: list[str] = []

class ProfileCreate(CalorieCalculationInput):
    full_name: str = Field(..., min_length=1, max_length=100)

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    age: Optional[int] = Field(None, ge=10, le=120)
    gender: Optional[GenderType] = None
    height_cm: Optional[float] = Field(None, ge=50, le=300)
    current_weight_kg: Optional[float] = Field(None, ge=20, le=500)
    activity_level: Optional[ActivityLevelType] = None
    fitness_goal: Optional[FitnessGoalType] = None
    pace: Optional[PaceType] = None
    target_weight_kg: Optional[float] = Field(None, ge=20, le=500)

class ProfileResponse(BaseModel):
    id: str
    full_name: str
    age: int
    gender: GenderType
    height_cm: float
    current_weight_kg: float
    activity_level: ActivityLevelType
    fitness_goal: FitnessGoalType
    pace: Optional[str] = "steady"
    target_weight_kg: Optional[float] = None
    daily_calorie_target: int
    bmr: Optional[int] = None
    tdee: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
