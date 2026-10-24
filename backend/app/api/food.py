"""Food estimation and logging API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import (
    AIEstimateRequest,
    AIEstimateResponse,
    FoodLogCreate,
    FoodLogResponse,
    RecipeSearchResult,
    FoodFeedbackRequest
)
from app.services.indb_engine import indb_engine
from app.services.user_learning import UserPreferenceLearningEngine
from app.services.food_ai import estimate_food_calories

router = APIRouter(prefix="/food", tags=["Food & AI Estimation"])

@router.post("/estimate", response_model=AIEstimateResponse)
async def estimate_food(
    payload: AIEstimateRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Estimates calories and macronutrients for food descriptions.
    Priority Order (Database-First Matching):
    1. Direct match in official Indian Nutrient Databank (INDB) catalog (deterministic arithmetic).
    2. Incorporates personalized user portion preferences if confirmed in past meals.
    3. Graceful AI fallback (Gemini / heuristic Indian database) for novel uncataloged foods.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()

    # 1. Attempt deterministic INDB catalog resolution first
    indb_match = indb_engine.parse_natural_food_input(payload.query)
    if indb_match:
        # Check user personalized history
        user_pref = None
        if client:
            user_pref = UserPreferenceLearningEngine.get_user_preference(
                client=client,
                user_id=user["id"],
                food_name=indb_match["food_name"]
            )

        qty = indb_match["quantity"]
        unit = indb_match["unit"]
        assumption = f"Calculated deterministically from Indian Nutrient Databank (INDB) official recipe {indb_match['recipe_code']}."

        # If user has a learned personal preference and query was general (default 1.0)
        if user_pref and qty == 1.0 and unit == "serving":
            preferred_qty = float(user_pref.get("preferred_serving_quantity", 1.0))
            preferred_unit = str(user_pref.get("preferred_serving_unit", "serving"))
            # Recalculate using user's usual portion
            recalc = indb_engine.calculate_from_servings(indb_match["recipe_code"], preferred_qty, serving_unit=preferred_unit)
            qty = preferred_qty
            unit = preferred_unit
            indb_match["estimated_calories"] = recalc["calories"]
            indb_match["protein_g"] = recalc["protein_g"]
            indb_match["carbohydrates_g"] = recalc["carbohydrates_g"]
            indb_match["fat_g"] = recalc["fat_g"]
            assumption += f" Auto-adjusted to your customary serving ({qty} {unit}) based on past confirmations."

        return AIEstimateResponse(
            food_name=indb_match["food_name"],
            quantity=qty,
            unit=unit,
            estimated_calories=indb_match["estimated_calories"],
            protein_g=indb_match["protein_g"],
            carbohydrates_g=indb_match["carbohydrates_g"],
            fat_g=indb_match["fat_g"],
            assumptions=assumption,
            uncertainty_note=None,
            clarification_question=None
        )

    # 2. Fallback to AI / Heuristic model
    try:
        return await estimate_food_calories(payload.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not estimate food calories: {str(e)}. Please retry."
        )

@router.get("/search", response_model=List[RecipeSearchResult])
async def search_food_catalog(
    q: str = Query(..., min_length=1, description="Food name or recipe query"),
    limit: int = Query(10, ge=1, le=50)
):
    """Searches official Indian Nutrient Databank (INDB) recipes."""
    matches = indb_engine.search_recipes(q, limit=limit)
    return [
        RecipeSearchResult(
            source_recipe_code=m["source_recipe_code"],
            name=m["name"],
            normalized_name=m["normalized_name"],
            reported_serving_unit=m.get("reported_serving_unit", "serving"),
            reported_serving_size_g=m.get("reported_serving_size_g", 150.0),
            serving_energy_kcal=m.get("serving_energy_kcal"),
            reported_energy_kcal_per_100g=m["reported_energy_kcal_per_100g"],
            reported_protein_g_per_100g=m["reported_protein_g_per_100g"],
            reported_carbohydrates_g_per_100g=m["reported_carbohydrates_g_per_100g"],
            reported_fat_g_per_100g=m["reported_fat_g_per_100g"]
        )
        for m in matches
    ]

@router.get("/logs", response_model=List[FoodLogResponse])
async def get_food_logs(
    date: Optional[str] = Query(None, description="ISO Date string YYYY-MM-DD"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetches food logs for the authenticated user, optionally filtered by local date."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    query = client.table("food_logs").select("*").eq("user_id", user["id"])
    
    if date:
        # Filter range for full day [date 00:00:00 to date 23:59:59]
        start_ts = f"{date}T00:00:00Z"
        end_ts = f"{date}T23:59:59Z"
        query = query.gte("logged_at", start_ts).lte("logged_at", end_ts)

    res = query.order("logged_at", desc=False).execute()
    return res.data or []

@router.post("/logs", response_model=FoodLogResponse)
async def create_food_log(
    payload: FoodLogCreate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Saves a food entry into the food_logs table.
    Ensures user ID is securely verified from authentication token.
    Transparently updates user preference learning for future predictions.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    log_time = payload.logged_at.isoformat() if payload.logged_at else datetime.now(timezone.utc).isoformat()

    record = {
        "user_id": user["id"],
        "food_name": payload.food_name,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "estimated_calories": payload.estimated_calories,
        "protein_g": payload.protein_g,
        "carbohydrates_g": payload.carbohydrates_g,
        "fat_g": payload.fat_g,
        "meal_type": payload.meal_type,
        "logged_at": log_time,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    res = client.table("food_logs").insert(record).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to save food log entry.")

    saved_row = res.data[0]

    # Asynchronously / idempotently record user portion preference
    try:
        UserPreferenceLearningEngine.record_confirmed_log(
            client=client,
            user_id=user["id"],
            food_name=payload.food_name,
            quantity=payload.quantity,
            serving_unit=payload.unit
        )
    except Exception:
        pass

    return saved_row

@router.delete("/logs/{log_id}")
async def delete_food_log(
    log_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Deletes a specific food log owned by the user."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = client.table("food_logs").delete().eq("id", log_id).eq("user_id", user["id"]).execute()
    return {"message": "Food log deleted successfully", "id": log_id}

@router.post("/feedback")
async def submit_food_feedback(
    payload: FoodFeedbackRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Records a user correction or portion feedback.
    Feedback is stored separately from reference nutrition data and used to improve personalization.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = UserPreferenceLearningEngine.record_feedback_correction(
        client=client,
        user_id=user["id"],
        food_log_id=payload.food_log_id,
        original_estimate={"food_name": payload.food_name, "calories": payload.original_calories},
        corrected_value={
            "calories": payload.corrected_calories,
            "quantity": payload.corrected_quantity,
            "unit": payload.corrected_unit
        },
        reason=payload.reason
    )
    return {"status": "recorded", "feedback": res}
