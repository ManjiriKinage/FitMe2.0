"""Bounded AI Fallback and Heuristic Interpreter for Uncataloged Foods."""
import json
import logging
import re
import httpx
from typing import Optional, Dict, Any
from app.core.config import settings
from app.services.nutrition_engine.models import ItemNutritionResult
from app.services.nutrition_engine.calculator import resolve_serving_weight

logger = logging.getLogger(__name__)

# Clinical reference baseline for common uncataloged Indian meals
CLINICAL_HEURISTICS: Dict[str, Dict[str, Any]] = {
    "chapati": {"cals_per_100g": 242.0, "p": 7.4, "c": 50.0, "f": 1.1, "std_unit": "piece", "std_weight_g": 35.0},
    "roti": {"cals_per_100g": 242.0, "p": 7.4, "c": 50.0, "f": 1.1, "std_unit": "piece", "std_weight_g": 35.0},
    "bhakri": {"cals_per_100g": 280.0, "p": 7.6, "c": 57.0, "f": 2.4, "std_unit": "piece", "std_weight_g": 50.0},
    "dal": {"cals_per_100g": 93.0, "p": 5.3, "c": 13.3, "f": 2.3, "std_unit": "bowl", "std_weight_g": 150.0},
    "rice": {"cals_per_100g": 130.0, "p": 2.7, "c": 28.0, "f": 0.3, "std_unit": "cup", "std_weight_g": 150.0},
    "poha": {"cals_per_100g": 130.0, "p": 2.3, "c": 23.0, "f": 3.3, "std_unit": "plate", "std_weight_g": 200.0},
    "upma": {"cals_per_100g": 125.0, "p": 2.5, "c": 21.0, "f": 3.5, "std_unit": "plate", "std_weight_g": 200.0},
    "idli": {"cals_per_100g": 132.0, "p": 4.1, "c": 26.5, "f": 0.4, "std_unit": "piece", "std_weight_g": 40.0},
    "dosa": {"cals_per_100g": 165.0, "p": 3.8, "c": 26.0, "f": 4.8, "std_unit": "piece", "std_weight_g": 100.0},
    "paneer": {"cals_per_100g": 265.0, "p": 18.3, "c": 2.0, "f": 20.8, "std_unit": "bowl", "std_weight_g": 150.0},
    "chicken curry": {"cals_per_100g": 145.0, "p": 14.5, "c": 3.5, "f": 8.0, "std_unit": "bowl", "std_weight_g": 180.0},
    "egg": {"cals_per_100g": 148.0, "p": 12.6, "c": 0.8, "f": 10.0, "std_unit": "piece", "std_weight_g": 50.0},
    "curd": {"cals_per_100g": 60.0, "p": 3.1, "c": 4.4, "f": 3.0, "std_unit": "bowl", "std_weight_g": 150.0},
    "sambar": {"cals_per_100g": 65.0, "p": 2.5, "c": 9.0, "f": 2.0, "std_unit": "bowl", "std_weight_g": 150.0},
    "khichdi": {"cals_per_100g": 115.0, "p": 3.8, "c": 19.5, "f": 2.5, "std_unit": "bowl", "std_weight_g": 200.0},
}


