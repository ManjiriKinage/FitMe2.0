"""Core Nutrition Engine Facade.

Integrates:
- Catalog loading & search across 1,014 official INDB dishes
- Multi-item sentence parsing ("I ate 2 chapatis and 1 bowl of dal")
- Deterministic per-100g scaling and dish-specific serving weights
- Material ambiguity detection and concise user clarification
- Bounded AI interpretation fallback
- Transparent internal provenance and user-preference learning
"""
import os
import re
import json
import logging
import pandas as pd
from typing import Dict, Any, List, Optional

from app.services.nutrition_engine.models import (
    CandidateMatch,
    ItemNutritionResult,
    MultiItemEstimateResponse,
)
from app.services.nutrition_engine.calculator import (
    resolve_serving_weight,
    round_or_none,
)
from app.services.nutrition_engine.matcher import (
    normalize_text,
    split_multi_item_description,
    parse_item_portion,
    detect_material_ambiguity,
)
from app.services.nutrition_engine.ai_fallback import interpret_with_ai

logger = logging.getLogger(__name__)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data_pipeline", "data"))
RECIPES_CSV = os.path.join(DATA_DIR, "recipes.csv")
UNITS_CSV = os.path.join(DATA_DIR, "unit_conversions.csv")


class NutritionEngine:
    def __init__(self, recipes_path: str = RECIPES_CSV, units_path: str = UNITS_CSV):
        self.recipes_path = recipes_path
        self.units_path = units_path
        self._recipes: Dict[str, Dict[str, Any]] = {}
        self._normalized_index: Dict[str, str] = {}
        self._alias_index: Dict[str, str] = {}
        self.load_catalog()

    def load_catalog(self):
        """Loads and indexes the normalized INDB recipes catalog."""
        if not os.path.exists(self.recipes_path):
            logger.warning(f"Recipes catalog not found at {self.recipes_path}")
            return

        df = pd.read_csv(self.recipes_path)
        for _, row in df.iterrows():
            code = str(row["source_recipe_code"]).strip()
            name = str(row["name"]).strip()
            norm_name = str(row["normalized_name"]).strip()

            aliases = []
            if pd.notnull(row.get("aliases")):
                try:
                    aliases = json.loads(row["aliases"]) if isinstance(row["aliases"], str) else []
                except Exception:
                    aliases = []

            recipe_record = {
                "source_recipe_code": code,
                "name": name,
                "normalized_name": norm_name,
                "aliases": aliases,
                "reported_serving_size_g": float(row["reported_serving_size_g"]) if pd.notnull(row["reported_serving_size_g"]) else 150.0,
                "reported_servings_count": float(row["reported_servings_count"]) if pd.notnull(row["reported_servings_count"]) else 1.0,
                "reported_serving_unit": str(row["reported_serving_unit"]).strip() if pd.notnull(row["reported_serving_unit"]) else "serving",
                "reported_energy_kcal_per_100g": float(row["reported_energy_kcal_per_100g"]),
                "reported_protein_g_per_100g": float(row["reported_protein_g_per_100g"]) if pd.notnull(row["reported_protein_g_per_100g"]) else None,
                "reported_carbohydrates_g_per_100g": float(row["reported_carbohydrates_g_per_100g"]) if pd.notnull(row["reported_carbohydrates_g_per_100g"]) else None,
                "reported_fat_g_per_100g": float(row["reported_fat_g_per_100g"]) if pd.notnull(row["reported_fat_g_per_100g"]) else None,
                "reported_fiber_g_per_100g": float(row["reported_fiber_g_per_100g"]) if pd.notnull(row["reported_fiber_g_per_100g"]) else None,
                "serving_energy_kcal": float(row["serving_energy_kcal"]) if pd.notnull(row["serving_energy_kcal"]) else None,
                "serving_protein_g": float(row["serving_protein_g"]) if pd.notnull(row["serving_protein_g"]) else None,
                "serving_carbohydrates_g": float(row["serving_carbohydrates_g"]) if pd.notnull(row["serving_carbohydrates_g"]) else None,
                "serving_fat_g": float(row["serving_fat_g"]) if pd.notnull(row["serving_fat_g"]) else None,
            }

            self._recipes[code] = recipe_record
            self._normalized_index[norm_name] = code
            for alias in aliases:
                norm_a = normalize_text(alias)
                if norm_a:
                    self._alias_index[norm_a] = code

        logger.info(f"NutritionEngine loaded {len(self._recipes)} verified INDB recipes.")

    def search_candidates(self, query: str, limit: int = 5) -> List[CandidateMatch]:
        """Database-first candidate search & ranking."""
        norm_q = normalize_text(query)
        if not norm_q:
            return []

        # 1. Exact normalized match
        if norm_q in self._normalized_index:
            code = self._normalized_index[norm_q]
            r = self._recipes[code]
            return [CandidateMatch(
                recipe_code=code,
                name=r["name"],
                normalized_name=r["normalized_name"],
                match_type="exact_normalized",
                score=100.0,
                serving_unit=r["reported_serving_unit"],
                serving_size_g=r["reported_serving_size_g"],
                energy_kcal_per_100g=r["reported_energy_kcal_per_100g"],
                protein_g_per_100g=r["reported_protein_g_per_100g"],
                carbohydrates_g_per_100g=r["reported_carbohydrates_g_per_100g"],
                fat_g_per_100g=r["reported_fat_g_per_100g"],
                aliases=r["aliases"]
            )]

        # 2. Exact alias match
        if norm_q in self._alias_index:
            code = self._alias_index[norm_q]
            r = self._recipes[code]
            return [CandidateMatch(
                recipe_code=code,
                name=r["name"],
                normalized_name=r["normalized_name"],
                match_type="alias",
                score=90.0,
                serving_unit=r["reported_serving_unit"],
                serving_size_g=r["reported_serving_size_g"],
                energy_kcal_per_100g=r["reported_energy_kcal_per_100g"],
                protein_g_per_100g=r["reported_protein_g_per_100g"],
                carbohydrates_g_per_100g=r["reported_carbohydrates_g_per_100g"],
                fat_g_per_100g=r["reported_fat_g_per_100g"],
                aliases=r["aliases"]
            )]

        # 3. Substring & token scoring
        q_tokens = set(norm_q.split())
        scored: List[CandidateMatch] = []
        for code, r in self._recipes.items():
            name_norm = r["normalized_name"]
            score = 0.0

            if norm_q in name_norm:
                score += 40.0
            for a in r["aliases"]:
                if norm_q in normalize_text(a):
                    score += 35.0
                    break

            r_tokens = set(name_norm.split())
            common = q_tokens.intersection(r_tokens)
            if common:
                score += (len(common) / len(q_tokens)) * 30.0

            if score > 0:
                scored.append(CandidateMatch(
                    recipe_code=code,
                    name=r["name"],
                    normalized_name=r["normalized_name"],
                    match_type="token_similarity",
                    score=score,
                    serving_unit=r["reported_serving_unit"],
                    serving_size_g=r["reported_serving_size_g"],
                    energy_kcal_per_100g=r["reported_energy_kcal_per_100g"],
                    protein_g_per_100g=r["reported_protein_g_per_100g"],
                    carbohydrates_g_per_100g=r["reported_carbohydrates_g_per_100g"],
                    fat_g_per_100g=r["reported_fat_g_per_100g"],
                    aliases=r["aliases"]
                ))

        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:limit]

    async def calculate_single_item(
        self,
        item_text: str,
        user_id: Optional[str] = None,
        client: Optional[Any] = None
    ) -> ItemNutritionResult:
        """Parses and calculates nutrition for a single food item."""
        qty, unit, food_term = parse_item_portion(item_text)
        candidates = self.search_candidates(food_term, limit=4)

        if not candidates:
            # Fallback to AI / clinical baseline
            return await interpret_with_ai(food_term, qty, unit)

        top = candidates[0]
        r = self._recipes[top.recipe_code]

        # Check for material ambiguity
        clarification = detect_material_ambiguity(candidates)

        # Check user personalized portion preference
        user_pref = None
        if user_id and client:
            try:
                from app.services.user_learning import UserPreferenceLearningEngine
                user_pref = UserPreferenceLearningEngine.get_user_preference(
                    client=client,
                    user_id=user_id,
                    food_name=top.name
                )
            except Exception as e:
                logger.debug(f"Could not load user preference: {e}")

        # If user has a learned custom portion and query was unspecified
        if user_pref and qty == 1.0 and unit == "serving":
            qty = float(user_pref.get("preferred_serving_quantity", 1.0))
            unit = str(user_pref.get("preferred_serving_unit", unit))

        # Resolve differentiated weight in grams
        weight_g, is_std = resolve_serving_weight(top.name, qty, unit)

        # Scale nutrition deterministically: nutrient = per_100g * weight_g / 100.0
        factor = weight_g / 100.0
        cals = round(r["reported_energy_kcal_per_100g"] * factor, 1)
        p = round_or_none(r["reported_protein_g_per_100g"] * factor if r["reported_protein_g_per_100g"] is not None else None)
        c = round_or_none(r["reported_carbohydrates_g_per_100g"] * factor if r["reported_carbohydrates_g_per_100g"] is not None else None)
        f = round_or_none(r["reported_fat_g_per_100g"] * factor if r["reported_fat_g_per_100g"] is not None else None)
        fib = round_or_none(r["reported_fiber_g_per_100g"] * factor if r["reported_fiber_g_per_100g"] is not None else None)

        missing = []
        if p is None: missing.append("protein_g")
        if c is None: missing.append("carbohydrates_g")
        if f is None: missing.append("fat_g")
        if fib is None: missing.append("fiber_g")

        alternatives = [c.name for c in candidates[1:3]] if len(candidates) > 1 else []

        return ItemNutritionResult(
            selected_food_name=top.name,
            recipe_code=top.recipe_code,
            quantity=qty,
            serving_unit=unit,
            serving_weight_g=weight_g,
            total_calories=cals,
            protein_g=p,
            carbohydrates_g=c,
            fat_g=f,
            fiber_g=fib,
            nutrition_source="indb_verified_recipe",
            calculation_method="deterministic_indb_serving" if is_std else "deterministic_per_100g_scaled",
            uncertainty_flags=[] if is_std else ["Serving weight estimated from standard household measures."],
            missing_data_fields=missing,
            clarification_question=clarification,
            needs_user_confirmation=True,
            alternative_candidates=alternatives
        )

    async def parse_and_calculate_meal(
        self,
        raw_text: str,
        user_id: Optional[str] = None,
        client: Optional[Any] = None
    ) -> MultiItemEstimateResponse:
        """
        Parses complex multi-item sentences like:
        'I ate 2 chapatis and 1 bowl of dal'
        Returns aggregated reviewable estimate with per-item breakdown.
        """
        chunks = split_multi_item_description(raw_text)
        items: List[ItemNutritionResult] = []

        tot_cal = 0.0
        tot_p = 0.0
        tot_c = 0.0
        tot_f = 0.0
        has_ambiguity = False
        clarification_msg = None

        for chunk in chunks:
            item_res = await self.calculate_single_item(chunk, user_id=user_id, client=client)
            items.append(item_res)
            tot_cal += item_res.total_calories
            tot_p += (item_res.protein_g or 0.0)
            tot_c += (item_res.carbohydrates_g or 0.0)
            tot_f += (item_res.fat_g or 0.0)

            if item_res.clarification_question:
                has_ambiguity = True
                if not clarification_msg:
                    clarification_msg = item_res.clarification_question

        return MultiItemEstimateResponse(
            original_input=raw_text,
            items=items,
            total_calories=round(tot_cal, 1),
            total_protein_g=round(tot_p, 1),
            total_carbohydrates_g=round(tot_c, 1),
            total_fat_g=round(tot_f, 1),
            has_ambiguity=has_ambiguity,
            clarification_question=clarification_msg,
            is_confirmed=False
        )


# Global singleton instance
nutrition_engine = NutritionEngine()
