"""User and profile schemas."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime

GenderType = Literal["male", "female", "other", "prefer_not_to_say"]
ActivityLevelType = Literal["sedentary", "lightly_active", "moderately_active", "very_active", "extra_active"]
FitnessGoalType = Literal["lose_weight", "maintain_weight", "gain_muscle", "gain_weight"]

class CalorieCalculationInput(BaseModel):
    age: int = Field(..., ge=10, le=120, description="Age in years")
    gender: GenderType
    height_cm: float = Field(..., ge=50, le=300, description="Height in centimeters")
    current_weight_kg: float = Field(..., ge=20, le=500, description="Current weight in kilograms")
    activity_level: ActivityLevelType
    fitness_goal: FitnessGoalType
    target_weight_kg: Optional[float] = Field(None, ge=20, le=500, description="Target weight in kilograms")

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
    target_weight_kg: Optional[float] = None
    daily_calorie_target: int
    bmr: Optional[int] = None
    tdee: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
