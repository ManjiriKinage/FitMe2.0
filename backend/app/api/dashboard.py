"""Dashboard aggregation API endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import DashboardSummaryResponse
from app.services.nutrition_service import aggregate_daily_dashboard, fetch_and_calculate_daily_dashboard
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

    user_tz_name = tz or x_timezone or "UTC"
    summary = fetch_and_calculate_daily_dashboard(
        client=client,
        user_id=user["id"],
        target_date=date,
        user_tz_name=user_tz_name
    )

    if not summary:
        raise HTTPException(status_code=500, detail="Could not compute dashboard summary.")

    return summary