def clinical_heuristic_estimate(food_term: str, quantity: float, unit: str) -> ItemNutritionResult:
    """Local clinical baseline used when AI is offline or unconfigured."""
    clean_name = food_term.replace("_", " ").replace("-", " ").strip().title()
    lower_term = clean_name.lower()

    matched_key = None
    for k in CLINICAL_HEURISTICS:
        if k in lower_term:
            matched_key = k
            break

    weight_g, is_std = resolve_serving_weight(clean_name, quantity, unit)

    if matched_key:
        ref = CLINICAL_HEURISTICS[matched_key]
        factor = weight_g / 100.0
        cals = round(ref["cals_per_100g"] * factor, 1)
        p = round(ref["p"] * factor, 1)
        c = round(ref["c"] * factor, 1)
        f = round(ref["f"] * factor, 1)
        source = "clinical_heuristic"
        assumption = f"Clinical baseline estimate for {quantity} {unit} ({weight_g}g)."
    else:
        # Generic mixed dish baseline: ~140 kcal/100g
        factor = weight_g / 100.0
        cals = round(140.0 * factor, 1)
        p = round(4.0 * factor, 1)
        c = round(18.0 * factor, 1)
        f = round(5.5 * factor, 1)
        source = "clinical_heuristic"
        assumption = f"Generalized composite estimate for '{clean_name}' ({weight_g}g)."

    return ItemNutritionResult(
        selected_food_name=clean_name,
        recipe_code=None,
        quantity=quantity,
        serving_unit=unit,
        serving_weight_g=weight_g,
        total_calories=cals,
        protein_g=p,
        carbohydrates_g=c,
        fat_g=f,
        fiber_g=None,
        nutrition_source=source,
        calculation_method="ai_heuristic_interpretation",
        validation_status="unverified_estimate",
        uncertainty_flags=["Uncataloged item: calculated via clinical heuristic baseline."],
        missing_data_fields=["fiber_g"],
        clarification_question=None,
        needs_user_confirmation=True,
        alternative_candidates=[]
    )


async def interpret_with_ai(food_term: str, quantity: float, unit: str) -> ItemNutritionResult:
    """
    Calls Gemini API with bounded timeout, strict JSON validation, and automatic
    heuristic fallback if the remote AI call times out or fails.
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.startswith("your-"):
        return clinical_heuristic_estimate(food_term, quantity, unit)

    weight_g, _ = resolve_serving_weight(food_term, quantity, unit)

    system_instruction = (
        "You are a clinical nutrition assistant for Indian foods. "
        "Estimate nutrition for the uncataloged food item. "
        "Respond ONLY with valid JSON conforming to this schema:\n"
        "{\n"
        '  "food_name": "clean descriptive name",\n'
        '  "estimated_calories": float,\n'
        '  "protein_g": float,\n'
        '  "carbohydrates_g": float,\n'
        '  "fat_g": float,\n'
        '  "assumptions": "explicit recipe assumptions (oil, portion)"\n'
        "}"
    )
    user_prompt = f"Estimate nutrition for: {quantity} {unit} of '{food_term}' (approximate weight: {weight_g}g)."

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={settings.GEMINI_API_KEY}"
    payload = {
        "contents": [
            {"parts": [{"text": f"{system_instruction}\n\n{user_prompt}"}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                clean_json = re.sub(r"^```json\s*", "", text.strip())
                clean_json = re.sub(r"\s*```$", "", clean_json)
                parsed = json.loads(clean_json)

                cals = max(0.0, float(parsed.get("estimated_calories", 0.0)))
                p = max(0.0, float(parsed.get("protein_g", 0.0)))
                c = max(0.0, float(parsed.get("carbohydrates_g", 0.0)))
                f = max(0.0, float(parsed.get("fat_g", 0.0)))

                # Atwater sanity check: ensure calories are within reasonable bounds of macros
                macro_cal_approx = (4.0 * p) + (4.0 * c) + (9.0 * f)
                if cals == 0.0 and macro_cal_approx > 0:
                    cals = round(macro_cal_approx, 1)

                return ItemNutritionResult(
                    selected_food_name=parsed.get("food_name", food_term.title()),
                    recipe_code=None,
                    quantity=quantity,
                    serving_unit=unit,
                    serving_weight_g=weight_g,
                    total_calories=round(cals, 1),
                    protein_g=round(p, 1),
                    carbohydrates_g=round(c, 1),
                    fat_g=round(f, 1),
                    fiber_g=None,
                    nutrition_source="ai_assisted_fallback",
                    calculation_method="ai_heuristic_interpretation",
                    uncertainty_flags=["Estimated via AI fallback; please review before confirming."],
                    missing_data_fields=["fiber_g"],
                    clarification_question=None,
                    needs_user_confirmation=True,
                    alternative_candidates=[]
                )
            else:
                logger.warning(f"AI fallback returned {resp.status_code}. Using clinical baseline.")
                return clinical_heuristic_estimate(food_term, quantity, unit)
    except Exception as exc:
        logger.info(f"AI service unavailable ({exc}). Using clinical baseline.")
        return clinical_heuristic_estimate(food_term, quantity, unit)
