"""Goal settings and target recalculation endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.goals import GoalUpdateRequest, GoalRecalculateResponse
from app.schemas.user import CalorieCalculationInput
from app.services.calorie_calculator import calculate_calories

router = APIRouter(prefix="/goals", tags=["Goals & Recalculation"])

@router.get("")
async def get_current_goals(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetches user's current goal parameters and calorie target."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Profile not found.")

    profile = res.data[0]
    # Calculate detailed explanation of current target
    calc_input = CalorieCalculationInput(
        age=profile["age"],
        gender=profile["gender"],
        height_cm=float(profile["height_cm"]),
        current_weight_kg=float(profile["current_weight_kg"]),
        activity_level=profile["activity_level"],
        fitness_goal=profile["fitness_goal"],
        target_weight_kg=float(profile["target_weight_kg"]) if profile.get("target_weight_kg") else None
    )
    details = calculate_calories(calc_input)

    return {
        "profile": profile,
        "calculation_details": details
    }

@router.put("/recalculate", response_model=GoalRecalculateResponse)
async def update_goals_and_recalculate(
    payload: GoalUpdateRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Updates user goals and metrics, recalculates new calorie targets,
    and returns a comparison between old and new targets.
    Crucially preserves all existing historical food logs.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = client.table("profiles").select("*").eq("id", user["id"]).execute()
    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Profile not found.")

    curr = res.data[0]
    previous_target = int(curr.get("daily_calorie_target", 2000))

    new_weight = payload.current_weight_kg if payload.current_weight_kg is not None else float(curr["current_weight_kg"])
    new_target_weight = payload.target_weight_kg if payload.target_weight_kg is not None else (
        float(curr["target_weight_kg"]) if curr.get("target_weight_kg") else None
    )
    new_activity = payload.activity_level or curr["activity_level"]
    new_goal = payload.fitness_goal or curr["fitness_goal"]
    new_age = payload.age if payload.age is not None else curr["age"]
    new_height = payload.height_cm if payload.height_cm is not None else float(curr["height_cm"])

    # Identify changes
    change_reasons: List[str] = []
    if payload.current_weight_kg is not None and payload.current_weight_kg != float(curr["current_weight_kg"]):
        change_reasons.append(f"Current weight adjusted from {curr['current_weight_kg']} kg to {new_weight} kg")
    if payload.activity_level and payload.activity_level != curr["activity_level"]:
        change_reasons.append(f"Activity level changed from {curr['activity_level'].replace('_', ' ')} to {new_activity.replace('_', ' ')}")
    if payload.fitness_goal and payload.fitness_goal != curr["fitness_goal"]:
        change_reasons.append(f"Primary goal changed from {curr['fitness_goal'].replace('_', ' ')} to {new_goal.replace('_', ' ')}")

    # Recalculate
    calc_input = CalorieCalculationInput(
        age=new_age,
        gender=curr["gender"],
        height_cm=new_height,
        current_weight_kg=new_weight,
        activity_level=new_activity,
        fitness_goal=new_goal,
        target_weight_kg=new_target_weight
    )
    new_calc = calculate_calories(calc_input)
    new_target = new_calc.daily_calorie_target
    diff = new_target - previous_target

    # Update profile in Supabase
    update_data = {
        "current_weight_kg": new_weight,
        "target_weight_kg": new_target_weight,
        "activity_level": new_activity,
        "fitness_goal": new_goal,
        "age": new_age,
        "height_cm": new_height,
        "daily_calorie_target": new_target,
        "bmr": new_calc.bmr,
        "tdee": new_calc.tdee,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    client.table("profiles").update(update_data).eq("id", user["id"]).execute()

    return GoalRecalculateResponse(
        previous_daily_calorie_target=previous_target,
        new_daily_calorie_target=new_target,
        difference=diff,
        calculation_details=new_calc,
        change_reasons=change_reasons if change_reasons else ["Target refreshed with current settings."]
    )
