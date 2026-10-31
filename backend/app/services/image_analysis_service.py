"""AI-Powered Plate Scanner Service with Caching, Nutrition Matching, and Feedback."""
import base64
import hashlib
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx
from httpx import AsyncClient
from app.core.config import settings
from app.schemas.food import MealType
from app.schemas.meal_scan import (
    GeminiDetectedFood,
    GeminiVisionAnalysisResult,
    DetectedFoodItem,
    MealImageAnalysisResponse,
    ConfirmedFoodItem,
    RecalculateItemResponse,
)
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_engine.calculator import resolve_serving_weight
from app.services.nutrition_engine.ai_fallback import (
    CLINICAL_HEURISTICS,
    clinical_heuristic_estimate,
    interpret_with_ai,
)
from app.services.user_learning import UserPreferenceLearningEngine
from app.services.vision_usage_tracker import VisionUsageTracker
from app.services.feedback_learning.diff_engine import FeedbackDiffEngine

logger = logging.getLogger(__name__)

# Analysis & Model Configuration
ANALYSIS_VERSION = "v1"
MODEL_PROVIDER = "google"
MODEL_VERSION = "gemini-flash-lite-latest"
STORAGE_BUCKET = "food_images"
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB
MIN_IMAGE_BYTES = 100

# Magic bytes signatures for supported image types
IMAGE_SIGNATURES = [
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"RIFF", "image/webp", ".webp"),
]

# Standard Indian visual plate estimation heuristics
VISUAL_FOOD_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "chapati": {"cals_per_100g": 242.0, "p": 7.4, "c": 50.0, "f": 1.1, "unit": "piece", "default_g": 35.0},
    "roti": {"cals_per_100g": 242.0, "p": 7.4, "c": 50.0, "f": 1.1, "unit": "piece", "default_g": 35.0},
    "bhakri": {"cals_per_100g": 280.0, "p": 7.6, "c": 57.0, "f": 2.4, "unit": "piece", "default_g": 60.0},
    "dal": {"cals_per_100g": 93.0, "p": 5.3, "c": 13.3, "f": 2.3, "unit": "bowl", "default_g": 150.0},
    "rice": {"cals_per_100g": 130.0, "p": 2.7, "c": 28.0, "f": 0.3, "unit": "cup", "default_g": 150.0},
    "cooked white rice": {"cals_per_100g": 130.0, "p": 2.7, "c": 28.0, "f": 0.3, "unit": "cup", "default_g": 150.0},
    "poha": {"cals_per_100g": 140.0, "p": 2.5, "c": 21.0, "f": 5.0, "unit": "plate", "default_g": 200.0},
    "upma": {"cals_per_100g": 125.0, "p": 2.5, "c": 21.0, "f": 3.5, "unit": "plate", "default_g": 200.0},
    "idli": {"cals_per_100g": 132.0, "p": 4.1, "c": 26.5, "f": 0.4, "unit": "piece", "default_g": 40.0},
    "dosa": {"cals_per_100g": 165.0, "p": 3.8, "c": 26.0, "f": 4.8, "unit": "piece", "default_g": 100.0},
    "paneer": {"cals_per_100g": 265.0, "p": 18.3, "c": 2.0, "f": 20.8, "unit": "bowl", "default_g": 150.0},
    "paneer curry": {"cals_per_100g": 180.0, "p": 9.5, "c": 6.5, "f": 13.0, "unit": "bowl", "default_g": 150.0},
    "chicken curry": {"cals_per_100g": 145.0, "p": 14.5, "c": 3.5, "f": 8.0, "unit": "bowl", "default_g": 180.0},
    "egg": {"cals_per_100g": 148.0, "p": 12.6, "c": 0.8, "f": 10.0, "unit": "piece", "default_g": 50.0},
    "boiled egg": {"cals_per_100g": 148.0, "p": 12.6, "c": 0.8, "f": 10.0, "unit": "piece", "default_g": 50.0},
    "curd": {"cals_per_100g": 60.0, "p": 3.1, "c": 4.4, "f": 3.0, "unit": "bowl", "default_g": 150.0},
    "sambar": {"cals_per_100g": 65.0, "p": 2.5, "c": 9.0, "f": 2.0, "unit": "bowl", "default_g": 150.0},
    "salad": {"cals_per_100g": 35.0, "p": 1.2, "c": 6.5, "f": 0.3, "unit": "bowl", "default_g": 100.0},
    "sabzi": {"cals_per_100g": 85.0, "p": 2.5, "c": 9.0, "f": 4.5, "unit": "bowl", "default_g": 150.0},
}

