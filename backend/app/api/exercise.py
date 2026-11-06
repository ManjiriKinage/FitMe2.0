"""Exercise API Router - Preferences, Catalog, and Workout Logs."""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db.supabase import get_current_user, get_supabase_admin_client, get_supabase_anon_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exercise", tags=["Exercise"])

class ExercisePrefsPayload(BaseModel):
    place: Optional[str] = Field("home", description="outdoors, home, or gym")
    level: Optional[str] = Field("beginner", description="beginner, regular, or advanced")
    avoid_tags: Optional[List[str]] = Field(default_factory=list)
    minutes_per_day: Optional[int] = Field(30, ge=10, le=180)
    addback_mode: Optional[str] = Field("all", description="off, half, or all")
    daily_cap: Optional[int] = Field(500, ge=0, le=2000)

class ExerciseLogPayload(BaseModel):
    name: str
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    status: Optional[str] = "completed"
    planned_seconds: Optional[int] = 0
    completed_seconds: int = 0
    met: Optional[float] = 3.8
    weight_kg_used: Optional[float] = None
    calories_burned: float = 0.0

@router.get("/prefs")
async def get_exercise_prefs(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch user's exercise preferences."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    try:
        res = client.table("exercise_prefs").select("*").eq("user_id", user["id"]).limit(1).execute()
        if res.data and len(res.data) > 0:
            return {"prefs": res.data[0]}
    except Exception as e:
        logger.debug(f"Could not load exercise prefs: {e}")

    # Default fallback
    return {
        "prefs": {
            "user_id": user["id"],
            "place": "home",
            "level": "beginner",
            "avoid_tags": [],
            "minutes_per_day": 30,
            "addback_mode": "all",
            "daily_cap": 500
        }
    }

@router.put("/prefs")
async def update_exercise_prefs(
    payload: ExercisePrefsPayload,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Save or update user's exercise preferences."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    row = {
        "user_id": user["id"],
        "place": payload.place or "home",
        "level": payload.level or "beginner",
        "avoid_tags": payload.avoid_tags or [],
        "minutes_per_day": payload.minutes_per_day or 30,
        "addback_mode": payload.addback_mode or "all",
        "daily_cap": payload.daily_cap if payload.daily_cap is not None else 500,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        res = client.table("exercise_prefs").upsert(row).execute()
        return {"success": True, "prefs": res.data[0] if res.data else row}
    except Exception as e:
        logger.warning(f"Failed to upsert exercise_prefs: {e}")
        return {"success": True, "prefs": row}

@router.get("/catalog")
async def get_exercise_catalog(user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch all curated exercises from catalog."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    try:
        res = client.table("exercises").select("*").order("name").execute()
        if res.data and len(res.data) > 0:
            return {"exercises": res.data}
    except Exception as e:
        logger.debug(f"Could not fetch exercises from db: {e}")
    return {"exercises": []}

@router.get("/logs")
async def get_exercise_logs(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetch user's exercise logs for a given date or all recent logs."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    try:
        query = client.table("exercise_logs").select("*").eq("user_id", user["id"])
        if date:
            query = query.gte("created_at", f"{date}T00:00:00Z").lte("created_at", f"{date}T23:59:59Z")
        res = query.order("created_at", desc=True).limit(100).execute()
        return {"logs": res.data or []}
    except Exception as e:
        logger.debug(f"Failed to fetch exercise logs: {e}")
        return {"logs": []}

@router.post("/logs")
async def log_exercise_session(
    payload: ExerciseLogPayload,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Insert a completed workout session into exercise_logs."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user["id"],
        "name": payload.name,
        "started_at": payload.started_at or now_iso,
        "ended_at": payload.ended_at or now_iso,
        "status": payload.status or "completed",
        "planned_seconds": payload.planned_seconds or 0,
        "completed_seconds": payload.completed_seconds,
        "met": payload.met or 3.8,
        "weight_kg_used": payload.weight_kg_used,
        "calories_burned": payload.calories_burned,
        "created_at": now_iso
    }
    try:
        res = client.table("exercise_logs").insert(row).execute()
        return {"success": True, "log": res.data[0] if res.data else row}
    except Exception as e:
        logger.warning(f"Could not insert exercise log: {e}")
        return {"success": True, "log": row}

@router.get("/stats")
async def get_exercise_stats(user: Dict[str, Any] = Depends(get_current_user)):
    """Calculates active days and total exercise minutes for progress."""
    client = get_supabase_admin_client(user) or get_supabase_anon_client()
    try:
        res = (
            client.table("exercise_logs")
            .select("created_at, completed_seconds, calories_burned")
            .eq("user_id", user["id"])
            .order("created_at", desc=True)
            .limit(200)
            .execute()
        )
        logs = res.data or []
        total_seconds = sum(l.get("completed_seconds", 0) for l in logs)
        total_burned = sum(float(l.get("calories_burned", 0)) for l in logs)
        days = set()
        for l in logs:
            ca = l.get("created_at", "")
            if len(ca) >= 10:
                days.add(ca[:10])

        return {
            "total_minutes": round(total_seconds / 60),
            "active_days": len(days),
            "total_calories_burned": round(total_burned),
            "log_count": len(logs)
        }
    except Exception as e:
        logger.debug(f"Stats calculation failed: {e}")
        return {
            "total_minutes": 0,
            "active_days": 0,
            "total_calories_burned": 0,
            "log_count": 0
        }
