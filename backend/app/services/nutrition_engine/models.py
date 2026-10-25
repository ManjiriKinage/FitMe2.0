"""Pydantic data models for the Core Nutrition Engine."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal


class IngredientCalculationInput(BaseModel):
    ingredient_code: Optional[str] = None
    ingredient_name: str
    weight_g: float = Field(..., gt=0, description="Ingredient weight in grams")
    food_state: Literal["raw", "cooked", "dry", "prepared"] = "raw"
    energy_kcal_per_100g: Optional[float] = None
    protein_g_per_100g: Optional[float] = None
    carbohydrates_g_per_100g: Optional[float] = None
    fat_g_per_100g: Optional[float] = None
    fiber_g_per_100g: Optional[float] = None
    edible_portion_factor: float = Field(1.0, ge=0.0, le=1.0)


class IngredientCalculationResult(BaseModel):
    ingredient_name: str
    weight_g: float
    edible_weight_g: float
    energy_kcal: Optional[float] = None
    protein_g: Optional[float] = None
    carbohydrates_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    missing_nutrients: List[str] = Field(default_factory=list)
    calculation_basis: str


class RecipeCalculationInput(BaseModel):
    recipe_code: Optional[str] = None
    recipe_name: str
    ingredients: List[IngredientCalculationInput]
    cooked_yield_g: Optional[float] = None
    servings_count: float = Field(1.0, gt=0)
    serving_unit: str = "serving"
    oil_fat_addition_g: float = Field(0.0, ge=0)


class RecipeCalculationResult(BaseModel):
    recipe_name: str
    total_raw_weight_g: float
    cooked_yield_g: Optional[float] = None
    servings_count: float
    serving_weight_g: Optional[float] = None
    serving_unit: str
    # Per serving nutrition
    serving_energy_kcal: Optional[float] = None
    serving_protein_g: Optional[float] = None
    serving_carbohydrates_g: Optional[float] = None
    serving_fat_g: Optional[float] = None
    serving_fiber_g: Optional[float] = None
    # Total recipe nutrition
    total_energy_kcal: Optional[float] = None
    total_protein_g: Optional[float] = None
    total_carbohydrates_g: Optional[float] = None
    total_fat_g: Optional[float] = None
    total_fiber_g: Optional[float] = None
    ingredient_breakdown: List[IngredientCalculationResult] = Field(default_factory=list)
    uncertainty_flags: List[str] = Field(default_factory=list)
    missing_data_fields: List[str] = Field(default_factory=list)


class CandidateMatch(BaseModel):
    recipe_code: str
    name: str
    normalized_name: str
    match_type: Literal["exact_normalized", "alias", "ingredient_overlap", "token_similarity"]
    score: float
    serving_unit: str
    serving_size_g: float
    energy_kcal_per_100g: float
    protein_g_per_100g: Optional[float] = None
    carbohydrates_g_per_100g: Optional[float] = None
    fat_g_per_100g: Optional[float] = None
    aliases: List[str] = Field(default_factory=list)
    validation_status: str = "verified"
    food_id: Optional[str] = None
    profile_id: Optional[str] = None


class ItemNutritionResult(BaseModel):
    """Internal validated result containing transparent provenance."""
    selected_food_name: str
    recipe_code: Optional[str] = None
    food_id: Optional[str] = None
    profile_id: Optional[str] = None
    quantity: float = Field(..., gt=0)
    serving_unit: str
    serving_weight_g: Optional[float] = None
    total_calories: float
    protein_g: Optional[float] = None
    carbohydrates_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    nutrition_source: Literal[
        "nutrition_profile",
        "reference_dataset",
        "indb_verified_recipe",
        "recipe_ingredient_aggregation",
        "user_learned_preference",
        "ai_assisted_fallback",
        "ai_estimation",
        "clinical_heuristic",
        "needs_review_catalog_entry"
    ]
    calculation_method: Literal[
        "deterministic_indb_serving",
        "deterministic_per_100g_scaled",
        "recipe_yield_aggregation",
        "ai_heuristic_interpretation",
        "unverified_needs_review"
    ]
    validation_status: str = "verified"
    uncertainty_flags: List[str] = Field(default_factory=list)
    missing_data_fields: List[str] = Field(default_factory=list)
    clarification_question: Optional[str] = None
    needs_user_confirmation: bool = True
    alternative_candidates: List[str] = Field(default_factory=list)


class MultiItemEstimateResponse(BaseModel):
    """Reviewable estimate presented to user before saving."""
    original_input: str
    items: List[ItemNutritionResult]
    total_calories: float
    total_protein_g: float
    total_carbohydrates_g: float
    total_fat_g: float
    has_ambiguity: bool = False
    clarification_question: Optional[str] = None
    is_confirmed: bool = False


class FoodLogConfirmationItem(BaseModel):
    food_name: str
    quantity: float = Field(..., gt=0)
    serving_unit: str
    serving_weight_g: Optional[float] = None
    calories: float = Field(..., ge=0)
    protein_g: float = Field(0.0, ge=0)
    carbohydrates_g: float = Field(0.0, ge=0)
    fat_g: float = Field(0.0, ge=0)
    fiber_g: Optional[float] = None
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    nutrition_source: str = "nutrition_profile"
    calculation_method: str = "deterministic_per_100g_scaled"
    logged_at: Optional[str] = None
    idempotency_key: Optional[str] = None
    food_id: Optional[str] = None
    profile_id: Optional[str] = None


class BatchFoodLogRequest(BaseModel):
    items: List[FoodLogConfirmationItem]
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = "lunch"
    logged_at: Optional[str] = None
    idempotency_key: Optional[str] = None


class BatchFoodLogResponse(BaseModel):
    success: bool
    saved_count: int
    total_calories: float
    message: str
    food_log_ids: List[str] = Field(default_factory=list)
