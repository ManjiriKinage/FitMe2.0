"""Profile endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.user import ProfileCreate, ProfileUpdate, ProfileResponse, CalorieCalculationInput
from app.services.calorie_calculator import calculate_calories

router = APIRouter(prefix="/profile", tags=["Profile"])

@router.get("", response_model=ProfileResponse)
async def get_profile(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch the authenticated user's profile."""
    client = get_supabase_admin_client() or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Profile not found. Please complete profile setup.")

    return res.data[0]

@router.post("", response_model=ProfileResponse)
async def create_profile(
    payload: ProfileCreate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Creates the user's profile and automatically calculates initial daily calorie recommendations.
    Prevents duplicate profile creation.
    """
    client = get_supabase_admin_client() or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    # Check if profile already exists
    existing = client.table("profiles").select("id").eq("id", user["id"]).execute()
    if existing.data and len(existing.data) > 0:
        raise HTTPException(status_code=409, detail="Profile already exists for this account.")

    # Calculate initial calories
    calc_input = CalorieCalculationInput(
        age=payload.age,
        gender=payload.gender,
        height_cm=payload.height_cm,
        current_weight_kg=payload.current_weight_kg,
        activity_level=payload.activity_level,
        fitness_goal=payload.fitness_goal,
        target_weight_kg=payload.target_weight_kg
    )
    rec = calculate_calories(calc_input)

    profile_data = {
        "id": user["id"],
        "full_name": payload.full_name,
        "age": payload.age,
        "gender": payload.gender,
        "height_cm": payload.height_cm,
        "current_weight_kg": payload.current_weight_kg,
        "activity_level": payload.activity_level,
        "fitness_goal": payload.fitness_goal,
        "target_weight_kg": payload.target_weight_kg,
        "daily_calorie_target": rec.daily_calorie_target,
        "bmr": rec.bmr,
        "tdee": rec.tdee,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    insert_res = client.table("profiles").insert(profile_data).execute()
    if not insert_res.data:
        raise HTTPException(status_code=400, detail="Could not create profile.")

    return insert_res.data[0]

@router.put("", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Updates general profile info."""
    client = get_supabase_admin_client() or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    existing_res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not existing_res.data or len(existing_res.data) == 0:
        raise HTTPException(status_code=404, detail="Profile not found.")

    current = existing_res.data[0]
    update_dict = payload.model_dump(exclude_unset=True)

    # Recalculate calorie target if health metrics changed
    metric_keys = ["age", "gender", "height_cm", "current_weight_kg", "activity_level", "fitness_goal", "target_weight_kg"]
    if any(k in update_dict for k in metric_keys):
        calc_input = CalorieCalculationInput(
            age=update_dict.get("age", current["age"]),
            gender=update_dict.get("gender", current["gender"]),
            height_cm=update_dict.get("height_cm", current["height_cm"]),
            current_weight_kg=update_dict.get("current_weight_kg", current["current_weight_kg"]),
            activity_level=update_dict.get("activity_level", current["activity_level"]),
            fitness_goal=update_dict.get("fitness_goal", current["fitness_goal"]),
            target_weight_kg=update_dict.get("target_weight_kg", current.get("target_weight_kg"))
        )
        rec = calculate_calories(calc_input)
        update_dict["daily_calorie_target"] = rec.daily_calorie_target
        update_dict["bmr"] = rec.bmr
        update_dict["tdee"] = rec.tdee

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = client.table("profiles").update(update_dict).eq("id", user["id"]).execute()
    return res.data[0]
