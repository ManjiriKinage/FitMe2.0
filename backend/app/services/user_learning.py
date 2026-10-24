"""User Food History and Preference Learning System.

Implements:
1. Transparent observation counter and running serving-size statistics.
2. User-specific preferred portion recall (e.g. chapati count, bowl size).
3. Candidate preference updates requiring minimum confirmation thresholds (>= 2).
4. Strict isolation: personal preferences never mutate official 100g nutrition catalog.
5. Multi-tenant privacy: one user's preferences never bleed into another user's session.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import math

logger = logging.getLogger(__name__)

# Minimum confirmations before an observation is treated as a solid default
CONFIRMATION_THRESHOLD = 2

class UserPreferenceLearningEngine:
    """Manages transparent, user-specific food portion and preference learning."""

    @staticmethod
    def normalize_food_key(food_name: str) -> str:
        import re
        s = food_name.lower().strip()
        s = re.sub(r"[^\w\s]", "", s)
        return re.sub(r"\s+", "_", s)

    @classmethod
    def record_confirmed_log(
        cls,
        client,
        user_id: str,
        food_name: str,
        quantity: float,
        serving_unit: str,
        serving_weight_g: Optional[float] = None,
        recipe_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Records or updates a user's food preference after a confirmed log.
        Computes robust running average of confirmed portions.
        """
        if not client or not user_id or not food_name:
            return None

        food_key = cls.normalize_food_key(food_name)
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            # Check existing preference
            existing_res = (
                client.table("user_food_preferences")
                .select("*")
                .eq("user_id", user_id)
                .eq("food_key", food_key)
                .execute()
            )

            if existing_res.data and len(existing_res.data) > 0:
                pref = existing_res.data[0]
                obs = int(pref.get("confirmed_observations", 1)) + 1
                prev_qty = float(pref.get("preferred_serving_quantity", 1.0))
                # Running average calculation
                new_qty = round(((prev_qty * (obs - 1)) + quantity) / obs, 2)

                update_data = {
                    "preferred_serving_quantity": new_qty,
                    "preferred_serving_unit": serving_unit,
                    "confirmed_observations": obs,
                    "last_confirmed_at": now_iso,
                    "updated_at": now_iso
                }
                if recipe_id:
                    update_data["preferred_recipe_id"] = recipe_id
                if serving_weight_g:
                    update_data["preferred_serving_weight_g"] = serving_weight_g

                res = (
                    client.table("user_food_preferences")
                    .update(update_data)
                    .eq("id", pref["id"])
                    .execute()
                )
                return res.data[0] if res.data else None
            else:
                # Insert initial observation
                insert_data = {
                    "user_id": user_id,
                    "food_key": food_key,
                    "preferred_recipe_id": recipe_id,
                    "preferred_serving_quantity": quantity,
                    "preferred_serving_unit": serving_unit,
                    "preferred_serving_weight_g": serving_weight_g,
                    "confirmed_observations": 1,
                    "last_confirmed_at": now_iso,
                    "created_at": now_iso,
                    "updated_at": now_iso
                }
                res = client.table("user_food_preferences").insert(insert_data).execute()
                return res.data[0] if res.data else None

        except Exception as e:
            logger.warning(f"Could not record user preference: {e}")
            return None

    @classmethod
    def get_user_preference(
        cls,
        client,
        user_id: str,
        food_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieves a user's learned preference for a food item if confirmed >= threshold.
        """
        if not client or not user_id or not food_name:
            return None

        food_key = cls.normalize_food_key(food_name)
        try:
            res = (
                client.table("user_food_preferences")
                .select("*")
                .eq("user_id", user_id)
                .eq("food_key", food_key)
                .execute()
            )
            if res.data and len(res.data) > 0:
                pref = res.data[0]
                if int(pref.get("confirmed_observations", 0)) >= CONFIRMATION_THRESHOLD:
                    return pref
            return None
        except Exception as e:
            logger.warning(f"Could not retrieve user preference: {e}")
            return None

    @classmethod
    def record_feedback_correction(
        cls,
        client,
        user_id: str,
        food_log_id: Optional[str],
        original_estimate: Dict[str, Any],
        corrected_value: Dict[str, Any],
        reason: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Stores user feedback/corrections separately from catalog reference data.
        """
        if not client or not user_id:
            return None

        try:
            record = {
                "user_id": user_id,
                "food_log_id": food_log_id,
                "feedback_type": "portion_or_macro_correction",
                "original_estimate": original_estimate,
                "corrected_value": corrected_value,
                "correction_reason": reason,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            res = client.table("user_food_feedback").insert(record).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Could not record user feedback: {e}")
            return None
