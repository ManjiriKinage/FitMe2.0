"""Feedback Disaggregation and Differential Analytics Engine.

Compares original Vision AI predictions with user-confirmed review data to separate:
1. Original AI predictions (raw model perception).
2. Confirmed food labels (user-verified ground truth).
3. Portion corrections (gram and unit discrepancies).
4. Preparation corrections (cooking method and ingredient changes).
5. Label corrections (renamed, added false negatives, deleted false positives).
6. Performance delta metrics (Portion MAE, MAPE, Precision, Recall).
"""
import logging
import re
from typing import Dict, Any, List, Optional, Tuple
from app.schemas.meal_scan import ConfirmedFoodItem

logger = logging.getLogger(__name__)


def _normalize(name: str) -> str:
    """Standardizes string for comparison."""
    if not name:
        return ""
    clean = re.sub(r"[^a-zA-Z0-9\s]", " ", name.lower()).strip()
    return re.sub(r"\s+", " ", clean)


class FeedbackDiffEngine:
    """Disaggregates plate scan confirmation into structured, auditable feedback components."""

    @classmethod
    def compute_feedback_disaggregation(
        cls,
        original_prediction: List[Dict[str, Any]],
        confirmed_items: List[ConfirmedFoodItem],
        deleted_items: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Takes raw AI predictions and user confirmations, computes disaggregated components
        and evaluation deltas without mutating original user inputs.
        """
        deleted_items = deleted_items or []
        normalized_deleted = {_normalize(d) for d in deleted_items if d}

        # 1. Normalize confirmed food labels
        confirmed_food_labels: List[Dict[str, Any]] = []
        for item in confirmed_items:
            confirmed_food_labels.append({
                "food_name": item.food_name,
                "quantity": float(item.quantity),
                "unit": item.unit,
                "weight_g": float(item.estimated_weight_g or 0.0),
                "preparation": item.preparation or "cooked",
                "estimated_calories": float(item.estimated_calories or 0.0),
                "protein_g": float(item.protein_g or 0.0),
                "carbohydrates_g": float(item.carbohydrates_g or 0.0),
                "fat_g": float(item.fat_g or 0.0),
                "food_id": item.food_id,
                "profile_id": item.profile_id,
                "was_edited": bool(item.was_edited),
                "was_added": bool(item.was_added),
            })

        # 2. Match original predictions with confirmed items
        matched_pairs: List[Tuple[Dict[str, Any], ConfirmedFoodItem]] = []
        unmatched_confirmed: List[ConfirmedFoodItem] = []
        unmatched_original: List[Dict[str, Any]] = []

        used_orig_indices = set()
        for conf_item in confirmed_items:
            norm_conf = _normalize(conf_item.food_name)
            best_orig_idx = None
            best_score = 0

            for idx, orig in enumerate(original_prediction):
                if idx in used_orig_indices:
                    continue
                orig_name = orig.get("name") or orig.get("food_name") or ""
                norm_orig = _normalize(orig_name)

                # Exact match
                if norm_conf == norm_orig:
                    best_orig_idx = idx
                    best_score = 1.0
                    break
                # Substring match
                elif norm_conf in norm_orig or norm_orig in norm_conf:
                    if best_score < 0.8:
                        best_orig_idx = idx
                        best_score = 0.8

            if best_orig_idx is not None and best_score >= 0.8:
                used_orig_indices.add(best_orig_idx)
                matched_pairs.append((original_prediction[best_orig_idx], conf_item))
            else:
                unmatched_confirmed.append(conf_item)

        for idx, orig in enumerate(original_prediction):
            if idx not in used_orig_indices:
                unmatched_original.append(orig)

        # 3. Disaggregate Portion Corrections
        portion_corrections: List[Dict[str, Any]] = []
        abs_portion_errors: List[float] = []
        pct_portion_errors: List[float] = []

        for orig, conf in matched_pairs:
            orig_name = orig.get("name") or orig.get("food_name") or ""
            orig_weight = float(orig.get("estimated_weight_g") or 0.0)
            conf_weight = float(conf.estimated_weight_g or 0.0)

            delta_g = round(conf_weight - orig_weight, 2)
            pct_change = round(((conf_weight - orig_weight) / orig_weight) * 100.0, 2) if orig_weight > 0 else 0.0
            was_adjusted = abs(delta_g) > 2.0 or conf.was_edited

            portion_corrections.append({
                "food_name": conf.food_name,
                "original_detected_name": orig_name,
                "original_weight_g": orig_weight,
                "confirmed_weight_g": conf_weight,
                "delta_grams": delta_g,
                "percent_change": pct_change,
                "was_portion_adjusted": was_adjusted,
            })

            if orig_weight > 0 and conf_weight > 0:
                abs_portion_errors.append(abs(conf_weight - orig_weight))
                pct_portion_errors.append(abs(conf_weight - orig_weight) / orig_weight * 100.0)

        # 4. Disaggregate Preparation Corrections
        preparation_corrections: List[Dict[str, Any]] = []
        for orig, conf in matched_pairs:
            orig_prep = (orig.get("preparation") or "cooked").strip().lower()
            conf_prep = (conf.preparation or "cooked").strip().lower()
            was_prep_adjusted = orig_prep != conf_prep

            preparation_corrections.append({
                "food_name": conf.food_name,
                "original_preparation": orig_prep,
                "confirmed_preparation": conf_prep,
                "was_preparation_adjusted": was_prep_adjusted,
            })

        # 5. Disaggregate Label Corrections (Renames, Additions, Deletions)
        renamed_items: List[Dict[str, str]] = []
        for orig, conf in matched_pairs:
            orig_name = orig.get("name") or orig.get("food_name") or ""
            if _normalize(orig_name) != _normalize(conf.food_name):
                renamed_items.append({
                    "original_name": orig_name,
                    "confirmed_name": conf.food_name,
                })

        added_items: List[str] = [
            it.food_name for it in unmatched_confirmed if it.was_added or it not in [p[1] for p in matched_pairs]
        ]
        detected_deleted: List[str] = list(deleted_items)
        for orig in unmatched_original:
            orig_name = orig.get("name") or orig.get("food_name") or ""
            if orig_name and orig_name not in detected_deleted:
                detected_deleted.append(orig_name)

        label_corrections = {
            "renamed_items": renamed_items,
            "added_items": added_items,  # False negatives (AI missed)
            "deleted_items": detected_deleted,  # False positives (AI hallucinated/misidentified)
        }

        # 6. Compute Delta Performance Metrics
        portion_mae = round(sum(abs_portion_errors) / len(abs_portion_errors), 2) if abs_portion_errors else 0.0
        portion_mape = round(sum(pct_portion_errors) / len(pct_portion_errors), 2) if pct_portion_errors else 0.0

        total_orig = len(original_prediction)
        total_conf = len(confirmed_items)
        true_positives = len(matched_pairs)

        precision = round(true_positives / total_orig, 3) if total_orig > 0 else 1.0
        recall = round(true_positives / total_conf, 3) if total_conf > 0 else 1.0

        has_any_corrections = (
            len(added_items) > 0 or
            len(detected_deleted) > 0 or
            len(renamed_items) > 0 or
            any(p["was_portion_adjusted"] for p in portion_corrections) or
            any(pr["was_preparation_adjusted"] for pr in preparation_corrections)
        )

        delta_metrics = {
            "portion_mae_grams": portion_mae,
            "portion_mape_percent": portion_mape,
            "label_precision": precision,
            "label_recall": recall,
            "original_items_count": total_orig,
            "confirmed_items_count": total_conf,
            "matched_items_count": true_positives,
            "added_items_count": len(added_items),
            "deleted_items_count": len(detected_deleted),
            "renamed_items_count": len(renamed_items),
            "has_corrections": has_any_corrections,
        }

        return {
            "confirmed_food_labels": confirmed_food_labels,
            "portion_corrections": portion_corrections,
            "preparation_corrections": preparation_corrections,
            "label_corrections": label_corrections,
            "delta_metrics": delta_metrics,
        }

