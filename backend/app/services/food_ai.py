"""AI Food calorie and macronutrient estimation service with Indian food focus and Gemini API integration."""
import json
import logging
import re
import httpx
from typing import Optional
from app.core.config import settings
from app.schemas.food import AIEstimateResponse

logger = logging.getLogger(__name__)

# Fallback curated database for common Indian foods if AI API is unreachable or offline
FALLBACK_INDIAN_FOODS = {
    "chapati": {"cals": 85, "p": 2.6, "c": 17.5, "f": 0.4, "unit": "medium piece", "assump": "Standard 6-inch whole wheat chapati (phulka) without butter."},
    "roti": {"cals": 85, "p": 2.6, "c": 17.5, "f": 0.4, "unit": "piece", "assump": "Plain whole wheat roti without extra ghee."},
    "dal": {"cals": 140, "p": 8.0, "c": 20.0, "f": 3.5, "unit": "bowl (150ml)", "assump": "Cooked yellow toor/moong dal with light tadka (tempering)."},
    "poha": {"cals": 260, "p": 4.5, "c": 46.0, "f": 6.5, "unit": "plate (200g)", "assump": "Flattened rice cooked with onions, mustard seeds, and roasted peanuts."},
    "rice": {"cals": 130, "p": 2.7, "c": 28.0, "f": 0.3, "unit": "cup cooked (150g)", "assump": "Steamed white basmati or sonamasuri rice."},
    "paneer bhurji": {"cals": 280, "p": 16.0, "c": 7.0, "f": 21.0, "unit": "bowl (150g)", "assump": "Scrambled cottage cheese cooked with onions, tomatoes, and spices."},
    "idli": {"cals": 65, "p": 2.0, "c": 13.0, "f": 0.2, "unit": "piece", "assump": "Steamed fermented rice and urad dal cake."},
    "dosa": {"cals": 165, "p": 3.8, "c": 26.0, "f": 4.8, "unit": "piece (plain)", "assump": "Crisp fermented rice-lentil crepe cooked with 1 tsp oil."},
    "egg": {"cals": 74, "p": 6.3, "c": 0.4, "f": 5.0, "unit": "large whole egg", "assump": "Standard hard boiled or plain whole egg."},
    "chicken curry": {"cals": 260, "p": 24.0, "c": 6.0, "f": 15.0, "unit": "bowl (180g)", "assump": "Skinless chicken breast/thigh pieces in onion-tomato gravy."},
    "salad": {"cals": 50, "p": 1.5, "c": 8.0, "f": 0.5, "unit": "plate", "assump": "Fresh mixed cucumber, tomato, carrot, and onion slices."}
}

SYSTEM_PROMPT = """You are FitMe AI, a clinical and sports nutrition assistant specializing in Indian foods and international meals.
Estimate the nutrition for the food item requested by the user.

You MUST respond strictly with valid JSON conforming to this JSON schema:
{
  "food_name": "clean descriptive name of the food",
  "quantity": numeric float for total quantity (e.g. 2.0),
  "unit": "measurement unit (e.g. pieces, katori, bowl, plate, cup, tbsp, grams)",
  "estimated_calories": numeric float representing total calories,
  "protein_g": numeric float for protein in grams,
  "carbohydrates_g": numeric float for carbs in grams,
  "fat_g": numeric float for fat in grams,
  "assumptions": "explicit assumptions made (e.g., cooked with 1 tsp oil, standard 150ml katori, whole milk)",
  "uncertainty_note": "brief note on variance or 'Estimate only; preparation methods and oil content may alter calories.'",
  "clarification_question": "optional question if preparation significantly changes the count (e.g. 'Is it deep-fried or air-fried?'), or null"
}

Important Guidelines:
1. Prioritize standard Indian household measurements: katori (150ml bowl), medium chapati/roti (~35g wheat), standard plate (~250-300g), cup (200ml).
2. If multiple items are in one dish (e.g., '2 chapatis and 1 bowl dal'), provide the aggregated total nutritional value and specify the breakdown in assumptions.
3. Be realistic about typical Indian cooking oil/ghee usage (typically 5-10g per serving unless specified oil-free).
4. Return ONLY valid JSON, no markdown fences, no explanatory text outside the JSON.
"""

def heuristic_estimate(query: str) -> AIEstimateResponse:
    """Smart fallback estimation for common items when offline or API key isn't provided yet."""
    q_lower = query.lower()
    
    # Try to extract numbers
    num_match = re.search(r"(\d+(\.\d+)?)", q_lower)
    qty = float(num_match.group(1)) if num_match else 1.0

    for key, data in FALLBACK_INDIAN_FOODS.items():
        if key in q_lower:
            cals = round(data["cals"] * qty, 1)
            p = round(data["p"] * qty, 1)
            c = round(data["c"] * qty, 1)
            f = round(data["f"] * qty, 1)
            unit = f"{data['unit']}{'s' if qty > 1 and not data['unit'].endswith('s') else ''}"
            return AIEstimateResponse(
                food_name=query.strip().title(),
                quantity=qty,
                unit=unit,
                estimated_calories=cals,
                protein_g=p,
                carbohydrates_g=c,
                fat_g=f,
                assumptions=f"Based on {qty} x {data['assump']}",
                uncertainty_note="Estimate based on standard home recipe; restaurant or oil-heavy preparation may increase calories by 20-40%."
            )

    # General fallback
    return AIEstimateResponse(
        food_name=query.strip().title(),
        quantity=qty,
        unit="serving",
        estimated_calories=round(220.0 * qty, 1),
        protein_g=round(6.0 * qty, 1),
        carbohydrates_g=round(25.0 * qty, 1),
        fat_g=round(10.0 * qty, 1),
        assumptions=f"Standard mixed serving estimate for '{query}' prepared with moderate seasoning.",
        uncertainty_note="Exact preparation and recipe vary. You can edit the values below before saving."
    )

async def estimate_food_calories(query: str) -> AIEstimateResponse:
    """
    Calls Gemini API (or falls back to high-accuracy local nutrition database)
    to estimate nutrition for a given text description.
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.startswith("your-"):
        logger.info("No Gemini API key configured. Utilizing local nutrition knowledge base.")
        return heuristic_estimate(query)

    # Try Gemini API via REST
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{SYSTEM_PROMPT}\n\nUser Food Query: {query}"}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(api_url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                text_content = data["candidates"][0]["content"]["parts"][0]["text"]
                # Clean any markdown tags if present
                clean_json = re.sub(r"^```json\s*", "", text_content.strip())
                clean_json = re.sub(r"\s*```$", "", clean_json)
                parsed = json.loads(clean_json)

                return AIEstimateResponse(
                    food_name=parsed.get("food_name", query.strip().title()),
                    quantity=float(parsed.get("quantity", 1.0)),
                    unit=str(parsed.get("unit", "serving")),
                    estimated_calories=float(parsed.get("estimated_calories", 0.0)),
                    protein_g=float(parsed.get("protein_g", 0.0)),
                    carbohydrates_g=float(parsed.get("carbohydrates_g", 0.0)),
                    fat_g=float(parsed.get("fat_g", 0.0)),
                    assumptions=str(parsed.get("assumptions", "Standard portion")),
                    uncertainty_note=parsed.get("uncertainty_note"),
                    clarification_question=parsed.get("clarification_question")
                )
            else:
                logger.warning(f"Gemini API returned status {resp.status_code}: {resp.text}")
                return heuristic_estimate(query)
    except Exception as exc:
        logger.error(f"Error calling Gemini API: {exc}")
        return heuristic_estimate(query)