class ImageAnalysisService:
    """Manages secure image validation, caching, vision detection, and learning."""

    @staticmethod
    def validate_image_data(image_base64: str, declared_mime: str = "image/jpeg") -> Tuple[bytes, str, str, str]:
        """
        Validates base64 string, checks binary signatures, file size, and computes SHA-256 hash.
        Returns: (image_bytes, validated_mime, extension, sha256_hash)
        """
        if not image_base64 or len(image_base64) < 20:
            raise ValueError("Image data is empty or too short.")

        # Clean base64 header if present (e.g. data:image/jpeg;base64,...)
        clean_b64 = re.sub(r"^data:image\/[a-zA-Z0-9\+\-\.]+;base64,", "", image_base64.strip())

        try:
            image_bytes = base64.b64decode(clean_b64, validate=True)
        except Exception as e:
            raise ValueError(f"Invalid base64 encoding: {e}")

        byte_len = len(image_bytes)
        if byte_len < MIN_IMAGE_BYTES:
            raise ValueError(f"Image file is too small ({byte_len} bytes). Minimum required is {MIN_IMAGE_BYTES} bytes.")
        if byte_len > MAX_IMAGE_BYTES:
            raise ValueError(f"Image exceeds maximum size of 10MB ({byte_len / (1024 * 1024):.2f}MB).")

        # Validate magic bytes
        validated_mime = None
        ext = ".jpg"
        for sig, mime, extension in IMAGE_SIGNATURES:
            if image_bytes.startswith(sig):
                validated_mime = mime
                ext = extension
                break

        # Special check for WebP: begins with RIFF, bytes 8..12 must be WEBP
        if not validated_mime and image_bytes.startswith(b"RIFF") and len(image_bytes) > 12:
            if image_bytes[8:12] == b"WEBP":
                validated_mime = "image/webp"
                ext = ".webp"

        if not validated_mime:
            # Fallback to declared mime if it's in accepted list
            if declared_mime in ["image/jpeg", "image/png", "image/webp"]:
                validated_mime = declared_mime
                ext = ".jpg" if "jpeg" in declared_mime else (".png" if "png" in declared_mime else ".webp")
            else:
                raise ValueError("Unsupported image format. Allowed formats: JPEG, PNG, WebP.")

        # Cryptographic SHA-256 for duplicate detection
        image_hash = hashlib.sha256(image_bytes).hexdigest()
        return image_bytes, validated_mime, ext, image_hash

    @staticmethod
    def check_duplicate_image_cache(
        client: Any,
        user_id: str,
        image_hash: str
    ) -> Optional[Dict[str, Any]]:
        """
        Queries whether the user has already analyzed an identical image with the current analysis version.
        Scoped strictly by user_id to ensure user isolation.
        Enforces a 30-day cache validity window and checks matching analysis/model versions.
        """
        if not client or not user_id:
            return None

        try:
            thirty_days_ago = datetime.fromtimestamp(
                datetime.now(timezone.utc).timestamp() - (30 * 86400),
                timezone.utc
            ).isoformat()

            res = (
                client.table("food_images")
                .select("*")
                .eq("user_id", user_id)
                .eq("image_hash", image_hash)
                .eq("analysis_version", ANALYSIS_VERSION)
                .eq("model_provider", MODEL_PROVIDER)
                .eq("model_version", MODEL_VERSION)
                .eq("analysis_status", "completed")
                .gte("created_at", thirty_days_ago)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data and len(res.data) > 0:
                logger.info(f"Exact duplicate image cache HIT for user {user_id} (hash: {image_hash[:10]})")
                return res.data[0]
        except Exception as e:
            logger.warning(f"Could not check duplicate image cache: {e}")

        return None

    @staticmethod
    def upload_image_to_storage(
        client: Any,
        user_id: str,
        image_bytes: bytes,
        mime_type: str,
        image_hash: str,
        ext: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Uploads image to Supabase Storage private bucket 'food_images'.
        Stores images under user-isolated path 'user_{user_id}/{image_hash}_{timestamp}{ext}'.
        Returns: (storage_path, signed_url)
        """
        storage_path = f"user_{user_id}/{image_hash[:16]}_{int(time.time())}{ext}"
        signed_url = None

        if not client:
            return storage_path, None

        try:
            # 1. Attempt upload to private bucket
            try:
                client.storage.from_(STORAGE_BUCKET).upload(
                    path=storage_path,
                    file=image_bytes,
                    file_options={"content-type": mime_type, "upsert": "true"}
                )
            except Exception as upload_exc:
                err_msg = str(upload_exc).lower()
                # If bucket doesn't exist yet, attempt to create it as a private bucket
                if "bucket not found" in err_msg or "not found" in err_msg or "404" in err_msg:
                    try:
                        logger.info(f"Private bucket '{STORAGE_BUCKET}' not found. Attempting creation...")
                        client.storage.create_bucket(
                            STORAGE_BUCKET,
                            options={
                                "public": False,
                                "file_size_limit": MAX_IMAGE_BYTES,
                                "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]
                            }
                        )
                        # Retry upload after bucket creation
                        client.storage.from_(STORAGE_BUCKET).upload(
                            path=storage_path,
                            file=image_bytes,
                            file_options={"content-type": mime_type, "upsert": "true"}
                        )
                    except Exception as b_err:
                        logger.warning(f"Failed to auto-create bucket or re-upload: {b_err}")
                else:
                    logger.warning(f"Supabase storage upload error: {upload_exc}")

            # 2. Create a 24-hour signed URL for private access
            try:
                signed_res = client.storage.from_(STORAGE_BUCKET).create_signed_url(
                    path=storage_path,
                    expires_in=86400
                )
                if signed_res and isinstance(signed_res, dict):
                    signed_url = signed_res.get("signedURL") or signed_res.get("signedUrl")
                elif signed_res and isinstance(signed_res, str):
                    signed_url = signed_res
            except Exception as sign_exc:
                logger.warning(f"Could not generate signed URL: {sign_exc}")

        except Exception as exc:
            logger.warning(f"Supabase storage operation failed ({exc}).")

        return storage_path, signed_url

    @classmethod
    async def analyze_plate_image(
        cls,
        image_bytes: bytes,
        mime_type: str,
        image_hash: str,
        meal_type: MealType = "lunch"
    ) -> Tuple[List[Dict[str, Any]], Optional[str], Dict[str, int]]:
        """
        Calls Gemini Vision API with structured JSON output and validates response against Pydantic schema.
        Detects multiple distinct food items (especially Indian foods), returning portion estimates in grams,
        preparation assumptions, confidence levels, and uncertainty notes.
        Falls back gracefully to calibrated visual heuristics if offline or unconfigured.
        Returns: (validated_foods, overall_uncertainty, token_counts)
        """
        token_counts = {"prompt_tokens": 0, "completion_tokens": 0}

        if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.startswith("your-") or settings.ENVIRONMENT == "test":
            logger.info("Gemini API key not configured or in test mode. Using calibrated visual heuristics fallback.")
            fallback_foods, fallback_unc = cls._visual_heuristics_fallback(meal_type)
            return fallback_foods, fallback_unc, token_counts

        b64_data = base64.b64encode(image_bytes).decode("utf-8")
        system_instruction = (
            "You are FitMe Vision AI, an expert clinical nutrition and Indian cuisine visual analyzer.\n"
            "Analyze the provided image of a food plate or meal.\n"
            "Identify EVERY reasonably distinguishable and distinct food item visible on the plate or meal.\n"
            "Pay special attention to Indian dishes, including but not limited to:\n"
            "- Flatbreads: roti, chapati, phulka, paratha, puri, naan, bajra or jowar bhakri\n"
            "- Grains: cooked white rice, brown rice, jeera rice, biryani, khichdi, poha, upma\n"
            "- Dals and gravies: dal tadka, dal fry, toor dal, sambar, rasam, kadhi\n"
            "- Curries and sabzis: paneer curry, chana masala, rajma, aloo gobi, bhindi masala, mixed vegetable sabzi\n"
            "- South Indian: idli, dosa, uttapam, vada, medu vada\n"
            "- Proteins: paneer, eggs (boiled, bhurji, omelette), chicken curry, fish, mutton\n"
            "- Accompaniments & sides: kachumber/salad, curd, raita, chutney, papad, snacks (samosa, pakora), beverages\n\n"
            "For each detected food item, provide:\n"
            "1. Canonical food name and common aliases.\n"
            "2. Category (flatbread | grain | lentil | curry | protein | dairy | salad | snack | beverage).\n"
            "3. Identifiable preparation method (cooked | steamed | roasted | shallow_fried | deep_fried | raw).\n"
            "4. Estimated portion size in grams (estimated_weight_g) calibrated against standard Indian visual portion references:\n"
            "   - 1 medium chapati/roti: ~35g (70-85 kcal)\n"
            "   - 1 piece bajra/jowar bhakri: ~60g (~102 kcal)\n"
            "   - 1 standard katori/bowl of dal or curry: ~150g\n"
            "   - 1 bowl/cup of cooked white rice: ~150g (~195 kcal)\n"
            "   - 1 standard plate of poha/upma: ~200g (~260-280 kcal)\n"
            "   - 1 piece idli: ~40g (~50 kcal), 1 plain dosa: ~100g (~165 kcal)\n"
            "   - 1 boiled egg: ~50g (~74 kcal)\n"
            "5. Serving description, quantity, and unit.\n"
            "6. Confidence level ('high', 'medium', or 'low').\n"
            "7. Explicit preparation and portion assumptions (e.g. 'Home-cooked with moderate oil', 'Visual depth estimate').\n"
            "8. Item uncertainty note describing any visual ambiguities, obscured views, or uncertainty in portion or composition.\n\n"
            "Also provide overall_uncertainty for the whole plate (clarifying visual limits like hidden oils, dressings, or depth ambiguities).\n\n"
            "You MUST respond ONLY with valid JSON conforming to this schema:\n"
            "{\n"
            '  "foods": [\n'
            "    {\n"
            '      "name": "descriptive common food name",\n'
            '      "aliases": ["roti", "phulka"],\n'
            '      "category": "flatbread | grain | lentil | curry | protein | dairy | salad | snack | beverage",\n'
            '      "preparation": "cooked | steamed | roasted | shallow_fried | deep_fried | raw",\n'
            '      "estimated_weight_g": float,\n'
            '      "serving_description": "e.g. 2 medium chapatis (~70g)",\n'
            '      "serving_quantity": float,\n'
            '      "serving_unit": "piece | bowl | cup | plate | serving",\n'
            '      "confidence": "high | medium | low",\n'
            '      "assumptions": ["Visual estimate assuming home-cooked preparation with moderate oil"],\n'
            '      "uncertainty": "Visual ambiguity or portion uncertainty (or null if clearly identifiable)"\n'
            "    }\n"
            "  ],\n"
            '  "overall_uncertainty": "Visual estimates are approximate and cannot verify oil quantity or hidden salt/sugar from photo."\n'
            "}\n"
            "Do not output markdown code blocks or explanatory text outside the JSON."
        )

        user_prompt = f"Identify all food items on this {meal_type} plate with their estimated portions."
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_VERSION}:generateContent?key={settings.GEMINI_API_KEY}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{system_instruction}\n\n{user_prompt}"},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2
            }
        }

        try:
            async with AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    usage_meta = resp_json.get("usageMetadata", {})
                    token_counts = {
                        "prompt_tokens": int(usage_meta.get("promptTokenCount", 320)),
                        "completion_tokens": int(usage_meta.get("candidatesTokenCount", 160))
                    }
                    candidates = resp_json.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            text_body = parts[0]["text"].strip()
                            clean_json = re.sub(r"^```json\s*", "", text_body)
                            clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                            data = json.loads(clean_json)
                            validated_foods, overall_uncertainty = cls.parse_vision_response(data)
                            if validated_foods:
                                return validated_foods, overall_uncertainty, token_counts
        except Exception as exc:
            logger.warning(f"Gemini Vision call failed ({exc}). Using visual heuristics fallback.")

        fallback_foods, fallback_unc = cls._visual_heuristics_fallback(meal_type)
        return fallback_foods, fallback_unc, token_counts

    @classmethod
    def parse_vision_response(
        cls,
        data: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Validates raw Gemini Vision JSON response using strict Pydantic schemas.
        Returns validated food dictionaries and overall plate uncertainty.
        Includes an item-by-item salvage loop so that individual malformed items
        do not discard cleanly detected foods on the plate.
        """
        validated_foods: List[Dict[str, Any]] = []
        overall_uncertainty: Optional[str] = None

        try:
            analysis_result = GeminiVisionAnalysisResult.model_validate(data)
            validated_foods = [food.model_dump() for food in analysis_result.foods]
            overall_uncertainty = analysis_result.overall_uncertainty
        except Exception as val_err:
            logger.warning(f"Batch Pydantic validation note: {val_err}. Salvaging individual items...")
            if isinstance(data, dict):
                overall_uncertainty = data.get("overall_uncertainty")
                for item in data.get("foods", []):
                    try:
                        validated_food = GeminiDetectedFood.model_validate(item)
                        validated_foods.append(validated_food.model_dump())
                    except Exception as item_err:
                        logger.warning(f"Skipping unparsable food item: {item_err}")

        return validated_foods, overall_uncertainty

    @classmethod
    def _visual_heuristics_fallback(
        cls,
        meal_type: MealType = "lunch"
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Calibrated fallback representing standard balanced Indian plate with portion estimates and uncertainty."""
        overall_unc = (
            "Visual estimate calibrated from standard balanced Indian plate portions. "
            "Actual calories depend on home oil/ghee usage."
        )
        if meal_type == "breakfast":
            return [
                {
                    "name": "Poha",
                    "aliases": ["kanda poha"],
                    "category": "grain",
                    "preparation": "cooked",
                    "estimated_weight_g": 200.0,
                    "serving_description": "1 medium plate (~200g)",
                    "serving_quantity": 1.0,
                    "serving_unit": "plate",
                    "confidence": "medium",
                    "assumptions": ["Visual estimate: standard home-cooked poha with light tempering and peanuts"],
                    "uncertainty": "Peanut quantity and tempering oil cannot be verified visually"
                }
            ], overall_unc
        elif meal_type == "snack":
            return [
                {
                    "name": "Mixed Salad",
                    "aliases": ["cucumber tomato salad", "kachumber"],
                    "category": "salad",
                    "preparation": "raw",
                    "estimated_weight_g": 100.0,
                    "serving_description": "1 bowl (~100g)",
                    "serving_quantity": 1.0,
                    "serving_unit": "bowl",
                    "confidence": "high",
                    "assumptions": ["Visual estimate: fresh raw cucumber, tomato, carrot slices without dressing"],
                    "uncertainty": "Presence of added salt or chaat masala"
                }
            ], overall_unc
        else:
            # Standard Lunch / Dinner Thali
            return [
                {
                    "name": "Chapati",
                    "aliases": ["roti", "phulka"],
                    "category": "flatbread",
                    "preparation": "cooked",
                    "estimated_weight_g": 70.0,
                    "serving_description": "2 medium chapatis (~70g)",
                    "serving_quantity": 2.0,
                    "serving_unit": "piece",
                    "confidence": "high",
                    "assumptions": ["Visual estimate: 2 medium whole-wheat flatbreads without excess ghee"],
                    "uncertainty": "Surface ghee or oil brushing level"
                },
                {
                    "name": "Yellow Dal",
                    "aliases": ["dal tadka", "toor dal"],
                    "category": "lentil",
                    "preparation": "cooked",
                    "estimated_weight_g": 150.0,
                    "serving_description": "1 standard bowl / katori (~150g)",
                    "serving_quantity": 1.0,
                    "serving_unit": "bowl",
                    "confidence": "medium",
                    "assumptions": ["Visual estimate: 1 bowl cooked yellow lentil soup with light tempering"],
                    "uncertainty": "Tarka ghee quantity and dal thickness"
                }
            ], overall_unc

    @classmethod
    def match_food_in_supabase_catalog(
        cls,
        client: Any,
        food_name: str,
        aliases: Optional[List[str]] = None,
        preparation: Optional[str] = None
    ) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
        """
        Connects detected food to FitMe food_catalog and nutrition_profiles in Supabase.
        Matches:
        1. Canonical food names (exact normalized or ILIKE)
        2. Aliases (in food_catalog.aliases JSONB / list or input aliases)
        3. Preparation methods (matching detected preparation or standard/cooked fallback)
        4. Nutrition basis (per_100g or per_serving)
        Returns: (food_catalog_record, nutrition_profile_record) or None
        """
        if not client or not food_name:
            return None

        # Clean and normalize search terms
        clean_name = re.sub(r"[^a-zA-Z0-9\s]", " ", food_name.lower()).strip()
        norm_name = re.sub(r"\s+", " ", clean_name)
        if not norm_name:
            return None

        # Strip common preparation and filler words to extract core food term
        prep_stop_words = {
            "cooked", "steamed", "roasted", "shallow_fried", "deep_fried", "fried",
            "boiled", "baked", "raw", "fresh", "crispy", "homemade", "curry",
            "bowl", "plate", "piece", "cup"
        }
        tokens = [t for t in norm_name.split() if t not in prep_stop_words]
        core_term = " ".join(tokens).strip() or norm_name

        candidates: List[Dict[str, Any]] = []

        try:
            filters = [
                f"normalized_name.eq.{norm_name}",
                f"canonical_name.ilike.%{food_name}%"
            ]
            if core_term and core_term != norm_name:
                filters.append(f"normalized_name.eq.{core_term}")
                filters.append(f"canonical_name.ilike.%{core_term}%")

            if aliases:
                for a in aliases[:3]:
                    clean_a = re.sub(r"[^a-zA-Z0-9\s]", " ", a.lower()).strip()
                    if clean_a and clean_a != norm_name:
                        filters.append(f"normalized_name.eq.{clean_a}")
                        filters.append(f"canonical_name.ilike.%{clean_a}%")

            filter_clause = ",".join(filters)
            res = (
                client.table("food_catalog")
                .select("id, canonical_name, normalized_name, aliases, category, food_state, is_active, nutrition_profiles(*)")
                .eq("is_active", True)
                .or_(filter_clause)
                .limit(10)
                .execute()
            )
            if res.data:
                candidates = res.data
        except Exception as e:
            logger.debug(f"Supabase food_catalog search: {e}")

        if not candidates:
            return None

        # Rank candidates based on canonical and alias matching
        best_food = None
        best_score = -1.0

        for food_row in candidates:
            score = 0.0
            row_norm = str(food_row.get("normalized_name") or "").strip().lower()
            row_canon = str(food_row.get("canonical_name") or "").strip().lower()
            row_aliases = [str(a).strip().lower() for a in (food_row.get("aliases") or [])]

            # 1. Exact normalized name
            if row_norm == norm_name:
                score += 100.0
            elif row_norm == core_term:
                score += 85.0
            elif row_canon == food_name.lower():
                score += 90.0

            # 2. Alias matching
            if norm_name in row_aliases or core_term in row_aliases:
                score += 80.0
            if aliases:
                for a in aliases:
                    clean_a = a.strip().lower()
                    if clean_a and (clean_a == row_norm or clean_a in row_aliases):
                        score += 75.0
                        break

            # 3. Substring / Token overlap
            if core_term in row_canon or row_canon in core_term:
                score += 50.0

            if score > best_score:
                best_score = score
                best_food = food_row

        if not best_food or best_score <= 0.0:
            return None

        # Select compatible nutrition_profile for best_food
        profiles = best_food.get("nutrition_profiles") or []
        if not profiles:
            return None

        detected_prep = (preparation or "cooked").lower().replace("-", "_").strip()
        best_profile = None

        # Preference 1: Exact match on preparation_method
        for p in profiles:
            p_prep = str(p.get("preparation_method") or "").lower().replace("-", "_").strip()
            if p_prep == detected_prep:
                best_profile = p
                break

        # Preference 2: Substring preparation match (e.g. 'fried' in 'shallow_fried')
        if not best_profile and detected_prep not in ("standard", "cooked"):
            for p in profiles:
                p_prep = str(p.get("preparation_method") or "").lower().replace("-", "_").strip()
                if detected_prep in p_prep or p_prep in detected_prep:
                    best_profile = p
                    break

        # Preference 3: Standard or cooked profile
        if not best_profile:
            for p in profiles:
                p_prep = str(p.get("preparation_method") or "").lower().strip()
                if p_prep in ("standard", "cooked"):
                    best_profile = p
                    break

        # Preference 4: First verified or available profile
        if not best_profile:
            for p in profiles:
                if p.get("validation_status") == "verified":
                    best_profile = p
                    break
            if not best_profile and profiles:
                best_profile = profiles[0]

        if not best_profile:
            return None

        return best_food, best_profile

    @classmethod
    def calculate_detected_item_nutrition(
        cls,
        item: Dict[str, Any],
        client: Optional[Any] = None
    ) -> DetectedFoodItem:
        """
        Maps a detected food item to canonical nutrition profiles in Supabase or local catalog.
        Calculates exact calories, protein, carbs, fat, fiber in Python per 100g or per serving.
        """
        raw_name = str(item.get("name", "Unknown Food")).strip()
        lower_name = raw_name.lower()
        weight_g = max(10.0, float(item.get("estimated_weight_g", 100.0)))
        qty = max(0.1, float(item.get("serving_quantity", 1.0)))
        unit = str(item.get("serving_unit", "serving")).strip()
        prep = str(item.get("preparation", "cooked")).strip().lower()
        aliases = item.get("aliases") or []

        food_id = None
        profile_id = None
        canonical_name = item.get("canonical_name", raw_name.title())
        category = item.get("category", "general")
        nutrition_source = "clinical_heuristic"
        assumptions = item.get("assumptions") or []
        uncertainty = item.get("uncertainty")

        # 1. First, search Supabase food_catalog & nutrition_profiles directly
        supabase_match = cls.match_food_in_supabase_catalog(
            client=client,
            food_name=raw_name,
            aliases=aliases,
            preparation=prep
        ) if client else None

        if supabase_match:
            food_row, prof_row = supabase_match
            food_id = str(food_row["id"])
            profile_id = str(prof_row["id"])
            canonical_name = food_row.get("canonical_name", canonical_name)
            category = food_row.get("category", category)
            nutrition_source = prof_row.get("source_type") or "nutrition_profile"

            # Basis calculation in Python
            basis_g = float(prof_row.get("basis_weight_g") or 100.0)
            if basis_g <= 0:
                basis_g = 100.0
            factor = weight_g / basis_g

            cals = round(float(prof_row.get("energy_kcal") or 0.0) * factor, 1)
            p = round(float(prof_row.get("protein_g") or 0.0) * factor, 1)
            c = round(float(prof_row.get("carb_g") or 0.0) * factor, 1)
            f = round(float(prof_row.get("fat_g") or 0.0) * factor, 1)
            fiber = round(float(prof_row.get("fiber_g")) * factor, 1) if prof_row.get("fiber_g") is not None else None

            # Atwater sanity check
            atwater = (4.0 * p) + (4.0 * c) + (9.0 * f)
            if cals == 0.0 and atwater > 0:
                cals = round(atwater, 1)

            matched_prep = prof_row.get("preparation_method", prep)
            assumptions = [
                f"Visual portion estimate: {int(weight_g)}g ({qty} {unit})",
                f"Matched catalog profile for '{canonical_name}' ({matched_prep}, basis: {prof_row.get('nutrition_basis', 'per_100g')})"
            ]

        else:
            # 2. Check local in-memory catalog from NutritionEngine
            candidates = nutrition_engine.search_candidates(raw_name, limit=3)
            if candidates and candidates[0].food_id and candidates[0].profile_id:
                top = candidates[0]
                food_id = top.food_id
                profile_id = top.profile_id
                canonical_name = top.name
                factor = weight_g / 100.0
                cals = round(top.energy_kcal_per_100g * factor, 1)
                p = round((top.protein_g_per_100g or 0.0) * factor, 1)
                c = round((top.carbohydrates_g_per_100g or 0.0) * factor, 1)
                f = round((top.fat_g_per_100g or 0.0) * factor, 1)
                fiber = round((top.fiber_g_per_100g or 0.0) * factor, 1) if top.fiber_g_per_100g is not None else None

                atwater = (4.0 * p) + (4.0 * c) + (9.0 * f)
                if cals == 0.0 and atwater > 0:
                    cals = round(atwater, 1)

                nutrition_source = "nutrition_profile"
                assumptions = [
                    f"Visual portion estimate: {int(weight_g)}g ({qty} {unit})",
                    f"Matched local catalog profile for '{canonical_name}'"
                ]

            else:
                # 3. Fallback to calibrated visual defaults or clinical baseline
                matched_key = None
                for key in VISUAL_FOOD_DEFAULTS:
                    if key in lower_name:
                        matched_key = key
                        break

                if matched_key:
                    ref = VISUAL_FOOD_DEFAULTS[matched_key]
                    factor = weight_g / 100.0
                    cals = round(ref["cals_per_100g"] * factor, 1)
                    p = round(ref["p"] * factor, 1)
                    c = round(ref["c"] * factor, 1)
                    f = round(ref["f"] * factor, 1)
                    fiber = None
                    nutrition_source = "clinical_heuristic"
                else:
                    heuristic_res = clinical_heuristic_estimate(raw_name, qty, unit)
                    factor = weight_g / (heuristic_res.serving_weight_g or 100.0)
                    cals = round(heuristic_res.total_calories * factor, 1)
                    p = round((heuristic_res.protein_g or 0.0) * factor, 1)
                    c = round((heuristic_res.carbohydrates_g or 0.0) * factor, 1)
                    f = round((heuristic_res.fat_g or 0.0) * factor, 1)
                    fiber = round((heuristic_res.fiber_g or 0.0) * factor, 1) if heuristic_res.fiber_g is not None else None
                    nutrition_source = heuristic_res.nutrition_source

                assumptions = [
                    f"Visual portion estimate: {int(weight_g)}g ({qty} {unit})",
                    f"Clinical reference baseline for '{raw_name}' ({prep})"
                ]
                if not uncertainty:
                    uncertainty = "Clinical heuristic: uncataloged dish estimated from culinary baseline."

        item_id = str(uuid.uuid4())[:8]
        clarification = item.get("clarification_needed")
        if not clarification and (item.get("confidence") == "low" or uncertainty):
            clarification = f"Please confirm portion or preparation: {uncertainty or 'visual estimate'}"

        return DetectedFoodItem(
            id=item_id,
            name=raw_name,
            canonical_name=canonical_name,
            aliases=aliases,
            category=category,
            preparation=prep,
            estimated_weight_g=round(weight_g, 1),
            serving_description=item.get("serving_description", f"{qty} {unit} (~{int(weight_g)}g)"),
            serving_quantity=qty,
            serving_unit=unit,
            confidence=item.get("confidence", "medium"),
            assumptions=assumptions,
            uncertainty=uncertainty,
            clarification_needed=clarification,
            estimated_calories=cals,
            protein_g=p,
            carbohydrates_g=c,
            fat_g=f,
            fiber_g=fiber,
            nutrition_source=nutrition_source,
            food_id=food_id,
            profile_id=profile_id,
        )

    @classmethod
    async def match_and_calculate_item_nutrition(
        cls,
        item: Dict[str, Any],
        client: Optional[Any] = None
    ) -> DetectedFoodItem:
        """
        Asynchronously connects detected food to Supabase catalog and nutrition profiles.
        If no reliable profile exists, invokes the configured AI model with explicit assumptions.
        Calculates calories, protein, carbs, fat, fiber in Python.
        """
        raw_name = str(item.get("name", "Unknown Food")).strip()
        weight_g = max(10.0, float(item.get("estimated_weight_g", 100.0)))
        qty = max(0.1, float(item.get("serving_quantity", 1.0)))
        unit = str(item.get("serving_unit", "serving")).strip()
        prep = str(item.get("preparation", "cooked")).strip().lower()
        aliases = item.get("aliases") or []

        # 1. Search Supabase food_catalog & nutrition_profiles
        supabase_match = cls.match_food_in_supabase_catalog(
            client=client,
            food_name=raw_name,
            aliases=aliases,
            preparation=prep
        ) if client else None

        if supabase_match:
            # Found in Supabase catalog
            return cls.calculate_detected_item_nutrition(item, client=client)

        # 2. Search local indexed catalog
        candidates = nutrition_engine.search_candidates(raw_name, limit=3)
        if candidates and candidates[0].food_id and candidates[0].profile_id:
            return cls.calculate_detected_item_nutrition(item, client=client)

        # 3. No reliable profile exists in catalog: Invoke AI estimation with explicit assumptions
        try:
            ai_res = await interpret_with_ai(raw_name, qty, unit)
            scale = weight_g / (ai_res.serving_weight_g or 100.0)
            cals = round(ai_res.total_calories * scale, 1)
            p = round((ai_res.protein_g or 0.0) * scale, 1)
            c = round((ai_res.carbohydrates_g or 0.0) * scale, 1)
            f = round((ai_res.fat_g or 0.0) * scale, 1)
            fiber = round(ai_res.fiber_g * scale, 1) if ai_res.fiber_g is not None else None

            # Atwater sanity verification
            atwater = (4.0 * p) + (4.0 * c) + (9.0 * f)
            if cals == 0.0 and atwater > 0:
                cals = round(atwater, 1)

            is_gemini_active = bool(
                settings.GEMINI_API_KEY
                and not settings.GEMINI_API_KEY.startswith("your-")
                and settings.ENVIRONMENT != "test"
            )
            nutrition_src = "ai_estimation" if is_gemini_active else "clinical_heuristic"

            item_id = str(uuid.uuid4())[:8]
            uncertainty = "AI estimation: dish not found in verified food catalog; macro values are visual model estimates."

            return DetectedFoodItem(
                id=item_id,
                name=raw_name,
                canonical_name=raw_name.title(),
                aliases=aliases,
                category=item.get("category", "general"),
                preparation=prep,
                estimated_weight_g=round(weight_g, 1),
                serving_description=item.get("serving_description", f"{qty} {unit} (~{int(weight_g)}g)"),
                serving_quantity=qty,
                serving_unit=unit,
                confidence=item.get("confidence", "medium"),
                assumptions=[
                    f"Visual portion estimation: {int(weight_g)}g ({qty} {unit})",
                    f"Nutritional content estimated by vision AI (no verified catalog profile for '{raw_name}')",
                    f"Preparation assumed: {prep}"
                ],
                uncertainty=uncertainty,
                clarification_needed=item.get("clarification_needed") or "Please confirm dish name or portion if needed.",
                estimated_calories=cals,
                protein_g=p,
                carbohydrates_g=c,
                fat_g=f,
                fiber_g=fiber,
                nutrition_source=nutrition_src,
                food_id=None,
                profile_id=None,
            )
        except Exception as exc:
            logger.info(f"AI estimation error for '{raw_name}' ({exc}). Falling back to deterministic heuristic.")
            return cls.calculate_detected_item_nutrition(item, client=client)

    @classmethod
    def recalculate_item(
        cls,
        food_name: str,
        quantity: float,
        unit: str,
        preparation: Optional[str] = None,
        weight_g: Optional[float] = None,
        client: Optional[Any] = None
    ) -> RecalculateItemResponse:
        """
        Locally recalculates nutrition in Python when the user adjusts quantity, unit, or grams.
        Zero model calls required.
        """
        # Determine weight in grams
        if weight_g and weight_g > 0:
            final_weight_g = weight_g
        else:
            resolved_g, _ = resolve_serving_weight(food_name, quantity, unit)
            final_weight_g = resolved_g

        detected = cls.calculate_detected_item_nutrition({
            "name": food_name,
            "serving_quantity": quantity,
            "serving_unit": unit,
            "preparation": preparation or "cooked",
            "estimated_weight_g": final_weight_g
        }, client=client)

        return RecalculateItemResponse(
            food_name=detected.name,
            quantity=detected.serving_quantity,
            unit=detected.serving_unit,
            weight_g=detected.estimated_weight_g,
            estimated_calories=detected.estimated_calories,
            protein_g=detected.protein_g,
            carbohydrates_g=detected.carbohydrates_g,
            fat_g=detected.fat_g,
            fiber_g=detected.fiber_g,
            nutrition_source=detected.nutrition_source,
            food_id=detected.food_id,
            profile_id=detected.profile_id
        )

    @classmethod
    async def process_meal_image_scan(
        cls,
        client: Any,
        user_id: str,
        image_base64: str,
        mime_type: str = "image/jpeg",
        meal_type: MealType = "lunch",
        allow_training_consent: bool = False,
        force_refresh: bool = False
    ) -> MealImageAnalysisResponse:
        """
        Full end-to-end pipeline:
        1. Validate image & compute cryptographic SHA-256 hash.
        2. Check exact duplicate image cache (scoped strictly to user_id for isolation).
        3. Upload to storage if new.
        4. Detect foods via vision AI (or fallback), tracking real token usage.
        5. Calculate nutrition using local profiles.
        6. Persist original analysis record in food_images.
        7. Return structured editable response to user.
        """
        start_time = time.time()
        image_bytes, valid_mime, ext, image_hash = cls.validate_image_data(image_base64, mime_type)

        # 2. Check exact duplicate cache (bypassed if force_refresh is requested)
        cached_record = None
        if not force_refresh:
            cached_record = cls.check_duplicate_image_cache(client, user_id, image_hash)
        else:
            logger.info(f"Force refresh requested for user {user_id}. Bypassing image cache.")

        if cached_record:
            cached_foods_raw = cached_record.get("detected_foods_json") or []
            detected_items: List[DetectedFoodItem] = []
            for item in cached_foods_raw:
                detected_items.append(DetectedFoodItem.model_validate(item))

            cached_labels = cached_record.get("detected_labels") or [it.name for it in detected_items]
            cached_storage_path = cached_record.get("storage_path")
            cached_signed_url = None
            cached_orig = cached_record.get("original_ai_prediction_json")
            cached_meta = cached_record.get("metadata") or {}
            cached_uncertainty = cached_meta.get("overall_uncertainty")

            if client and cached_storage_path:
                try:
                    s_res = client.storage.from_(STORAGE_BUCKET).create_signed_url(
                        path=cached_storage_path,
                        expires_in=86400
                    )
                    if s_res and isinstance(s_res, dict):
                        cached_signed_url = s_res.get("signedURL") or s_res.get("signedUrl")
                    elif s_res and isinstance(s_res, str):
                        cached_signed_url = s_res
                except Exception:
                    pass

            tot_cals = round(sum(it.estimated_calories for it in detected_items), 1)
            tot_p = round(sum(it.protein_g for it in detected_items), 1)
            tot_c = round(sum(it.carbohydrates_g for it in detected_items), 1)
            tot_f = round(sum(it.fat_g for it in detected_items), 1)

            elapsed_ms = round((time.time() - start_time) * 1000, 1)

            # Record token savings in usage tracker
            token_rec = VisionUsageTracker.record_scan(
                user_id=user_id,
                image_hash=image_hash,
                is_cache_hit=True,
                latency_ms=elapsed_ms,
                model_version=cached_record.get("model_version", MODEL_VERSION),
                client=client
            )

            return MealImageAnalysisResponse(
                image_id=str(cached_record.get("id", uuid.uuid4())),
                image_hash=image_hash,
                storage_path=cached_storage_path,
                signed_image_url=cached_signed_url,
                is_cached_analysis=True,
                requires_confirmation=True,
                overall_uncertainty=cached_uncertainty,
                foods=detected_items,
                detected_labels=cached_labels,
                original_ai_prediction=cached_orig,
                total_calories=tot_cals,
                total_protein_g=tot_p,
                total_carbohydrates_g=tot_c,
                total_fat_g=tot_f,
                model_provider=cached_record.get("model_provider", MODEL_PROVIDER),
                model_version=cached_record.get("model_version", MODEL_VERSION),
                analysis_version=cached_record.get("analysis_version", ANALYSIS_VERSION),
                processing_time_ms=elapsed_ms,
                token_usage=token_rec,
                cache_hit_savings=f"Saved ~{token_rec.get('tokens_saved', 480)} tokens by reusing exact duplicate analysis."
            )

        # 3. Upload to storage
        storage_path, signed_url = cls.upload_image_to_storage(
            client=client,
            user_id=user_id,
            image_bytes=image_bytes,
            mime_type=valid_mime,
            image_hash=image_hash,
            ext=ext
        )

        # 4. Vision detection with real token tracking
        raw_detected_foods, overall_uncertainty, token_counts = await cls.analyze_plate_image(
            image_bytes=image_bytes,
            mime_type=valid_mime,
            image_hash=image_hash,
            meal_type=meal_type
        )

        # 5. Connect detected foods to Supabase food_catalog & nutrition_profiles (with AI fallback)
        detected_items = []
        for raw_food in raw_detected_foods:
            calculated = await cls.match_and_calculate_item_nutrition(raw_food, client=client)
            detected_items.append(calculated)

        detected_labels = [it.name for it in detected_items]
        tot_cals = round(sum(it.estimated_calories for it in detected_items), 1)
        tot_p = round(sum(it.protein_g for it in detected_items), 1)
        tot_c = round(sum(it.carbohydrates_g for it in detected_items), 1)
        tot_f = round(sum(it.fat_g for it in detected_items), 1)

        elapsed_ms = round((time.time() - start_time) * 1000, 1)

        # Record usage in tracker
        token_rec = VisionUsageTracker.record_scan(
            user_id=user_id,
            image_hash=image_hash,
            is_cache_hit=False,
            prompt_tokens=token_counts.get("prompt_tokens", 0),
            completion_tokens=token_counts.get("completion_tokens", 0),
            latency_ms=elapsed_ms,
            model_version=MODEL_VERSION,
            client=client
        )

        # 6. Save image metadata in PostgreSQL
        image_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        if client:
            db_record = {
                "id": image_id,
                "user_id": user_id,
                "storage_path": storage_path,
                "label": f"{meal_type.title()} Plate Scan",
                "image_hash": image_hash,
                "analysis_status": "completed",
                "detected_labels": detected_labels,
                "detected_foods_json": [it.model_dump() for it in detected_items],
                "original_ai_prediction_json": raw_detected_foods,
                "model_provider": MODEL_PROVIDER,
                "model_version": MODEL_VERSION,
                "analysis_version": ANALYSIS_VERSION,
                "user_confirmed": False,
                "allow_training_consent": allow_training_consent,
                "token_usage_json": token_rec,
                "metadata": {
                    "meal_type": meal_type,
                    "raw_count": len(detected_items),
                    "overall_uncertainty": overall_uncertainty
                },
                "created_at": now_iso,
                "updated_at": now_iso
            }
            try:
                client.table("food_images").insert(db_record).execute()
            except Exception as e:
                logger.warning(f"Could not persist full food_images record ({e}). Retrying with base fields...")
                try:
                    # Resilient fallback if some optional columns are missing
                    base_record = {
                        "id": image_id,
                        "user_id": user_id,
                        "storage_path": storage_path,
                        "label": f"{meal_type.title()} Plate Scan",
                        "image_hash": image_hash,
                        "analysis_status": "completed",
                        "model_version": MODEL_VERSION,
                        "token_usage_json": token_rec,
                        "created_at": now_iso
                    }
                    client.table("food_images").insert(base_record).execute()
                except Exception as e2:
                    logger.warning(f"Fallback food_images insert also failed ({e2}).")

        return MealImageAnalysisResponse(
            image_id=image_id,
            image_hash=image_hash,
            storage_path=storage_path,
            signed_image_url=signed_url,
            is_cached_analysis=False,
            requires_confirmation=True,
            overall_uncertainty=overall_uncertainty,
            foods=detected_items,
            detected_labels=detected_labels,
            original_ai_prediction=raw_detected_foods,
            total_calories=tot_cals,
            total_protein_g=tot_p,
            total_carbohydrates_g=tot_c,
            total_fat_g=tot_f,
            model_provider=MODEL_PROVIDER,
            model_version=MODEL_VERSION,
            analysis_version=ANALYSIS_VERSION,
            processing_time_ms=elapsed_ms,
            token_usage=token_rec
        )

    @classmethod
    def record_scan_confirmation_and_feedback(
        cls,
        client: Any,
        user_id: str,
        image_id: str,
        confirmed_items: List[ConfirmedFoodItem],
        deleted_items: List[str] = [],
        allow_training_consent: bool = False
    ) -> bool:
        """
        Records the confirmed meal and supervised feedback:
        - Updates food_images table (user_confirmed = True).
        - Saves original predictions vs user corrections into plate_scan_feedback table.
        - Updates portion learning heuristics.
        """
        if not client or not user_id:
            return False

        try:
            # 1. Fetch original prediction
            orig_data = []
            img_res = client.table("food_images").select("detected_foods_json").eq("id", image_id).execute()
            if img_res.data and len(img_res.data) > 0:
                orig_data = img_res.data[0].get("detected_foods_json") or []

            # 2. Compute disaggregated feedback components via DiffEngine
            diff_result = FeedbackDiffEngine.compute_feedback_disaggregation(
                original_prediction=orig_data,
                confirmed_items=confirmed_items,
                deleted_items=deleted_items
            )

            # 3. Update food_images status and consent
            client.table("food_images").update({
                "user_confirmed": True,
                "allow_training_consent": allow_training_consent,
                "training_eligible": allow_training_consent,
                "correction_details_json": {
                    "confirmed_count": len(confirmed_items),
                    "deleted_items": deleted_items,
                    "edited_count": sum(1 for it in confirmed_items if it.was_edited or it.was_added),
                    "delta_metrics": diff_result["delta_metrics"]
                }
            }).eq("id", image_id).execute()

            # 4. Determine action
            has_edits = any(it.was_edited or it.was_added for it in confirmed_items) or len(deleted_items) > 0
            action = "edited" if has_edits else "confirmed"

            # 5. Insert disaggregated feedback entry
            # If consent is False, status is strictly 'consent_denied' to guarantee privacy isolation
            review_status = "approved_for_training" if allow_training_consent else "consent_denied"

            feedback_record = {
                "food_image_id": image_id,
                "user_id": user_id,
                "original_prediction": orig_data,
                "user_confirmed_data": [it.model_dump() for it in confirmed_items],
                "confirmed_food_labels": diff_result["confirmed_food_labels"],
                "portion_corrections": diff_result["portion_corrections"],
                "preparation_corrections": diff_result["preparation_corrections"],
                "label_corrections": diff_result["label_corrections"],
                "delta_metrics": diff_result["delta_metrics"],
                "action": action,
                "allow_training_consent": allow_training_consent,
                "review_status": review_status,
                "dataset_split": "unassigned",
                "model_version": MODEL_VERSION
            }
            client.table("plate_scan_feedback").insert(feedback_record).execute()

            # 5. Record portion learning for each confirmed item
            for it in confirmed_items:
                try:
                    UserPreferenceLearningEngine.record_confirmed_log(
                        client=client,
                        user_id=user_id,
                        food_name=it.food_name,
                        quantity=it.quantity,
                        serving_unit=it.unit
                    )
                except Exception:
                    pass

            return True
        except Exception as e:
            logger.warning(f"Could not record scan feedback: {e}")
            return False

    @staticmethod
    def delete_food_image(
        client: Any,
        user_id: str,
        image_id: str
    ) -> bool:
        """
        Deletes the image file from Supabase Storage and removes the record from food_images table.
        """
        if not client:
            return False

        try:
            # 1. Verify existence and ownership
            res = client.table("food_images").select("storage_path, image_hash").eq("id", image_id).eq("user_id", user_id).execute()
            if not res.data or len(res.data) == 0:
                logger.warning(f"Image {image_id} not found or does not belong to user {user_id}")
                return False

            row = res.data[0]
            storage_path = row.get("storage_path")
            image_hash = row.get("image_hash")

            if storage_path and not storage_path.startswith("inline_hash/"):
                try:
                    client.storage.from_(STORAGE_BUCKET).remove([storage_path])
                except Exception as exc:
                    logger.warning(f"Could not delete storage object: {exc}")

            if image_hash:
                try:
                    VisionUsageTracker.invalidate_cache(user_id=user_id, image_hash=image_hash, client=client)
                except Exception as inv_err:
                    logger.warning(f"Failed to invalidate cache on image deletion: {inv_err}")

            # 2. Delete database record
            client.table("food_images").delete().eq("id", image_id).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to delete food image {image_id}: {e}")
            return False

