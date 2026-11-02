"""Food estimation and logging API endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
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
    SingleFoodLogResponse,
    UserPreferenceResponse,
    UserPreferenceUpdate
)
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_service import fetch_and_calculate_daily_dashboard
from app.services.user_learning import UserPreferenceLearningEngine
from app.services.food_ai import estimate_food_calories
import time

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/food", tags=["Food & AI Estimation"])

# In-memory search query cache with TTL (1 hour) and bounded capacity
_SEARCH_QUERY_CACHE: Dict[str, Dict[str, Any]] = {}
_MAX_SEARCH_CACHE_ENTRIES = 500
_SEARCH_CACHE_TTL_SECONDS = 3600.0

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
    Token-Saving Smart Food Estimator:
    1. Checks user's own favorite_foods and past food_logs in Supabase first.
       - If found: returns exact previously logged nutrition instantly (0 AI tokens consumed).
       - Automatically scales calories & macros if a different quantity is requested (e.g. 2 vs 1).
    2. If not found in user's history:
       - Calls Google Gemini AI to analyze the food and estimate macros.
    3. When the user confirms and logs the food, it enters food_logs so future searches
       for this food are served from the database with zero token spend.
    """
    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Food description query cannot be empty."
        )

    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    user_id = user["id"]

    # Step A: Parse quantity, unit, and food term from query
    try:
        from app.services.nutrition_engine.matcher import parse_item_portion
        requested_qty, requested_unit, food_term = parse_item_portion(query)
    except Exception:
        requested_qty, requested_unit, food_term = 1.0, "serving", query

    import re
    clean_term = food_term.strip() if food_term else query
    core_term = re.sub(r"^(small|medium|big|large)\s+", "", clean_term, flags=re.IGNORECASE).strip()
    search_terms = [t for t in dict.fromkeys([clean_term, core_term, query]) if len(t) >= 2]

    # Step B: Search in user's favorite_foods (highest priority cache)
    cached_match = None
    source_type = None

    if client and search_terms:
        for term in search_terms:
            try:
                fav_res = (
                    client.table("favorite_foods")
                    .select("*")
                    .eq("user_id", user_id)
                    .ilike("name", f"%{term}%")
                    .limit(1)
                    .execute()
                )
                if fav_res.data and len(fav_res.data) > 0:
                    fav = fav_res.data[0]
                    cached_match = {
                        "food_name": fav["name"],
                        "quantity": float(fav.get("quantity") or 1.0),
                        "unit": fav.get("unit") or requested_unit or "serving",
                        "calories": float(fav.get("calories") or 0.0),
                        "protein": float(fav.get("protein") or 0.0),
                        "carbs": float(fav.get("carbs") or 0.0),
                        "fat": float(fav.get("fat") or 0.0),
                    }
                    source_type = "favorites"
                    break
            except Exception as e:
                logger.debug(f"Favorites lookup skipped: {e}")

    # Step C: Search in user's past food_logs (to save AI tokens)
    if not cached_match and client and search_terms:
        # 1. Direct ILIKE match across search terms
        for term in search_terms:
            try:
                log_res = (
                    client.table("food_logs")
                    .select("*")
                    .eq("user_id", user_id)
                    .ilike("food_name", f"%{term}%")
                    .order("logged_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if log_res.data and len(log_res.data) > 0:
                    item = log_res.data[0]
                    cached_match = {
                        "food_name": item["food_name"],
                        "quantity": float(item.get("quantity") or 1.0),
                        "unit": item.get("unit") or requested_unit or "serving",
                        "calories": float(item.get("estimated_calories") or 0.0),
                        "protein": float(item.get("protein_g") or 0.0),
                        "carbs": float(item.get("carbohydrates_g") or 0.0),
                        "fat": float(item.get("fat_g") or 0.0),
                    }
                    source_type = "past_logs"
                    break
            except Exception as e:
                logger.debug(f"Past food logs lookup skipped: {e}")

        # 2. In-memory check on recent 50 logs (covers reverse substring: e.g. logged "chapati", query "1 medium chapati")
        if not cached_match:
            try:
                recent_logs = (
                    client.table("food_logs")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("logged_at", desc=True)
                    .limit(50)
                    .execute()
                )
                if recent_logs.data:
                    q_lower = query.lower()
                    for item in recent_logs.data:
                        logged_name = (item.get("food_name") or "").strip().lower()
                        if not logged_name:
                            continue
                        if logged_name in q_lower or any(t.lower() in logged_name for t in search_terms):
                            cached_match = {
                                "food_name": item["food_name"],
                                "quantity": float(item.get("quantity") or 1.0),
                                "unit": item.get("unit") or requested_unit or "serving",
                                "calories": float(item.get("estimated_calories") or 0.0),
                                "protein": float(item.get("protein_g") or 0.0),
                                "carbs": float(item.get("carbohydrates_g") or 0.0),
                                "fat": float(item.get("fat_g") or 0.0),
                            }
                            source_type = "past_logs"
                            break
            except Exception as e:
                logger.debug(f"Recent food logs in-memory scan skipped: {e}")

    # Step D: If found in history, return immediately with proportional scaling (0 AI TOKENS)
    if cached_match and cached_match["calories"] > 0:
        base_qty = cached_match["quantity"] if cached_match["quantity"] > 0 else 1.0
        ratio = requested_qty / base_qty if requested_qty > 0 else 1.0

        scaled_calories = round(cached_match["calories"] * ratio, 1)
        scaled_protein = round(cached_match["protein"] * ratio, 1)
        scaled_carbs = round(cached_match["carbs"] * ratio, 1)
        scaled_fat = round(cached_match["fat"] * ratio, 1)

        source_label = "your favorite foods" if source_type == "favorites" else "your past food logs"
        logger.info(f"0-Token Cache Hit from {source_label} for: '{query}' -> '{cached_match['food_name']}'")

        return AIEstimateResponse(
            food_name=cached_match["food_name"],
            quantity=requested_qty,
            unit=cached_match["unit"],
            estimated_calories=scaled_calories,
            protein_g=scaled_protein,
            carbohydrates_g=scaled_carbs,
            fat_g=scaled_fat,
            assumptions=f"Reused from {source_label} (scaled x{round(ratio, 2)} for {requested_qty} {cached_match['unit']}). Zero AI tokens consumed.",
            uncertainty_note=None,
            clarification_question=None,
            validation_status="history_cached"
        )

    # Step E: If NOT found in history, call Google Gemini AI
    try:
        logger.info(f"Item not in user history. Calling Google Gemini AI for: '{query}'")
        ai_res = await estimate_food_calories(query)
        ai_res.validation_status = "ai_estimate"
        return ai_res
    except Exception as e:
        logger.error(f"Error calculating AI food estimate: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not calculate AI food estimation: {str(e)}"
        )

@router.get("/search", response_model=List[RecipeSearchResult])
async def search_food_catalog(
    q: str = Query(..., min_length=1, description="Food name or recipe query"),
    limit: int = Query(10, ge=1, le=50)
):
    """
    Searches food catalog using nutrition engine with high-performance in-memory caching.
    Serves identical queries in sub-millisecond time.
    """
    norm_key = f"{q.strip().lower()}:{limit}"
    now = time.time()

    if norm_key in _SEARCH_QUERY_CACHE:
        entry = _SEARCH_QUERY_CACHE[norm_key]
        if now - entry["timestamp"] < _SEARCH_CACHE_TTL_SECONDS:
            return entry["data"]

    matches = nutrition_engine.search_candidates(q, limit=limit)
    results = [
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

    # Enforce bounded capacity eviction
    if len(_SEARCH_QUERY_CACHE) >= _MAX_SEARCH_CACHE_ENTRIES:
        oldest_key = next(iter(_SEARCH_QUERY_CACHE))
        _SEARCH_QUERY_CACHE.pop(oldest_key, None)

    _SEARCH_QUERY_CACHE[norm_key] = {
        "timestamp": now,
        "data": results
    }

    return results

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

@router.post("/logs", response_model=SingleFoodLogResponse)
async def create_food_log(
    payload: FoodLogCreate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Saves a food entry into the food_logs table.
    - Prevents rapid double-click duplicate submissions within 5 seconds.
    - Preserves legitimate repeated food entries outside rapid accidental clicks.
    - Reconciles user preference learning.
    - Returns saved log and updated daily_summary so client updates in-place with zero reload.
    """
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    now_utc = datetime.now(timezone.utc)
    if payload.logged_at and payload.logged_at.timestamp() > (now_utc.timestamp() + 120):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot log food entries for future dates. Only today and past dates are allowed."
        )

    log_time = payload.logged_at.isoformat() if payload.logged_at else now_utc.isoformat()
    food_name_clean = payload.food_name.strip()

    # Rapid double-submission duplicate check (5-second window)
    recent_cutoff = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 5.0, timezone.utc).isoformat()
    try:
        recent = (
            client.table("food_logs")
            .select("id, user_id, food_name, quantity, unit, estimated_calories, protein_g, carbohydrates_g, fat_g, meal_type, logged_at, created_at, food_id, profile_id, food_image_id")
            .eq("user_id", user["id"])
            .eq("food_name", food_name_clean)
            .gte("created_at", recent_cutoff)
            .execute()
        )
        if recent.data and len(recent.data) > 0:
            logger.info(f"Rapid duplicate submission prevented for {food_name_clean}. Returning existing log.")
            saved_row = recent.data[0]
            log_obj = FoodLogResponse.model_validate(saved_row)
            daily_summary = fetch_and_calculate_daily_dashboard(
                client=client,
                user_id=user["id"],
                target_date=log_time[:10] if len(log_time) >= 10 else None
            )
            return SingleFoodLogResponse(
                success=True,
                saved_log=log_obj,
                food_log=log_obj,
                daily_summary=daily_summary,
                message=f"Duplicate submission prevented: {food_name_clean} was already logged."
            )
    except Exception as dup_err:
        logger.debug(f"Single food duplicate check notice: {dup_err}")

    record = {
        "user_id": user["id"],
        "food_name": food_name_clean,
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
    log_obj = FoodLogResponse.model_validate(saved_row)

    try:
        UserPreferenceLearningEngine.record_confirmed_log(
            client=client,
            user_id=user["id"],
            food_name=food_name_clean,
            quantity=payload.quantity,
            serving_unit=payload.unit
        )
    except Exception:
        pass

    daily_summary = fetch_and_calculate_daily_dashboard(
        client=client,
        user_id=user["id"],
        target_date=log_time[:10] if len(log_time) >= 10 else None
    )

    return SingleFoodLogResponse(
        success=True,
        saved_log=log_obj,
        food_log=log_obj,
        daily_summary=daily_summary,
        message="Food log saved successfully"
    )

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
    if payload.logged_at is not None:
        if payload.logged_at.timestamp() > (datetime.now(timezone.utc).timestamp() + 120):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update food entry to a future date. Only today and past dates are allowed."
            )
        update_data["logged_at"] = payload.logged_at.isoformat()

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
    now_utc = datetime.now(timezone.utc)
    if payload.logged_at and payload.logged_at.timestamp() > (now_utc.timestamp() + 120):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot log food entries for future dates. Only today and past dates are allowed."
        )

    now_iso = now_utc.isoformat()
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


class FavoriteFoodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    quantity: float = Field(1.0, ge=0.1)
    unit: str = Field("serving", min_length=1)
    calories: float = Field(..., ge=0)
    protein: float = Field(0.0, ge=0)
    carbs: float = Field(0.0, ge=0)
    fat: float = Field(0.0, ge=0)


@router.get("/favorites")
async def get_favorites(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetches user's favorite foods (up to 10)."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        return []

    try:
        res = (
            client.table("favorite_foods")
            .select("*")
            .eq("user_id", user["id"])
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        return res.data or []
    except Exception as e:
        print("get_favorites note (migration may be pending):", e)
        return []


@router.post("/favorites")
async def add_favorite(
    payload: FavoriteFoodCreate,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Saves a food item to user's favorites."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    fav_data = {
        "user_id": user["id"],
        "name": payload.name.strip(),
        "quantity": payload.quantity,
        "unit": payload.unit.strip(),
        "calories": round(payload.calories),
        "protein": round(payload.protein, 1),
        "carbs": round(payload.carbs, 1),
        "fat": round(payload.fat, 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    try:
        res = client.table("favorite_foods").insert(fav_data).execute()
        return res.data[0] if (res.data and len(res.data) > 0) else fav_data
    except Exception as e:
        print("add_favorite note:", e)
        fav_data["id"] = f"fav-{int(datetime.now(timezone.utc).timestamp())}"
        return fav_data


@router.delete("/favorites/{fav_id}")
async def delete_favorite(
    fav_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Deletes a favorite food item."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    try:
        client.table("favorite_foods").delete().eq("id", fav_id).eq("user_id", user["id"]).execute()
        return {"status": "deleted", "id": fav_id}
    except Exception as e:
        print("delete_favorite note:", e)
        return {"status": "deleted", "id": fav_id}


@router.get("/recents")
async def get_recent_foods(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetches distinct recent food items logged by the user over the last 7 days."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    if not client:
        return []

    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    try:
        res = (
            client.table("food_logs")
            .select("food_name, quantity, serving_unit, calories, protein_g, carbs_g, fat_g, logged_at")
            .eq("user_id", user["id"])
            .gte("logged_at", seven_days_ago)
            .order("logged_at", desc=True)
            .limit(30)
            .execute()
        )

        seen = set()
        recents = []
        for item in (res.data or []):
            name = (item.get("food_name") or "").strip()
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            recents.append({
                "name": name,
                "quantity": float(item.get("quantity") or 1.0),
                "unit": item.get("serving_unit") or "serving",
                "calories": round(float(item.get("calories") or 0)),
                "protein": round(float(item.get("protein_g") or 0), 1),
                "carbs": round(float(item.get("carbs_g") or 0), 1),
                "fat": round(float(item.get("fat_g") or 0), 1),
            })
            if len(recents) >= 6:
                break

        return recents
    except Exception as e:
        print("get_recent_foods note:", e)
        return []

