"""Water tracker endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime, timezone, date as date_type
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client

router = APIRouter(prefix="/water", tags=["Water Tracker"])

class WaterLogUpdate(BaseModel):
    logged_on: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")
    cups: int = Field(..., ge=0, le=24, description="Number of cups consumed")

@router.get("")
async def get_water_log(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetches water logs for a specific day along with user's daily water goal."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    target_date = date or today_str

    # Strict future date check
    if target_date > today_str:
        raise HTTPException(
            status_code=400,
            detail="Future dates are not allowed for water tracking."
        )

    # Fetch profile to get water goal
    water_goal = 8
    try:
        p_res = client.table("profiles").select("water_goal").eq("id", user["id"]).execute()
        if p_res.data and len(p_res.data) > 0:
            water_goal = p_res.data[0].get("water_goal") or 8
    except Exception:
        pass

    # Fetch water log
    cups = 0
    try:
        res = client.table("water_logs").select("*").eq("user_id", user["id"]).eq("logged_on", target_date).execute()
        if res.data and len(res.data) > 0:
            cups = res.data[0].get("cups", 0)
    except Exception:
        # Table might not exist yet if migration pending
        pass

    return {
        "logged_on": target_date,
        "cups": cups,
        "water_goal": water_goal
    }

@router.put("")
async def update_water_log(
    payload: WaterLogUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Updates or upserts water log for a day."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    target_date = payload.logged_on or today_str

    if target_date > today_str:
        raise HTTPException(
            status_code=400,
            detail="Future dates are not allowed for water tracking."
        )

    # Fetch profile goal
    water_goal = 8
    try:
        p_res = client.table("profiles").select("water_goal").eq("id", user["id"]).execute()
        if p_res.data and len(p_res.data) > 0:
            water_goal = p_res.data[0].get("water_goal") or 8
    except Exception:
        pass

    # Keep value between 0 and water_goal + 4
    max_cups = water_goal + 4
    clamped_cups = max(0, min(payload.cups, max_cups))

    record = {
        "user_id": user["id"],
        "logged_on": target_date,
        "cups": clamped_cups,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    try:
        res = client.table("water_logs").upsert(record, on_conflict="user_id,logged_on").execute()
        if res.data and len(res.data) > 0:
            clamped_cups = res.data[0].get("cups", clamped_cups)
    except Exception as e:
        print("water_logs upsert note (table may be pending migration):", e)

    return {
        "logged_on": target_date,
        "cups": clamped_cups,
        "water_goal": water_goal
    }

