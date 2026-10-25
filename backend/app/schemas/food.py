"""Food estimation and logging schemas."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List, Dict
from datetime import datetime

MealType = Literal["breakfast", "lunch", "dinner", "snack"]

class AIEstimateRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=300, description="E.g., '2 medium chapatis with 1 bowl moong dal'")

class ParsedFoodItem(BaseModel):
    food_name: str
    quantity: float = Field(..., gt=0)
    unit: str
    estimated_calories: float = Field(..., ge=0)
    protein_g: float = Field(0.0, ge=0)
    carbohydrates_g: float = Field(0.0, ge=0)
    fat_g: float = Field(0.0, ge=0)
    fiber_g: Optional[float] = None
    serving_weight_g: Optional[float] = None
    nutrition_source: str = "nutrition_profile"
    calculation_method: str = "deterministic_per_100g_scaled"
    validation_status: str = "verified"
    clarification_question: Optional[str] = None
    uncertainty_note: Optional[str] = None
    assumptions: Optional[str] = None
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

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
    items: Optional[List[ParsedFoodItem]] = None
    has_ambiguity: bool = False
    needs_user_confirmation: bool = True
    validation_status: str = "verified"
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

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
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

class FoodLogUpdate(BaseModel):
    food_name: Optional[str] = Field(None, min_length=1, max_length=150)
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = Field(None, min_length=1, max_length=50)
    estimated_calories: Optional[float] = Field(None, ge=0)
    protein_g: Optional[float] = Field(None, ge=0)
    carbohydrates_g: Optional[float] = Field(None, ge=0)
    fat_g: Optional[float] = Field(None, ge=0)
    meal_type: Optional[MealType] = None
    logged_at: Optional[datetime] = None
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

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
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

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
    calories_over_target: float = 0.0
    percentage_consumed: float
    macro_totals: DailyMacroTotals
    macro_targets: Optional[Dict[str, float]] = None
    meal_subtotals: Dict[str, float] = Field(default_factory=dict)
    meals: Dict[MealType, List[FoodLogResponse]]
    timezone: str = "UTC"

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

class RecipeDetailResponse(BaseModel):
    source_recipe_code: str
    name: str
    normalized_name: str
    aliases: List[str] = Field(default_factory=list)
    reported_serving_unit: str = "serving"
    reported_serving_size_g: float = 150.0
    serving_energy_kcal: Optional[float] = None
    serving_protein_g: Optional[float] = None
    serving_carbohydrates_g: Optional[float] = None
    serving_fat_g: Optional[float] = None
    reported_energy_kcal_per_100g: float
    reported_protein_g_per_100g: Optional[float] = None
    reported_carbohydrates_g_per_100g: Optional[float] = None
    reported_fat_g_per_100g: Optional[float] = None
    reported_fiber_g_per_100g: Optional[float] = None

class FoodFeedbackRequest(BaseModel):
    food_log_id: Optional[str] = None
    food_name: str
    original_calories: float
    corrected_calories: float
    corrected_quantity: Optional[float] = None
    corrected_unit: Optional[str] = None
    reason: Optional[str] = None

class UserPreferenceResponse(BaseModel):
    id: str
    user_id: str
    food_key: str
    preferred_serving_quantity: float
    preferred_serving_unit: str
    preferred_serving_weight_g: Optional[float] = None
    confirmed_observations: int
    last_confirmed_at: datetime
    created_at: Optional[datetime] = None

class UserPreferenceUpdate(BaseModel):
    preferred_serving_quantity: float = Field(..., gt=0)
    preferred_serving_unit: str = Field(..., min_length=1)
    preferred_serving_weight_g: Optional[float] = Field(None, gt=0)

class BatchFoodLogRequest(BaseModel):
    items: List[FoodLogCreate]
    meal_type: MealType = "lunch"
    logged_at: Optional[datetime] = None
    idempotency_key: Optional[str] = None

class BatchFoodLogResponse(BaseModel):
    success: bool
    saved_count: int
    total_calories: float
    message: str
    saved_logs: List[FoodLogResponse] = Field(default_factory=list)
