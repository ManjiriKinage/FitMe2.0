"""Nutrition aggregation service for daily calories and macronutrient totals."""
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from app.schemas.food import (
    FoodLogResponse,
    DashboardSummaryResponse,
    DailyMacroTotals,
    MealType
)

def aggregate_daily_dashboard(
    daily_calorie_target: int,
    food_logs: List[Dict[str, Any]],
    target_date: str,
    macro_targets: Optional[Dict[str, float]] = None
) -> DashboardSummaryResponse:
    """
    Aggregates food logs for the selected date into structured meal categories and macro totals.
    Gracefully handles targets exceeded without presenting excess as failure.
    """
    meals: Dict[MealType, List[FoodLogResponse]] = {
        "breakfast": [],
        "lunch": [],
        "dinner": [],
        "snack": []
    }

    total_cals = 0.0
    total_p = 0.0
    total_c = 0.0
    total_f = 0.0

    for item in food_logs:
        log_obj = FoodLogResponse(
            id=str(item.get("id")),
            user_id=str(item.get("user_id")),
            food_name=item.get("food_name", "Unknown Food"),
            quantity=float(item.get("quantity", 1.0)),
            unit=item.get("unit", "serving"),
            estimated_calories=float(item.get("estimated_calories", 0.0)),
            protein_g=float(item.get("protein_g", 0.0)),
            carbohydrates_g=float(item.get("carbohydrates_g", 0.0)),
            fat_g=float(item.get("fat_g", 0.0)),
            meal_type=item.get("meal_type", "snack"),
            logged_at=item.get("logged_at"),
            created_at=item.get("created_at")
        )
        meal_key = log_obj.meal_type if log_obj.meal_type in meals else "snack"
        meals[meal_key].append(log_obj)

        total_cals += log_obj.estimated_calories
        total_p += log_obj.protein_g
        total_c += log_obj.carbohydrates_g
        total_f += log_obj.fat_g

    total_cals = round(total_cals, 1)
    total_p = round(total_p, 1)
    total_c = round(total_c, 1)
    total_f = round(total_f, 1)

    # Reconciled meal subtotals
    meal_subtotals: Dict[str, float] = {
        "breakfast": round(sum(i.estimated_calories for i in meals["breakfast"]), 1),
        "lunch": round(sum(i.estimated_calories for i in meals["lunch"]), 1),
        "dinner": round(sum(i.estimated_calories for i in meals["dinner"]), 1),
        "snack": round(sum(i.estimated_calories for i in meals["snack"]), 1),
    }

    # Safe calculation of calories remaining or over target
    if total_cals > daily_calorie_target:
        remaining = 0.0
        over_target = round(total_cals - float(daily_calorie_target), 1)
    else:
        remaining = round(float(daily_calorie_target) - total_cals, 1)
        over_target = 0.0

    # Percentage consumed (capped at 100% for progress rings, but raw counts accurately shown)
    pct = round((total_cals / daily_calorie_target * 100.0), 1) if daily_calorie_target > 0 else 0.0

    return DashboardSummaryResponse(
        date=target_date,
        daily_calorie_target=daily_calorie_target,
        calories_consumed=total_cals,
        calories_remaining=remaining,
        calories_over_target=over_target,
        percentage_consumed=pct,
        macro_totals=DailyMacroTotals(
            calories=total_cals,
            protein_g=total_p,
            carbohydrates_g=total_c,
            fat_g=total_f
        ),
        macro_targets=macro_targets,
        meal_subtotals=meal_subtotals,
        meals=meals,
        timezone="UTC"
    )
