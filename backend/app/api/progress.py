"""Progress tracking endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.user import CalorieCalculationInput
from app.services.calorie_calculator import calculate_calories

router = APIRouter(prefix="/progress", tags=["Progress & Weight Tracking"])

class WeightLogCreate(BaseModel):
    weight_kg: float = Field(..., ge=20.0, le=300.0, description="Weight in kilograms")
    logged_on: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")

@router.get("")
async def get_progress_data(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns data needed for the Progress page:
    - User profile details (goals, starting/current/target weight, daily targets)
    - Weight logs for the last 8 weeks (sorted by date)
    - Calorie logs per day for the last 14 days
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    # 1. Profile
    profile = {}
    try:
        p_res = client.table("profiles").select("*").eq("id", user["id"]).execute()
        if p_res.data and len(p_res.data) > 0:
            profile = p_res.data[0]
    except Exception as e:
        print("get_progress_data profile note:", e)

    # 2. Weight logs (last 8 weeks = 56 days)
    eight_weeks_ago = (datetime.now(timezone.utc) - timedelta(days=56)).strftime("%Y-%m-%d")
    weight_logs: List[Dict[str, Any]] = []
    try:
        w_res = (
            client.table("weight_logs")
            .select("*")
            .eq("user_id", user["id"])
            .gte("logged_on", eight_weeks_ago)
            .order("logged_on", desc=False)
            .execute()
        )
        if w_res.data:
            weight_logs = w_res.data
    except Exception as e:
        print("weight_logs fetch note (migration may be pending):", e)

    # 3. Calorie logs for last 14 days
    fourteen_days_ago = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    calorie_trend: List[Dict[str, Any]] = []
    try:
        f_res = (
            client.table("food_logs")
            .select("calories, protein_g, logged_at")
            .eq("user_id", user["id"])
            .gte("logged_at", fourteen_days_ago)
            .order("logged_at", desc=False)
            .execute()
        )
        
        # Group by date YYYY-MM-DD
        day_map: Dict[str, Dict[str, float]] = {}
        for row in (f_res.data or []):
            logged_at = row.get("logged_at")
            if not logged_at:
                continue
            day_str = logged_at[:10]
            if day_str not in day_map:
                day_map[day_str] = {"calories": 0.0, "protein": 0.0}
            day_map[day_str]["calories"] += float(row.get("calories") or 0)
            day_map[day_str]["protein"] += float(row.get("protein_g") or 0)

        # Convert to sorted list
        for d in sorted(day_map.keys()):
            calorie_trend.append({
                "date": d,
                "calories": round(day_map[d]["calories"]),
                "protein": round(day_map[d]["protein"])
            })
    except Exception as e:
        print("food_logs for calorie trend note:", e)

    return {
        "profile": profile,
        "weight_logs": weight_logs,
        "calorie_trend": calorie_trend
    }

@router.post("/weight")
async def log_weight(
    payload: WeightLogCreate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Upserts weight log for a specific date (default today; no future dates).
    Then updates the profile's current_weight_kg and recalculates daily calorie target.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    target_date = payload.logged_on or today_str

    if target_date > today_str:
        raise HTTPException(
            status_code=400,
            detail="Future dates are not allowed for weight logging."
        )

    # 1. Upsert into weight_logs
    weight_record = {
        "user_id": user["id"],
        "logged_on": target_date,
        "weight_kg": payload.weight_kg,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    saved_log = weight_record
    try:
        w_res = client.table("weight_logs").upsert(weight_record, on_conflict="user_id,logged_on").execute()
        if w_res.data and len(w_res.data) > 0:
            saved_log = w_res.data[0]
    except Exception as e:
        print("weight_logs upsert note (migration may be pending):", e)

    # 2. Update profile's current_weight_kg and recalculate target
    updated_profile = {}
    try:
        p_res = client.table("profiles").select("*").eq("id", user["id"]).execute()
        curr_p = p_res.data[0] if (p_res.data and len(p_res.data) > 0) else {}

        calc_input = CalorieCalculationInput(
            age=int(curr_p.get("age", 25)),
            gender=curr_p.get("gender", "female"),
            height_cm=float(curr_p.get("height_cm", 170.0)),
            current_weight_kg=payload.weight_kg,
            activity_level=curr_p.get("activity_level", "moderately_active"),
            fitness_goal=curr_p.get("fitness_goal", "lose_weight"),
            pace=curr_p.get("pace") or "steady",
            target_weight_kg=float(curr_p["target_weight_kg"]) if curr_p.get("target_weight_kg") else None
        )
        rec = calculate_calories(calc_input)

        profile_patch = {
            "current_weight_kg": payload.weight_kg,
            "daily_calorie_target": rec.daily_calorie_target,
            "bmr": rec.bmr,
            "tdee": rec.tdee,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        up_res = client.table("profiles").update(profile_patch).eq("id", user["id"]).execute()
        if up_res.data and len(up_res.data) > 0:
            updated_profile = up_res.data[0]
        else:
            curr_p.update(profile_patch)
            updated_profile = curr_p
    except Exception as e:
        print("profile weight sync note:", e)

    return {
        "weight_log": saved_log,
        "profile": updated_profile
    }

