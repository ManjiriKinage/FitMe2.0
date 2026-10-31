"""Food estimation and logging API endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import zoneinfo
import logging
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import (
    AIEstimateRequest,
    AIEstimateResponse,
    ParsedFoodItem,
    FoodLogCreate,
    FoodLogUpdate,
    FoodLogResponse,
    RecipeSearchResult,
    RecipeDetailResponse,
    FoodFeedbackRequest,
    BatchFoodLogRequest,
    BatchFoodLogResponse,
    UserPreferenceResponse,
    UserPreferenceUpdate
)
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_service import fetch_and_calculate_daily_dashboard
from app.services.user_learning import UserPreferenceLearningEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/food", tags=["Food & AI Estimation"])

def _is_valid_uuid(val: Any) -> bool:
    """Verifies string is a valid UUID to prevent PostgreSQL type errors."""
    if not val or not isinstance(val, str):
        return False
    try:
        uuid.UUID(val)
        return True
    except (ValueError, AttributeError, TypeError):
        return False

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
            validation_status=getattr(it, "validation_status", "verified"),
            clarification_question=it.clarification_question,
            uncertainty_note=it.uncertainty_flags[0] if it.uncertainty_flags else None,
            assumptions=f"Calculated from {it.nutrition_source} ({it.serving_weight_g}g)." if it.serving_weight_g else None,
            food_id=it.food_id,
            profile_id=it.profile_id
        )
        for it in meal_res.items
    ]

    has_needs_review = any(it.validation_status == "needs_review" for it in parsed_items)
    compound_uncertainty = next((it.uncertainty_note for it in parsed_items if it.uncertainty_note), None)

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
            needs_user_confirmation=True,
            validation_status=first.validation_status,
            food_id=first.food_id,
            profile_id=first.profile_id
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
            uncertainty_note=compound_uncertainty,
            clarification_question=meal_res.clarification_question,
            items=parsed_items,
            has_ambiguity=meal_res.has_ambiguity,
            needs_user_confirmation=True,
            validation_status="needs_review" if has_needs_review else "verified"
        )

@router.get("/search", response_model=List[RecipeSearchResult])
async def search_food_catalog(
    q: str = Query(..., min_length=1, description="Food name or recipe query"),
    limit: int = Query(10, ge=1, le=50)
):
    """Searches food catalog using nutrition engine."""
    matches = nutrition_engine.search_candidates(q, limit=limit)
    return [
        RecipeSearchResult(
            source_recipe_code=m.recipe_code,
            name=m.name,
            normalized_name=m.normalized_name,
            reported_serving_unit=m.serving_unit,
            reported_serving_size_g=m.serving_size_g,
            serving_energy_kcal=round((m.energy_kcal_per_100g * m.serving_size_g) / 100.0, 1),
            reported_energy_kcal_per_100g=m.energy_kcal_per_100g,
            reported_protein_g_per_100g=m.protein_g_per_100g or 0.0,
            reported_carbohydrates_g_per_100g=m.carbohydrates_g_per_100g or 0.0,
            reported_fat_g_per_100g=m.fat_g_per_100g or 0.0
        )
        for m in matches
    ]

@router.get("/recipes/{recipe_code}", response_model=RecipeDetailResponse)
async def get_recipe_detail(recipe_code: str):
    """Retrieves verified recipe and serving details for an INDB recipe."""
    code = recipe_code.strip()
    r = nutrition_engine._recipes.get(code)
    if not r:
        raise HTTPException(status_code=404, detail=f"Recipe '{code}' not found in official catalog.")

    return RecipeDetailResponse(
        source_recipe_code=r["source_recipe_code"],
        name=r["name"],
        normalized_name=r["normalized_name"],
        aliases=r.get("aliases", []),
        reported_serving_unit=r.get("reported_serving_unit", "serving"),
        reported_serving_size_g=r.get("reported_serving_size_g", 150.0),
        serving_energy_kcal=r.get("serving_energy_kcal"),
        serving_protein_g=r.get("serving_protein_g"),
        serving_carbohydrates_g=r.get("serving_carbohydrates_g"),
        serving_fat_g=r.get("serving_fat_g"),
        reported_energy_kcal_per_100g=r["reported_energy_kcal_per_100g"],
        reported_protein_g_per_100g=r.get("reported_protein_g_per_100g"),
        reported_carbohydrates_g_per_100g=r.get("reported_carbohydrates_g_per_100g"),
        reported_fat_g_per_100g=r.get("reported_fat_g_per_100g"),
        reported_fiber_g_per_100g=r.get("reported_fiber_g_per_100g")
    )

@router.get("/logs", response_model=List[FoodLogResponse])
async def get_food_logs(
    date: Optional[str] = Query(None, description="ISO Date string YYYY-MM-DD"),
    start_date: Optional[str] = Query(None, description="Range start YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Range end YYYY-MM-DD"),
    tz: Optional[str] = Query(None, description="User timezone (e.g. Asia/Kolkata, America/New_York)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetches food logs for the authenticated user with optional date filtering and pagination."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    query = client.table("food_logs").select("*").eq("user_id", user["id"])
    
    try:
        user_tz = zoneinfo.ZoneInfo(tz) if tz else timezone.utc
    except Exception:
        user_tz = timezone.utc

    if date:
        try:
            start_local = datetime.strptime(f"{date} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=user_tz)
            end_local = datetime.strptime(f"{date} 23:59:59.999999", "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=user_tz)
            start_ts = start_local.astimezone(timezone.utc).isoformat()
            end_ts = end_local.astimezone(timezone.utc).isoformat()
        except Exception:
            start_ts = f"{date}T00:00:00Z"
            end_ts = f"{date}T23:59:59Z"
        query = query.gte("logged_at", start_ts).lte("logged_at", end_ts)
    elif start_date and end_date:
        try:
            start_local = datetime.strptime(f"{start_date} 00:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=user_tz)
            end_local = datetime.strptime(f"{end_date} 23:59:59.999999", "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=user_tz)
            start_ts = start_local.astimezone(timezone.utc).isoformat()
            end_ts = end_local.astimezone(timezone.utc).isoformat()
        except Exception:
            start_ts = f"{start_date}T00:00:00Z"
            end_ts = f"{end_date}T23:59:59Z"
        query = query.gte("logged_at", start_ts).lte("logged_at", end_ts)

    offset = (page - 1) * page_size
    res = query.order("logged_at", desc=True).range(offset, offset + page_size - 1).execute()
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
    if payload.food_id:
        record["food_id"] = payload.food_id
    if payload.profile_id:
        record["profile_id"] = payload.profile_id

    try:
        res = client.table("food_logs").insert(record).execute()
    except Exception as e:
        logger.warning(f"Insert failed with IDs, retrying without food_id/profile_id: {e}")
        record.pop("food_id", None)
        record.pop("profile_id", None)
        res = client.table("food_logs").insert(record).execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to save food log entry.")

    saved_row = res.data[0]

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

@router.put("/logs/{log_id}", response_model=FoodLogResponse)
async def update_food_log(
    log_id: str,
    payload: FoodLogUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Edits an existing food log entry.
    Replaces its contribution cleanly without duplicating items in dashboard totals.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    # Check ownership
    existing = client.table("food_logs").select("*").eq("id", log_id).eq("user_id", user["id"]).execute()
    if not existing.data or len(existing.data) == 0:
        raise HTTPException(status_code=404, detail="Food log not found or access denied.")

    update_data: Dict[str, Any] = {}
    if payload.food_name is not None: update_data["food_name"] = payload.food_name
    if payload.quantity is not None: update_data["quantity"] = payload.quantity
    if payload.unit is not None: update_data["unit"] = payload.unit
    if payload.estimated_calories is not None: update_data["estimated_calories"] = payload.estimated_calories
    if payload.protein_g is not None: update_data["protein_g"] = payload.protein_g
    if payload.carbohydrates_g is not None: update_data["carbohydrates_g"] = payload.carbohydrates_g
    if payload.fat_g is not None: update_data["fat_g"] = payload.fat_g
    if payload.meal_type is not None: update_data["meal_type"] = payload.meal_type
    if payload.logged_at is not None: update_data["logged_at"] = payload.logged_at.isoformat()

    res = client.table("food_logs").update(update_data).eq("id", log_id).eq("user_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to update food log.")

    updated_row = res.data[0]

    # Update preference learning with updated portion
    try:
        UserPreferenceLearningEngine.record_confirmed_log(
            client=client,
            user_id=user["id"],
            food_name=updated_row["food_name"],
            quantity=updated_row["quantity"],
            serving_unit=updated_row["unit"]
        )
    except Exception:
        pass

    return updated_row

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

# ==============================================================================
# USER FOOD PREFERENCE LEARNING ENDPOINTS (PHASE 7)
# ==============================================================================

@router.get("/preferences", response_model=List[UserPreferenceResponse])
async def list_user_preferences(user: Dict[str, Any] = Depends(get_current_user)):
    """Lists learned food preferences for the authenticated user."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")
    return UserPreferenceLearningEngine.list_user_preferences(client, user["id"])

