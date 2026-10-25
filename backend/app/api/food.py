"""Food estimation and logging API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import (
    AIEstimateRequest,
    AIEstimateResponse,
    ParsedFoodItem,
    FoodLogCreate,
    FoodLogResponse,
    RecipeSearchResult,
    FoodFeedbackRequest,
    BatchFoodLogRequest,
    BatchFoodLogResponse
)
from app.services.nutrition_engine import nutrition_engine
from app.services.user_learning import UserPreferenceLearningEngine

router = APIRouter(prefix="/food", tags=["Food & AI Estimation"])

@router.post("/estimate", response_model=AIEstimateResponse)
async def estimate_food(
    payload: AIEstimateRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Estimates calories and macronutrients for food descriptions.
    Supports single items ('2 medium chapatis') or compound meals ('2 chapatis and 1 bowl of dal').
    Processing Order:
    1. Text normalization and compound multi-item sentence splitting.
    2. Local INDB catalog search (exact, alias, token overlap).
    3. Customary user-portion auto adjustment (from learning engine).
    4. Deterministic per-100g and dish-specific serving calculation.
    5. Disambiguation check & concise clarification question if multiple divergent candidates exist.
    6. Bounded AI / clinical baseline fallback for uncataloged items.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()

    try:
        meal_res = await nutrition_engine.parse_and_calculate_meal(
            payload.query,
            user_id=user["id"],
            client=client
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not calculate nutrition: {str(e)}"
        )

    # Convert items to ParsedFoodItem schema
    parsed_items = [
        ParsedFoodItem(
            food_name=it.selected_food_name,
            quantity=it.quantity,
            unit=it.serving_unit,
            estimated_calories=it.total_calories,
            protein_g=it.protein_g or 0.0,
            carbohydrates_g=it.carbohydrates_g or 0.0,
            fat_g=it.fat_g or 0.0,
            fiber_g=it.fiber_g,
            serving_weight_g=it.serving_weight_g,
            nutrition_source=it.nutrition_source,
            calculation_method=it.calculation_method,
            clarification_question=it.clarification_question,
            uncertainty_note=it.uncertainty_flags[0] if it.uncertainty_flags else None,
            assumptions=f"Calculated from {it.nutrition_source} ({it.serving_weight_g}g)." if it.serving_weight_g else None
        )
        for it in meal_res.items
    ]

    if len(parsed_items) == 1:
        first = parsed_items[0]
        return AIEstimateResponse(
            food_name=first.food_name,
            quantity=first.quantity,
            unit=first.unit,
            estimated_calories=first.estimated_calories,
            protein_g=first.protein_g,
            carbohydrates_g=first.carbohydrates_g,
            fat_g=first.fat_g,
            assumptions=first.assumptions or f"Calculated deterministically ({first.quantity} {first.unit}).",
            uncertainty_note=first.uncertainty_note,
            clarification_question=meal_res.clarification_question,
            items=parsed_items,
            has_ambiguity=meal_res.has_ambiguity,
            needs_user_confirmation=True
        )
    else:
        # Compound meal presentation
        summary_title = " & ".join([it.food_name for it in parsed_items[:3]])
        if len(parsed_items) > 3:
            summary_title += f" + {len(parsed_items) - 3} more"

        return AIEstimateResponse(
            food_name=summary_title,
            quantity=1.0,
            unit="meal",
            estimated_calories=meal_res.total_calories,
            protein_g=meal_res.total_protein_g,
            carbohydrates_g=meal_res.total_carbohydrates_g,
            fat_g=meal_res.total_fat_g,
            assumptions=f"Combined meal breakdown for {len(parsed_items)} items.",
            uncertainty_note=None,
            clarification_question=meal_res.clarification_question,
            items=parsed_items,
            has_ambiguity=meal_res.has_ambiguity,
            needs_user_confirmation=True
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

@router.post("/confirm", response_model=BatchFoodLogResponse)
async def confirm_and_save_meal(
    payload: BatchFoodLogRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Confirms and saves multi-item food estimates into food_logs.
    - Validates nutrition and positive quantities.
    - Saves verified nutrition snapshot.
    - Prevents accidental double submissions via idempotency check.
    - Updates user portion learning.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="No food items provided to confirm.")

    saved_logs = []
    tot_cals = 0.0
    now_iso = datetime.now(timezone.utc).isoformat()
    log_time = payload.logged_at.isoformat() if payload.logged_at else now_iso

    for item in payload.items:
        recent_cutoff = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 5.0, timezone.utc).isoformat()
        recent = (
            client.table("food_logs")
            .select("id")
            .eq("user_id", user["id"])
            .eq("food_name", item.food_name)
            .gte("created_at", recent_cutoff)
            .execute()
        )
        if recent.data and len(recent.data) > 0:
            logger.info(f"Ignored duplicate submission for {item.food_name}")
            continue

        row_data = {
            "user_id": user["id"],
            "food_name": item.food_name,
            "quantity": item.quantity,
            "unit": item.unit,
            "estimated_calories": item.estimated_calories,
            "protein_g": item.protein_g,
            "carbohydrates_g": item.carbohydrates_g,
            "fat_g": item.fat_g,
            "meal_type": payload.meal_type,
            "logged_at": log_time,
            "created_at": now_iso
        }
        res = client.table("food_logs").insert(row_data).execute()
        if res.data:
            saved_row = res.data[0]
            saved_logs.append(FoodLogResponse.model_validate(saved_row))
            tot_cals += item.estimated_calories

            # Record learning preference
            try:
                UserPreferenceLearningEngine.record_confirmed_log(
                    client=client,
                    user_id=user["id"],
                    food_name=item.food_name,
                    quantity=item.quantity,
                    serving_unit=item.unit
                )
            except Exception:
                pass

    return BatchFoodLogResponse(
        success=True,
        saved_count=len(saved_logs),
        total_calories=round(tot_cals, 1),
        message=f"Successfully confirmed and logged {len(saved_logs)} food items.",
        saved_logs=saved_logs
    )

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
