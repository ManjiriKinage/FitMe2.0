"""Nutrition aggregation service for daily calories and macronutrient totals."""
import logging
import zoneinfo
from datetime import datetime, date, timezone
from typing import List, Dict, Any, Optional
from app.schemas.food import (
    FoodLogResponse,
    DashboardSummaryResponse,
    DailyMacroTotals,
    MealType
)
from app.services.calorie_calculator import calculate_macro_split

logger = logging.getLogger(__name__)

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


def fetch_and_calculate_daily_dashboard(
    client: Any,
    user_id: str,
    target_date: Optional[str] = None,
    user_tz_name: Optional[str] = None
) -> Optional[DashboardSummaryResponse]:
    """
    Fetches food logs for the user's local day and computes the updated dashboard summary.
    Handles timezone boundaries, daily calorie targets, and macro split calculations.
    Ensures users can access only their own food logs.
    """
    if not client or not user_id:
        return None

    try:
        # 1. Fetch user profile for daily calorie goal and configured timezone
        p_res = client.table("profiles").select("*").eq("id", user_id).execute()
        if not p_res.data or len(p_res.data) == 0:
            target_cals = 2000
            fitness_goal = "maintain_weight"
            current_weight = 70.0
            tz_str = user_tz_name or "UTC"
        else:
            profile = p_res.data[0]
            target_cals = int(profile.get("daily_calorie_target", 2000))
            fitness_goal = profile.get("fitness_goal", "maintain_weight")
            current_weight = float(profile.get("current_weight_kg", 70.0))
            tz_str = user_tz_name or profile.get("timezone") or "UTC"

        # Validate timezone
        try:
            user_tz = zoneinfo.ZoneInfo(tz_str)
        except Exception:
            user_tz = timezone.utc
            tz_str = "UTC"

        # Determine target local date
        if not target_date:
            date_str = datetime.now(user_tz).strftime("%Y-%m-%d")
        else:
            date_str = target_date

        # Compute exact UTC boundaries for the local day [00:00:00 to 23:59:59.999999]
        try:
            start_local = datetime.strptime(f"{date_str} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=user_tz)
            end_local = datetime.strptime(f"{date_str} 23:59:59.999999", "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=user_tz)
            start_ts = start_local.astimezone(timezone.utc).isoformat()
            end_ts = end_local.astimezone(timezone.utc).isoformat()
        except Exception:
            start_ts = f"{date_str}T00:00:00Z"
            end_ts = f"{date_str}T23:59:59Z"

        # 2. Fetch food logs strictly for this user within local day boundaries
        logs_res = (
            client.table("food_logs")
            .select("*")
            .eq("user_id", user_id)
            .gte("logged_at", start_ts)
            .lte("logged_at", end_ts)
            .order("logged_at", desc=False)
            .execute()
        )
        logs = logs_res.data or []

        # 3. Macro targets
        macro_targets = calculate_macro_split(target_cals, fitness_goal, current_weight)

        # 4. Aggregate dashboard
        summary = aggregate_daily_dashboard(
            daily_calorie_target=target_cals,
            food_logs=logs,
            target_date=date_str,
            macro_targets=macro_targets
        )
        summary.timezone = tz_str
        return summary
    except Exception as e:
        logger.warning(f"Could not calculate updated daily dashboard for user {user_id}: {e}")
        return None
