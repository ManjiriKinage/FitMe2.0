"""Dashboard aggregation API endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import DashboardSummaryResponse
from app.services.nutrition_service import aggregate_daily_dashboard
from app.services.calorie_calculator import calculate_macro_split

import zoneinfo

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardSummaryResponse)
async def get_dashboard(
    date: Optional[str] = Query(None, description="Local date YYYY-MM-DD"),
    tz: Optional[str] = Query(None, description="User timezone (e.g. Asia/Kolkata, America/New_York)"),
    x_timezone: Optional[str] = Header(None, alias="X-Timezone"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns the comprehensive daily dashboard:
    - Daily calorie goal
    - Calories consumed today
    - Calories remaining / over target
    - Macronutrient totals & targets
    - Meals grouped by breakfast, lunch, dinner, snack with reconciled subtotals
    - True local-day start and end boundary calculation using user's timezone
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    # 1. Fetch user profile for daily calorie goal and configured timezone
    p_res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not p_res.data or len(p_res.data) == 0:
        target_cals = 2000
        fitness_goal = "maintain_weight"
        current_weight = 70.0
        user_tz_name = tz or x_timezone or "UTC"
    else:
        profile = p_res.data[0]
        target_cals = int(profile.get("daily_calorie_target", 2000))
        fitness_goal = profile.get("fitness_goal", "maintain_weight")
        current_weight = float(profile.get("current_weight_kg", 70.0))
        user_tz_name = tz or x_timezone or profile.get("timezone") or "UTC"

    # Validate timezone
    try:
        user_tz = zoneinfo.ZoneInfo(user_tz_name)
    except Exception:
        user_tz = timezone.utc
        user_tz_name = "UTC"

    # Determine target local date
    if not date:
        target_date = datetime.now(user_tz).strftime("%Y-%m-%d")
    else:
        target_date = date

    # Compute exact UTC boundaries for the local day [00:00:00.000000 to 23:59:59.999999]
    try:
        start_local = datetime.strptime(f"{target_date} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=user_tz)
        end_local = datetime.strptime(f"{target_date} 23:59:59.999999", "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=user_tz)
        start_ts = start_local.astimezone(timezone.utc).isoformat()
        end_ts = end_local.astimezone(timezone.utc).isoformat()
    except Exception:
        start_ts = f"{target_date}T00:00:00Z"
        end_ts = f"{target_date}T23:59:59Z"

    # 2. Fetch food logs for user within local day boundaries
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
    summary = aggregate_daily_dashboard(
        daily_calorie_target=target_cals,
        food_logs=logs,
        target_date=target_date,
        macro_targets=macro_targets
    )
    summary.timezone = user_tz_name
    return summary
