"""Food estimation and logging schemas."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List, Dict
from datetime import datetime

MealType = Literal["breakfast", "lunch", "dinner", "snack"]

class AIEstimateRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=300, description="E.g., '2 medium chapatis with 1 bowl moong dal'")

class AIEstimateResponse(BaseModel):
    food_name: str
    quantity: float
    unit: str
    estimated_calories: float
    protein_g: float
    carbohydrates_g: float
    fat_g: float
    assumptions: str
    uncertainty_note: Optional[str] = None
    clarification_question: Optional[str] = None

class FoodLogCreate(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=150)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=50)
    estimated_calories: float = Field(..., ge=0)
    protein_g: float = Field(0.0, ge=0)
    carbohydrates_g: float = Field(0.0, ge=0)
    fat_g: float = Field(0.0, ge=0)
    meal_type: MealType
    logged_at: Optional[datetime] = None

class FoodLogResponse(BaseModel):
    id: str
    user_id: str
    food_name: str
    quantity: float
    unit: str
    estimated_calories: float
    protein_g: float
    carbohydrates_g: float
    fat_g: float
    meal_type: MealType
    logged_at: datetime
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class DailyMacroTotals(BaseModel):
    calories: float = 0.0
    protein_g: float = 0.0
    carbohydrates_g: float = 0.0
    fat_g: float = 0.0

class DashboardSummaryResponse(BaseModel):
    date: str
    daily_calorie_target: int
    calories_consumed: float
    calories_remaining: float
    percentage_consumed: float
    macro_totals: DailyMacroTotals
    macro_targets: Optional[Dict[str, float]] = None
    meals: Dict[MealType, List[FoodLogResponse]]

class RecipeSearchResult(BaseModel):
    source_recipe_code: str
    name: str
    normalized_name: str
    reported_serving_unit: Optional[str] = "serving"
    reported_serving_size_g: Optional[float] = 150.0
    serving_energy_kcal: Optional[float] = None
    reported_energy_kcal_per_100g: float
    reported_protein_g_per_100g: float
    reported_carbohydrates_g_per_100g: float
    reported_fat_g_per_100g: float

class FoodFeedbackRequest(BaseModel):
    food_log_id: Optional[str] = None
    food_name: str
    original_calories: float
    corrected_calories: float
    corrected_quantity: Optional[float] = None
    corrected_unit: Optional[str] = None
    reason: Optional[str] = None
