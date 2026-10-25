"""Nutrition Engine Package."""
from app.services.nutrition_engine.models import (
    IngredientCalculationInput,
    IngredientCalculationResult,
    RecipeCalculationInput,
    RecipeCalculationResult,
    CandidateMatch,
    ItemNutritionResult,
    MultiItemEstimateResponse,
    FoodLogConfirmationItem,
    BatchFoodLogRequest,
    BatchFoodLogResponse,
)
from app.services.nutrition_engine.calculator import (
    calculate_ingredient,
    calculate_recipe,
    resolve_serving_weight,
)
from app.services.nutrition_engine.matcher import (
    split_multi_item_description,
    parse_item_portion,
    detect_material_ambiguity,
)
from app.services.nutrition_engine.engine import nutrition_engine

__all__ = [
    "nutrition_engine",
    "calculate_ingredient",
    "calculate_recipe",
    "resolve_serving_weight",
    "split_multi_item_description",
    "parse_item_portion",
    "detect_material_ambiguity",
    "IngredientCalculationInput",
    "IngredientCalculationResult",
    "RecipeCalculationInput",
    "RecipeCalculationResult",
    "CandidateMatch",
    "ItemNutritionResult",
    "MultiItemEstimateResponse",
    "FoodLogConfirmationItem",
    "BatchFoodLogRequest",
    "BatchFoodLogResponse",
]