@router.put("/preferences/{pref_id}", response_model=UserPreferenceResponse)
async def update_user_preference(
    pref_id: str,
    payload: UserPreferenceUpdate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Updates a user's learned portion preference explicitly."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = UserPreferenceLearningEngine.update_user_preference(
        client=client,
        user_id=user["id"],
        pref_id=pref_id,
        quantity=payload.preferred_serving_quantity,
        serving_unit=payload.preferred_serving_unit,
        serving_weight_g=payload.preferred_serving_weight_g
    )
    if not res:
        raise HTTPException(status_code=404, detail="Preference not found or access denied.")
    return res

@router.delete("/preferences/{pref_id}")
async def delete_user_preference(
    pref_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Deletes a single learned preference for the authenticated user."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    ok = UserPreferenceLearningEngine.delete_user_preference(client, user["id"], pref_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Preference not found or could not be deleted.")
    return {"message": "Preference deleted successfully", "id": pref_id}

@router.delete("/preferences")
async def clear_all_user_preferences(user: Dict[str, Any] = Depends(get_current_user)):
    """Clears all learned preferences for the authenticated user."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    UserPreferenceLearningEngine.clear_user_preferences(client, user["id"])
    return {"message": "All preferences cleared successfully"}

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
        try:
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
        except Exception as dup_err:
            logger.debug(f"Duplicate check skipped: {dup_err}")

        row_data = {
            "user_id": user["id"],
            "food_name": item.food_name,
            "quantity": item.quantity,
            "unit": item.unit,
            "estimated_calories": item.estimated_calories,
            "protein_g": item.protein_g,
            "carbohydrates_g": item.carbohydrates_g,
            "fat_g": item.fat_g,
            "meal_type": item.meal_type or payload.meal_type or "lunch",
            "logged_at": log_time,
            "created_at": now_iso
        }
        if item.food_id and _is_valid_uuid(item.food_id):
            row_data["food_id"] = item.food_id
        if item.profile_id and _is_valid_uuid(item.profile_id):
            row_data["profile_id"] = item.profile_id
        if item.food_image_id and _is_valid_uuid(item.food_image_id):
            row_data["food_image_id"] = item.food_image_id

        res = None
        try:
            res = client.table("food_logs").insert(row_data).execute()
        except Exception as e:
            logger.warning(f"Batch item insert failed with IDs, retrying without food_id/profile_id: {e}")
            row_data.pop("food_id", None)
            row_data.pop("profile_id", None)
            try:
                res = client.table("food_logs").insert(row_data).execute()
            except Exception as e2:
                row_data.pop("food_image_id", None)
                try:
                    res = client.table("food_logs").insert(row_data).execute()
                except Exception as e3:
                    logger.error(f"Failed to insert item {item.food_name}: {e3}")
                    continue

        if res and res.data:
            saved_row = res.data[0]
            try:
                saved_logs.append(FoodLogResponse.model_validate(saved_row))
            except Exception as val_err:
                logger.warning(f"FoodLogResponse validation fallback for {saved_row.get('food_name')}: {val_err}")
                saved_logs.append(FoodLogResponse(
                    id=str(saved_row.get("id")),
                    user_id=str(saved_row.get("user_id")),
                    food_name=str(saved_row.get("food_name")),
                    quantity=float(saved_row.get("quantity") or 1.0),
                    unit=str(saved_row.get("unit") or "serving"),
                    estimated_calories=float(saved_row.get("estimated_calories") or 0.0),
                    protein_g=float(saved_row.get("protein_g") or 0.0),
                    carbohydrates_g=float(saved_row.get("carbohydrates_g") or 0.0),
                    fat_g=float(saved_row.get("fat_g") or 0.0),
                    meal_type=saved_row.get("meal_type") or payload.meal_type or "lunch",
                    logged_at=saved_row.get("logged_at") or now_iso,
                    created_at=saved_row.get("created_at") or now_iso,
                    food_id=str(saved_row.get("food_id")) if saved_row.get("food_id") else None,
                    profile_id=str(saved_row.get("profile_id")) if saved_row.get("profile_id") else None,
                    food_image_id=str(saved_row.get("food_image_id")) if saved_row.get("food_image_id") else None,
                ))
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

    if not saved_logs and payload.items:
        logger.error(f"Failed to insert any food items for user {user['id']}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to save food log entries. Please check the food details and try again."
        )

    # Compute updated daily dashboard totals
    daily_summary = fetch_and_calculate_daily_dashboard(
        client=client,
        user_id=user["id"],
        target_date=log_time[:10] if len(log_time) >= 10 else None
    )

    return BatchFoodLogResponse(
        success=True,
        saved_count=len(saved_logs),
        total_calories=round(tot_cals, 1),
        message=f"Successfully confirmed and logged {len(saved_logs)} food items.",
        saved_logs=saved_logs,
        daily_summary=daily_summary
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
