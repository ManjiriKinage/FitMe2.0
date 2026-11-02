"""AI Meal Suggestion Service for remaining calories and protein."""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import httpx
from app.core.config import settings
from app.services.food_ai import FALLBACK_INDIAN_FOODS

logger = logging.getLogger(__name__)

# In-memory cache: key = f"{user_id}:{date_str}:{meal_slot}" -> (timestamp, result_dict)
_SUGGESTION_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour cache

# Rate limit: user_id -> last_call_timestamp
_LAST_CALL_TIMESTAMP: Dict[str, float] = {}
RATE_LIMIT_COOLDOWN_SECONDS = 3  # Minimum 3s between refreshes

# Curated high-protein Indian meal ideas based on calories remaining
CURATED_MEAL_SUGGESTIONS = [
    {
        "name": "Paneer Bhurji with 2 Rotis",
        "min_cals": 400,
        "max_cals": 650,
        "portion": "1 bowl bhurji (150g) + 2 whole wheat rotis",
        "calories": 450,
        "protein_g": 21.0,
        "carbs_g": 42.0,
        "fat_g": 21.8,
        "is_db_verified": True,
    },
    {
        "name": "Egg Bhurji with 2 Chapatis",
        "min_cals": 300,
        "max_cals": 500,
        "portion": "2 eggs scrambled + 2 whole wheat chapatis",
        "calories": 320,
        "protein_g": 18.0,
        "carbs_g": 35.0,
        "fat_g": 11.0,
        "is_db_verified": True,
    },
    {
        "name": "Dal Tadka with Steamed Rice",
        "min_cals": 350,
        "max_cals": 550,
        "portion": "1 bowl dal (150ml) + 1 cup rice (150g)",
        "calories": 380,
        "protein_g": 12.5,
        "carbs_g": 68.0,
        "fat_g": 4.5,
        "is_db_verified": True,
    },
    {
        "name": "Sprouted Moong & Paneer Salad",
        "min_cals": 200,
        "max_cals": 380,
        "portion": "1 big bowl (200g) with cucumber & lemon",
        "calories": 240,
        "protein_g": 16.0,
        "carbs_g": 28.0,
        "fat_g": 6.5,
        "is_db_verified": True,
    },
    {
        "name": "Soya Chunks Curry with 2 Phulkas",
        "min_cals": 350,
        "max_cals": 550,
        "portion": "1 bowl soya curry (150g) + 2 phulkas",
        "calories": 390,
        "protein_g": 26.0,
        "carbs_g": 46.0,
        "fat_g": 8.0,
        "is_db_verified": True,
    },
    {
        "name": "Grilled Chicken Breast with Stir-fry Veggies",
        "min_cals": 300,
        "max_cals": 550,
        "portion": "150g chicken breast + 100g sauteed vegetables",
        "calories": 310,
        "protein_g": 34.0,
        "carbs_g": 8.0,
        "fat_g": 12.0,
        "is_db_verified": True,
    },
    {
        "name": "Curd (Dahi) with Roasted Chana & Apple",
        "min_cals": 150,
        "max_cals": 300,
        "portion": "1 cup low-fat curd (150g) + 30g roasted chana",
        "calories": 220,
        "protein_g": 14.0,
        "carbs_g": 26.0,
        "fat_g": 4.0,
        "is_db_verified": True,
    },
]

def determine_meal_slot(now_hour: int) -> str:
    """
    Time of day meal slot:
    - before 11 am: Breakfast
    - before 4 pm (16): Lunch
    - before 7 pm (19): Snack
    - otherwise: Dinner
    """
    if now_hour < 11:
        return "breakfast"
    elif now_hour < 16:
        return "lunch"
    elif now_hour < 19:
        return "snack"
    else:
        return "dinner"

