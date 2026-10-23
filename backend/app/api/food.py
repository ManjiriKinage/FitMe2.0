"""Food estimation and logging API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client
from app.schemas.food import (
    AIEstimateRequest,
    AIEstimateResponse,
    FoodLogCreate,
    FoodLogResponse
)
from app.services.food_ai import estimate_food_calories

router = APIRouter(prefix="/food", tags=["Food & AI Estimation"])

@router.post("/estimate", response_model=AIEstimateResponse)
async def estimate_food(
    payload: AIEstimateRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Estimates calories and macronutrients for food descriptions using Gemini AI
    (with an intelligent fallback knowledge-base for Indian and international foods).
    """
    try:
        return await estimate_food_calories(payload.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not estimate food calories: {str(e)}. Please retry."
        )

@router.get("/logs", response_model=List[FoodLogResponse])
async def get_food_logs(
    date: Optional[str] = Query(None, description="ISO Date string YYYY-MM-DD"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetches food logs for the authenticated user, optionally filtered by local date."""
    client = get_supabase_admin_client() or get_supabase_anon_client()
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
    """
    client = get_supabase_admin_client() or get_supabase_anon_client()
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

    return res.data[0]

@router.delete("/logs/{log_id}")
async def delete_food_log(
    log_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Deletes a specific food log owned by the user."""
    client = get_supabase_admin_client() or get_supabase_anon_client()
    if not client:
        raise HTTPException(status_code=500, detail="Database client not configured.")

    res = client.table("food_logs").delete().eq("id", log_id).eq("user_id", user["id"]).execute()
    return {"message": "Food log deleted successfully", "id": log_id}
