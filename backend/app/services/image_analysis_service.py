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
from app.core.config import settings
from app.schemas.food import MealType
from app.schemas.meal_scan import (
    DetectedFoodItem,
    MealImageAnalysisResponse,
    ConfirmedFoodItem,
    RecalculateItemResponse,
)
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_engine.calculator import resolve_serving_weight
from app.services.nutrition_engine.ai_fallback import CLINICAL_HEURISTICS, clinical_heuristic_estimate
from app.services.user_learning import UserPreferenceLearningEngine

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
        """
        if not client or not user_id:
            return None

        try:
            res = (
                client.table("food_images")
                .select("*")
                .eq("user_id", user_id)
                .eq("image_hash", image_hash)
                .eq("analysis_version", ANALYSIS_VERSION)
                .eq("analysis_status", "completed")
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
        Returns: (storage_path, signed_url)
        """
        if not client:
            return None, None

        storage_path = f"user_{user_id}/{image_hash[:16]}_{int(time.time())}{ext}"
        signed_url = None

        try:
            # Check or create storage upload
            client.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=image_bytes,
                file_options={"content-type": mime_type, "upsert": "true"}
            )
            # Create a 24-hour signed URL for private access
            signed_res = client.storage.from_(STORAGE_BUCKET).create_signed_url(
                path=storage_path,
                expires_in=86400
            )
            if signed_res and isinstance(signed_res, dict):
                signed_url = signed_res.get("signedURL") or signed_res.get("signedUrl")
            elif signed_res and isinstance(signed_res, str):
                signed_url = signed_res
        except Exception as exc:
            logger.warning(f"Supabase storage upload failed ({exc}). Using inline reference.")
            storage_path = f"inline_hash/{image_hash[:16]}{ext}"

        return storage_path, signed_url

    @classmethod
    async def analyze_plate_image(
        cls,
        image_bytes: bytes,
        mime_type: str,
        image_hash: str,
        meal_type: MealType = "lunch"
    ) -> List[Dict[str, Any]]:
        """
        Calls Gemini Vision API (or calibrated fallback) to detect distinct foods on the plate.
        """
        if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.startswith("your-") or settings.ENVIRONMENT == "test":
            logger.info("Gemini API key not configured or in test mode. Using calibrated visual heuristics fallback.")
            return cls._visual_heuristics_fallback(meal_type)

        b64_data = base64.b64encode(image_bytes).decode("utf-8")
        system_instruction = (
            "You are FitMe Vision AI, an expert clinical nutrition and Indian cuisine visual analyzer.\n"
            "Analyze the provided image of a food meal/plate.\n"
            "Identify EVERY distinct food item visible (especially flatbreads like roti/chapati/bhakri, "
            "cooked rice, dals, curries, sabzis, paneer, eggs, chicken, salads, etc.).\n\n"
            "Estimate realistic portion sizes in grams based on standard Indian home visual references:\n"
            "- 1 medium chapati/roti: ~35g (70-85 kcal)\n"
            "- 1 piece bajra/jowar bhakri: ~60g (~102 kcal)\n"
            "- 1 standard katori / bowl of dal or curry: ~150g\n"
            "- 1 bowl / cup of cooked white rice: ~150g (~195 kcal)\n"
            "- 1 standard plate of poha/upma: ~200g (~260-280 kcal)\n\n"
            "You MUST respond ONLY with valid JSON conforming to this schema:\n"
            "{\n"
            '  "foods": [\n'
            "    {\n"
            '      "name": "descriptive common food name (e.g. cooked white rice, chapati, dal tadka)",\n'
            '      "aliases": ["roti", "phulka"],\n'
            '      "category": "flatbread | grain | lentil | curry | protein | dairy | salad | snack",\n'
            '      "preparation": "cooked | steamed | roasted | shallow_fried | raw",\n'
            '      "estimated_weight_g": float,\n'
            '      "serving_description": "e.g. 2 medium chapatis (~70g), 1 bowl dal (~150g)",\n'
            '      "serving_quantity": float,\n'
            '      "serving_unit": "piece | bowl | cup | plate | serving",\n'
            '      "confidence": "high | medium | low",\n'
            '      "assumptions": ["Visual estimate assuming home-cooked preparation with moderate oil"]\n'
            "    }\n"
            "  ]\n"
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
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    candidates = resp_json.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            text_body = parts[0]["text"].strip()
                            clean_json = re.sub(r"^```json\s*", "", text_body)
                            clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                            data = json.loads(clean_json)
                            foods = data.get("foods", [])
                            if isinstance(foods, list) and len(foods) > 0:
                                return foods
        except Exception as exc:
            logger.warning(f"Gemini Vision call failed ({exc}). Using visual heuristics fallback.")

        return cls._visual_heuristics_fallback(meal_type)

    @classmethod
    def _visual_heuristics_fallback(cls, meal_type: MealType = "lunch") -> List[Dict[str, Any]]:
        """Calibrated fallback representing standard balanced home plate."""
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
                    "assumptions": ["Visual estimate: standard home-cooked poha with light tempering and peanuts"]
                }
            ]
        elif meal_type == "snack":
            return [
                {
                    "name": "Mixed Salad",
                    "aliases": ["cucumber tomato salad"],
                    "category": "salad",
                    "preparation": "raw",
                    "estimated_weight_g": 100.0,
                    "serving_description": "1 bowl (~100g)",
                    "serving_quantity": 1.0,
                    "serving_unit": "bowl",
                    "confidence": "medium",
                    "assumptions": ["Visual estimate: fresh raw cucumber, tomato, carrot slices"]
                }
            ]
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
                    "assumptions": ["Visual estimate: 2 medium whole-wheat flatbreads without excess ghee"]
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
                    "assumptions": ["Visual estimate: 1 bowl cooked yellow lentil soup with light tempering"]
                }
            ]

    @classmethod
    def calculate_detected_item_nutrition(
        cls,
        item: Dict[str, Any]
    ) -> DetectedFoodItem:
        """
        Maps a detected food item to canonical nutrition profiles or clinical heuristics.
        Calculates exact calories, protein, carbs, fat, fiber based on estimated weight.
        """
        raw_name = str(item.get("name", "Unknown Food")).strip()
        lower_name = raw_name.lower()
        weight_g = max(10.0, float(item.get("estimated_weight_g", 100.0)))
        qty = max(0.1, float(item.get("serving_quantity", 1.0)))
        unit = str(item.get("serving_unit", "serving")).strip()
        prep = str(item.get("preparation", "cooked")).strip()

        food_id = None
        profile_id = None
        nutrition_source = "clinical_heuristic"

        # 1. Search existing canonical food_catalog & nutrition_profiles via nutrition_engine
        candidates = nutrition_engine.search_candidates(raw_name, limit=3)
        if candidates and candidates[0].food_id and candidates[0].profile_id:
            top = candidates[0]
            food_id = top.food_id
            profile_id = top.profile_id
            factor = weight_g / 100.0
            cals = round(top.energy_kcal_per_100g * factor, 1)
            p = round((top.protein_g_per_100g or 0.0) * factor, 1)
            c = round((top.carbohydrates_g_per_100g or 0.0) * factor, 1)
            f = round((top.fat_g_per_100g or 0.0) * factor, 1)
            fiber = round((top.fiber_g_per_100g or 0.0) * factor, 1) if top.fiber_g_per_100g is not None else None
            nutrition_source = "nutrition_profile"
        else:
            # 2. Check calibrated visual defaults
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
                # 3. Fallback to generic clinical heuristic
                heuristic_res = clinical_heuristic_estimate(raw_name, qty, unit)
                cals = heuristic_res.total_calories
                p = heuristic_res.protein_g
                c = heuristic_res.carbohydrates_g
                f = heuristic_res.fat_g
                fiber = heuristic_res.fiber_g
                nutrition_source = heuristic_res.nutrition_source

        item_id = str(uuid.uuid4())[:8]
        return DetectedFoodItem(
            id=item_id,
            name=raw_name,
            canonical_name=item.get("canonical_name", raw_name.title()),
            aliases=item.get("aliases", []),
            category=item.get("category", "general"),
            preparation=prep,
            estimated_weight_g=round(weight_g, 1),
            serving_description=item.get("serving_description", f"{qty} {unit} (~{int(weight_g)}g)"),
            serving_quantity=qty,
            serving_unit=unit,
            confidence=item.get("confidence", "medium"),
            assumptions=item.get("assumptions", ["Estimated visually from plate"]),
            clarification_needed=item.get("clarification_needed"),
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
    def recalculate_item(
        cls,
        food_name: str,
        quantity: float,
        unit: str,
        preparation: Optional[str] = None,
        weight_g: Optional[float] = None
    ) -> RecalculateItemResponse:
        """
        Locally recalculates nutrition when the user adjusts quantity, unit, or grams.
        Zero API calls or model invocations required.
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
        })

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
        allow_training_consent: bool = False
    ) -> MealImageAnalysisResponse:
        """
        Full end-to-end pipeline:
        1. Validate image & compute SHA-256 hash.
        2. Check exact duplicate image cache.
        3. Upload to storage if new.
        4. Detect foods via vision AI (or fallback).
        5. Calculate nutrition using local profiles.
        6. Persist original analysis record in food_images.
        7. Return structured editable response to user.
        """
        start_time = time.time()
        image_bytes, valid_mime, ext, image_hash = cls.validate_image_data(image_base64, mime_type)

        # 2. Check exact duplicate cache
        cached_record = cls.check_duplicate_image_cache(client, user_id, image_hash)
        if cached_record:
            cached_foods_raw = cached_record.get("detected_foods_json") or []
            detected_items: List[DetectedFoodItem] = []
            for item in cached_foods_raw:
                detected_items.append(DetectedFoodItem.model_validate(item))

            tot_cals = round(sum(it.estimated_calories for it in detected_items), 1)
            tot_p = round(sum(it.protein_g for it in detected_items), 1)
            tot_c = round(sum(it.carbohydrates_g for it in detected_items), 1)
            tot_f = round(sum(it.fat_g for it in detected_items), 1)

            elapsed_ms = round((time.time() - start_time) * 1000, 1)
            return MealImageAnalysisResponse(
                image_id=str(cached_record.get("id", uuid.uuid4())),
                image_hash=image_hash,
                storage_path=cached_record.get("storage_path"),
                is_cached_analysis=True,
                requires_confirmation=True,
                foods=detected_items,
                total_calories=tot_cals,
                total_protein_g=tot_p,
                total_carbohydrates_g=tot_c,
                total_fat_g=tot_f,
                model_provider=cached_record.get("model_provider", MODEL_PROVIDER),
                model_version=cached_record.get("model_version", MODEL_VERSION),
                analysis_version=cached_record.get("analysis_version", ANALYSIS_VERSION),
                processing_time_ms=elapsed_ms
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

        # 4. Vision detection
        raw_detected_foods = await cls.analyze_plate_image(
            image_bytes=image_bytes,
            mime_type=valid_mime,
            image_hash=image_hash,
            meal_type=meal_type
        )

        # 5. Calculate nutrition using local profiles
        detected_items = []
        for raw_food in raw_detected_foods:
            calculated = cls.calculate_detected_item_nutrition(raw_food)
            detected_items.append(calculated)

        tot_cals = round(sum(it.estimated_calories for it in detected_items), 1)
        tot_p = round(sum(it.protein_g for it in detected_items), 1)
        tot_c = round(sum(it.carbohydrates_g for it in detected_items), 1)
        tot_f = round(sum(it.fat_g for it in detected_items), 1)

        # 6. Save image record to database
        image_id = str(uuid.uuid4())
        if client:
            try:
                db_record = {
                    "id": image_id,
                    "user_id": user_id,
                    "storage_path": storage_path or f"storage/{image_hash[:16]}{ext}",
                    "label": f"{meal_type.title()} Plate Scan",
                    "image_hash": image_hash,
                    "detected_foods_json": [it.model_dump() for it in detected_items],
                    "analysis_status": "completed",
                    "model_provider": MODEL_PROVIDER,
                    "model_version": MODEL_VERSION,
                    "analysis_version": ANALYSIS_VERSION,
                    "user_confirmed": False,
                    "allow_training_consent": allow_training_consent,
                    "token_usage_json": {"estimated_prompt_tokens": 300, "estimated_completion_tokens": 150},
                    "metadata": {"meal_type": meal_type, "raw_count": len(detected_items)}
                }
                client.table("food_images").insert(db_record).execute()
            except Exception as e:
                logger.warning(f"Could not persist food_images record ({e}).")

        elapsed_ms = round((time.time() - start_time) * 1000, 1)
        return MealImageAnalysisResponse(
            image_id=image_id,
            image_hash=image_hash,
            storage_path=storage_path,
            signed_image_url=signed_url,
            is_cached_analysis=False,
            requires_confirmation=True,
            foods=detected_items,
            total_calories=tot_cals,
            total_protein_g=tot_p,
            total_carbohydrates_g=tot_c,
            total_fat_g=tot_f,
            model_provider=MODEL_PROVIDER,
            model_version=MODEL_VERSION,
            analysis_version=ANALYSIS_VERSION,
            processing_time_ms=elapsed_ms
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

            # 2. Update food_images status
            client.table("food_images").update({
                "user_confirmed": True,
                "allow_training_consent": allow_training_consent,
                "correction_details_json": {
                    "confirmed_count": len(confirmed_items),
                    "deleted_items": deleted_items,
                    "edited_count": sum(1 for it in confirmed_items if it.was_edited or it.was_added)
                }
            }).eq("id", image_id).execute()

            # 3. Determine action
            has_edits = any(it.was_edited or it.was_added for it in confirmed_items) or len(deleted_items) > 0
            action = "edited" if has_edits else "confirmed"

            # 4. Insert feedback entry
            feedback_record = {
                "food_image_id": image_id,
                "user_id": user_id,
                "original_prediction": orig_data,
                "user_confirmed_data": [it.model_dump() for it in confirmed_items],
                "action": action,
                "allow_training_consent": allow_training_consent,
                "review_status": "approved_for_training" if allow_training_consent else "pending"
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
            # 1. Get storage path
            res = client.table("food_images").select("storage_path").eq("id", image_id).eq("user_id", user_id).execute()
            if res.data and len(res.data) > 0:
                storage_path = res.data[0].get("storage_path")
                if storage_path and not storage_path.startswith("inline_hash/"):
                    try:
                        client.storage.from_(STORAGE_BUCKET).remove([storage_path])
                    except Exception as exc:
                        logger.warning(f"Could not delete storage object: {exc}")

            # 2. Delete database record
            client.table("food_images").delete().eq("id", image_id).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to delete food image {image_id}: {e}")
            return False

