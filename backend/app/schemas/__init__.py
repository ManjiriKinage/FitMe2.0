"""Schema exports."""
from app.schemas.user import (
    CalorieCalculationInput,
    CalorieCalculationResult,
    ProfileCreate,
    ProfileUpdate,
    ProfileResponse,
)
from app.schemas.goals import (
    GoalUpdateRequest,
    GoalRecalculateResponse,
)
from app.schemas.food import (
    AIEstimateRequest,
    AIEstimateResponse,
    FoodLogCreate,
    FoodLogResponse,
    DashboardSummaryResponse,
    DailyMacroTotals,
)

__all__ = [
    "CalorieCalculationInput",
    "CalorieCalculationResult",
    "ProfileCreate",
    "ProfileUpdate",
    "ProfileResponse",
    "GoalUpdateRequest",
    "GoalRecalculateResponse",
    "AIEstimateRequest",
    "AIEstimateResponse",
    "FoodLogCreate",
    "FoodLogResponse",
    "DashboardSummaryResponse",
    "DailyMacroTotals",
]