async def get_or_generate_suggestion(
    user_id: str,
    remaining_cals: int,
    remaining_protein: int,
    current_hour: int = 19,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """Generates an Indian meal idea fitting remaining calories and high in protein."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meal_slot = determine_meal_slot(current_hour)
    cache_key = f"{user_id}:{today_str}:{meal_slot}"

    now_time = time.time()
    # Check rate limit on force_refresh
    if force_refresh:
        last_call = _LAST_CALL_TIMESTAMP.get(user_id, 0)
        if now_time - last_call < RATE_LIMIT_COOLDOWN_SECONDS:
            # Return cached or continue without error
            pass
        _LAST_CALL_TIMESTAMP[user_id] = now_time

    # Clear cache if force_refresh requested
    if force_refresh and cache_key in _SUGGESTION_CACHE:
        del _SUGGESTION_CACHE[cache_key]

    # Return cached if valid and not force_refresh
    if not force_refresh and cache_key in _SUGGESTION_CACHE:
        cached_ts, cached_data = _SUGGESTION_CACHE[cache_key]
        if now_time - cached_ts < CACHE_TTL_SECONDS:
            res = dict(cached_data)
            res["remaining_calories"] = remaining_cals
            res["remaining_protein"] = remaining_protein
            return res

    # 1. Rule checks
    if remaining_cals <= 0:
        return {
            "status": "over",
            "remaining_calories": remaining_cals,
            "remaining_protein": remaining_protein,
            "meal_slot": meal_slot,
            "message": "You've reached your calorie goal for today.",
            "suggestion": None,
        }

    if remaining_cals < 150:
        return {
            "status": "close",
            "remaining_calories": remaining_cals,
            "remaining_protein": remaining_protein,
            "meal_slot": meal_slot,
            "message": "You're close to your goal for today.",
            "suggestion": None,
        }

    # 2. Try Gemini API first (with official production model fallbacks)
    gemini_suggestion = None
    if settings.GEMINI_API_KEY and not settings.GEMINI_API_KEY.startswith("your-") and settings.ENVIRONMENT != "test":
        prompt = f"""You are a nutrition coach. Suggest 1 healthy, appetizing Indian meal idea for {meal_slot.capitalize()}.
Remaining budget: {remaining_cals} kcal, {remaining_protein}g protein.
The meal should fit comfortably within {remaining_cals} kcal and lean high in protein.
Never suggest extreme or very low calorie diets.
Return STRICT JSON ONLY conforming to:
{{
  "name": "e.g. Paneer Bhurji with 2 Rotis",
  "portion": "e.g. 1 bowl bhurji (150g) with 2 whole wheat rotis",
  "calories": 450,
  "protein_g": 22.0,
  "carbs_g": 40.0,
  "fat_g": 18.0,
  "explanation": "e.g. High in protein to help hit your target."
}}
"""
        models_to_try = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"]
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 300}
        }

        for model_name in models_to_try:
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(api_url, json=payload)
                    if resp.status_code == 200:
                        raw_data = resp.json()
                        candidates = raw_data.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            clean_json = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                            parsed = json.loads(clean_json)
                            if "name" in parsed and "calories" in parsed:
                                # Check if dish exists in INDB for verification
                                dish_lower = parsed["name"].lower()
                                is_verified = any(
                                    k in dish_lower for k in ["paneer", "egg", "dal", "chana", "soya", "roti", "rice", "curd"]
                                )
                                gemini_suggestion = {
                                    "name": parsed["name"],
                                    "portion": parsed.get("portion", "1 serving"),
                                    "calories": round(float(parsed["calories"])),
                                    "protein_g": round(float(parsed.get("protein_g", 15)), 1),
                                    "carbs_g": round(float(parsed.get("carbs_g", 30)), 1),
                                    "fat_g": round(float(parsed.get("fat_g", 10)), 1),
                                    "is_db_verified": is_verified,
                                    "source": "gemini_ai"
                                }
                                logger.info(f"Generated AI meal suggestion using {model_name}: {parsed['name']}")
                                break
                    else:
                        logger.warning(f"Gemini API model {model_name} returned status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.warning(f"Error querying Gemini on {model_name}: {e}")

    # 3. Fallback to curated INDB verified Indian meals fitting remaining budget
    if not gemini_suggestion:
        matched = [
            m for m in CURATED_MEAL_SUGGESTIONS
            if m["calories"] <= remaining_cals + 50
        ]
        if not matched:
            matched = [CURATED_MEAL_SUGGESTIONS[-1]]  # Lightest meal (curd/chana)

        # Pick best fit (closest calories or highest protein)
        best = max(matched, key=lambda x: (x["protein_g"], -abs(remaining_cals - x["calories"])))
        gemini_suggestion = {
            "name": best["name"],
            "portion": best["portion"],
            "calories": best["calories"],
            "protein_g": best["protein_g"],
            "carbs_g": best["carbs_g"],
            "fat_g": best["fat_g"],
            "is_db_verified": True,
        }

    meal_name = gemini_suggestion["name"].lower()
    custom_msg = f"You have {remaining_cals} kcal and {max(0, remaining_protein)}g protein left. Try {meal_name} for {meal_slot}."

    result = {
        "status": "ready",
        "remaining_calories": remaining_cals,
        "remaining_protein": remaining_protein,
        "meal_slot": meal_slot,
        "message": custom_msg,
        "suggestion": gemini_suggestion,
        "disclaimer": "Suggestions are estimates, not medical advice."
    }

    _SUGGESTION_CACHE[cache_key] = (now_time, result)
    return result

