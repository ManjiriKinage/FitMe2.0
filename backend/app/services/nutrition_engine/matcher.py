"""Food Item Matcher, Multi-Item Sentence Splitter, and Ambiguity Disambiguator."""
import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from app.services.nutrition_engine.models import CandidateMatch

logger = logging.getLogger(__name__)

CONVERSATIONAL_PREFIXES = [
    r"^i\s+(?:just\s+)?(?:ate|had|consumed|drank|eat|have)\s+",
    r"^for\s+(?:breakfast|lunch|dinner|snack|supper|my\s+meal)\s+(?:i\s+had|i\s+ate)?\s*",
    r"^today\s+i\s+(?:ate|had)\s+",
    r"^my\s+meal\s+was\s+",
]

SPLIT_PATTERNS = [
    r"\s+and\s+",
    r"\s+with\s+",
    r"\s+along\s+with\s+",
    r"\s+plus\s+",
    r"\s*,\s*",
    r"\s*;\s*",
    r"\s*&\s*",
]

WORD_NUMBERS = {
    "a": 1.0,
    "an": 1.0,
    "one": 1.0,
    "two": 2.0,
    "three": 3.0,
    "four": 4.0,
    "five": 5.0,
    "six": 6.0,
    "seven": 7.0,
    "eight": 8.0,
    "nine": 9.0,
    "ten": 10.0,
    "half": 0.5,
    "quarter": 0.25,
}

COMMON_UNITS = [
    "medium piece", "large piece", "small piece",
    "tea cup", "tall glass",
    "katori", "bowl", "plate", "cup", "glass",
    "piece", "chapati", "roti", "phulka", "slice",
    "tablespoon", "tbsp", "teaspoon", "tsp",
    "grams", "gram", "gm", "g", "ml", "serving"
]


def normalize_text(text: str) -> str:
    """Normalize input text: lowercase, strip punctuation, remove excessive whitespace."""
    if not text:
        return ""
    s = text.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def split_multi_item_description(raw_text: str) -> List[str]:
    """
    Splits compound meal statements into individual food expressions.
    e.g. 'I ate 2 chapatis and 1 bowl of dal' -> ['2 chapatis', '1 bowl of dal']
         'poha, 1 boiled egg and chai' -> ['poha', '1 boiled egg', 'chai']
    """
    text = raw_text.strip()
    
    # Strip conversational prefixes
    for p in CONVERSATIONAL_PREFIXES:
        text = re.sub(p, "", text, flags=re.IGNORECASE).strip()

    # Split using combined conjunction regex
    regex_split = "|".join(SPLIT_PATTERNS)
    chunks = re.split(regex_split, text, flags=re.IGNORECASE)

    results = []
    for chunk in chunks:
        cleaned = chunk.strip()
        if len(cleaned) > 1:
            results.append(cleaned)

    return results if results else [raw_text.strip()]


def parse_item_portion(item_text: str) -> Tuple[float, str, str]:
    """
    Extracts (quantity, unit, food_name) from a single food expression.
    e.g. '2 medium chapatis' -> (2.0, 'medium piece', 'chapati')
         '1 bowl of dal'     -> (1.0, 'bowl', 'dal')
         '150g cooked rice'  -> (150.0, 'grams', 'cooked rice')
         'dal'               -> (1.0, 'serving', 'dal')
    """
    text = item_text.strip()
    qty = 1.0

    # 1. Check for word numbers
    for w, val in WORD_NUMBERS.items():
        pattern = rf"^{w}\s+"
        if re.match(pattern, text, flags=re.IGNORECASE):
            qty = val
            text = re.sub(pattern, "", text, flags=re.IGNORECASE).strip()
            break

    # 2. Check for numeric digits / fractions
    num_match = re.match(r"^(\d+(?:\.\d+)?|\d+/\d+)\s*", text)
    if num_match:
        val_str = num_match.group(1)
        if "/" in val_str:
            top, bot = val_str.split("/")
            qty = float(top) / float(bot) if float(bot) != 0 else 1.0
        else:
            qty = float(val_str)
        text = text[num_match.end():].strip()

    # 3. Check for serving units
    detected_unit = "serving"
    for u in sorted(COMMON_UNITS, key=len, reverse=True):
        pattern = rf"^(?:of\s+)?{u}s?(?:\s+of)?(?:\s+|$)"
        m = re.match(pattern, text, flags=re.IGNORECASE)
        if m:
            detected_unit = u
            text = text[m.end():].strip()
            break

    # If the detected unit was a food item itself (e.g. '2 chapatis', '1 dosa')
    FOOD_NAMES_IN_UNITS = {"chapati", "roti", "phulka", "puri", "idli", "dosa"}
    if detected_unit in FOOD_NAMES_IN_UNITS and not text.strip():
        food_term = detected_unit
        detected_unit = "piece"
    else:
        food_term = text.strip() if text.strip() else item_text.strip()

    return qty, detected_unit, food_term


def detect_material_ambiguity(candidates: List[CandidateMatch]) -> Optional[str]:
    """
    Checks if multiple top candidates remain with materially different caloric values (>25%).
    If so, formulates a concise clarification question to eliminate user guesswork.
    """
    if len(candidates) < 2:
        return None

    c1 = candidates[0]
    c2 = candidates[1]

    # Only check if scores are close (within 15 points)
    if (c1.score - c2.score) > 15.0:
        return None

    # Check calorie discrepancy
    cal1 = c1.energy_kcal_per_100g
    cal2 = c2.energy_kcal_per_100g
    if cal1 > 0 and cal2 > 0:
        pct_diff = abs(cal1 - cal2) / max(cal1, cal2)
        if pct_diff >= 0.25:
            return f"Did you have {c1.name} (~{round(cal1)} kcal/100g) or {c2.name} (~{round(cal2)} kcal/100g)?"

    return None
