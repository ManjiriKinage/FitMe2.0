"""Dashboard aggregation API endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import DashboardSummaryResponse
from app.services.nutrition_service import aggregate_daily_dashboard
from app.services.calorie_calculator import calculate_macro_split

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardSummaryResponse)
async def get_dashboard(
    date: Optional[str] = Query(None, description="Local date YYYY-MM-DD"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns the comprehensive daily dashboard:
    - Daily calorie goal
    - Calories consumed today
    - Calories remaining
    - Macronutrient totals & targets
    - Meals grouped by breakfast, lunch, dinner, snack
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    # 1. Fetch user profile for daily calorie goal
    p_res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not p_res.data or len(p_res.data) == 0:
        # Default placeholder target if profile is not yet completed
        target_cals = 2000
        fitness_goal = "maintain_weight"
        current_weight = 70.0
    else:
        profile = p_res.data[0]
        target_cals = int(profile.get("daily_calorie_target", 2000))
        fitness_goal = profile.get("fitness_goal", "maintain_weight")
        current_weight = float(profile.get("current_weight_kg", 70.0))

    # Determine date
    target_date = date or datetime.now().strftime("%Y-%m-%d")

    # 2. Fetch food logs for user on that date
    start_ts = f"{target_date}T00:00:00Z"
    end_ts = f"{target_date}T23:59:59Z"

    logs_res = (
        client.table("food_logs")
        .select("*")
        .eq("user_id", user["id"])
        .gte("logged_at", start_ts)
        .lte("logged_at", end_ts)
        .order("logged_at", desc=False)
        .execute()
    )
    logs = logs_res.data or []

    # 3. Macro targets
    macro_targets = calculate_macro_split(target_cals, fitness_goal, current_weight)

    # 4. Aggregate dashboard
    return aggregate_daily_dashboard(
        daily_calorie_target=target_cals,
        food_logs=logs,
        target_date=target_date,
        macro_targets=macro_targets
    )
