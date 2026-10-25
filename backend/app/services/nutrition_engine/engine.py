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
    are_dish_families_incompatible,
)
from app.services.nutrition_engine.ai_fallback import interpret_with_ai

logger = logging.getLogger(__name__)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data_pipeline", "data"))
CATALOG_PROFILES_JSON = os.path.join(DATA_DIR, "food_catalog_profiles.json")


class NutritionEngine:
    def __init__(self, catalog_profiles_path: str = CATALOG_PROFILES_JSON):
        self.catalog_profiles_json = catalog_profiles_path
        self._recipes: Dict[str, Dict[str, Any]] = {}
        self._normalized_index: Dict[str, str] = {}
        self._alias_index: Dict[str, str] = {}
        self.load_catalog()

    def load_catalog(self):
        """Loads and indexes the food catalog and nutrition profiles."""
        if os.path.exists(self.catalog_profiles_json):
            try:
                with open(self.catalog_profiles_json, "r", encoding="utf-8") as f:
                    items = json.load(f)

                for it in items:
                    food_id = str(it["id"])
                    canonical_name = str(it["canonical_name"]).strip()
                    norm_name = str(it["normalized_name"]).strip()
                    aliases = it.get("aliases") or []
                    profiles = it.get("nutrition_profiles") or []

                    primary_profile = None
                    for p in profiles:
                        if p.get("preparation_method") == "standard" and p.get("nutrition_basis") == "per_100g":
                            primary_profile = p
                            break
                    if not primary_profile and profiles:
                        primary_profile = profiles[0]

                    if primary_profile:
                        profile_id = str(primary_profile["id"])
                        code = str(primary_profile.get("source_record_id") or food_id).strip()
                        recipe_record = {
                            "food_id": food_id,
                            "profile_id": profile_id,
                            "source_recipe_code": code,
                            "name": canonical_name,
                            "normalized_name": norm_name,
                            "aliases": aliases,
                            "reported_serving_size_g": float(primary_profile.get("default_portion_weight_g") or 150.0),
                            "reported_servings_count": 1.0,
                            "reported_serving_unit": str(primary_profile.get("default_portion_description") or "serving").strip(),
                            "reported_energy_kcal_per_100g": float(primary_profile["energy_kcal"]),
                            "reported_protein_g_per_100g": float(primary_profile["protein_g"]) if primary_profile.get("protein_g") is not None else None,
                            "reported_carbohydrates_g_per_100g": float(primary_profile["carb_g"]) if primary_profile.get("carb_g") is not None else None,
                            "reported_fat_g_per_100g": float(primary_profile["fat_g"]) if primary_profile.get("fat_g") is not None else None,
                            "reported_fiber_g_per_100g": float(primary_profile["fiber_g"]) if primary_profile.get("fiber_g") is not None else None,
                            "validation_status": str(primary_profile.get("validation_status", "verified")).strip(),
                            "source_type": "indb_verified_recipe" if primary_profile.get("source_record_id") else "nutrition_profile",
                        }

                        self._recipes[code] = recipe_record
                        self._recipes[food_id] = recipe_record
                        self._normalized_index[norm_name] = code
                        for alias in aliases:
                            norm_a = normalize_text(alias)
                            if norm_a:
                                self._alias_index[norm_a] = code

                logger.info(f"NutritionEngine loaded {len(items)} catalog items with reusable profiles from JSON.")
                return
            except Exception as e:
                logger.warning(f"Could not load food_catalog_profiles.json ({e}).")

        logger.info("NutritionEngine initialized with clean runtime and dynamic Supabase catalog.")

    def register_runtime_profile(
        self,
        food_id: str,
        profile_id: str,
        canonical_name: str,
        norm_name: str,
        aliases: List[str],
        serving_unit: str,
        serving_size_g: float,
        energy_kcal_per_100g: float,
        protein_g_per_100g: Optional[float] = None,
        carbohydrates_g_per_100g: Optional[float] = None,
        fat_g_per_100g: Optional[float] = None,
        fiber_g_per_100g: Optional[float] = None,
        validation_status: str = "unverified"
    ):
        """Registers a newly discovered or estimated profile in-memory for instant reuse."""
        record = {
            "food_id": food_id,
            "profile_id": profile_id,
            "source_recipe_code": food_id,
            "name": canonical_name,
            "normalized_name": norm_name,
            "aliases": aliases,
            "reported_serving_size_g": serving_size_g,
            "reported_servings_count": 1.0,
            "reported_serving_unit": serving_unit,
            "reported_energy_kcal_per_100g": energy_kcal_per_100g,
            "reported_protein_g_per_100g": protein_g_per_100g,
            "reported_carbohydrates_g_per_100g": carbohydrates_g_per_100g,
            "reported_fat_g_per_100g": fat_g_per_100g,
            "reported_fiber_g_per_100g": fiber_g_per_100g,
            "validation_status": validation_status,
            "source_type": "nutrition_profile",
        }
        self._recipes[food_id] = record
        self._normalized_index[norm_name] = food_id
        for a in aliases:
            na = normalize_text(a)
            if na:
                self._alias_index[na] = food_id

    def lookup_food_in_supabase(self, food_term: str, client: Any) -> Optional[CandidateMatch]:
        """Queries Supabase food_catalog and nutrition_profiles dynamically for unindexed foods."""
        norm_q = normalize_text(food_term)
        if not norm_q or not client:
            return None
        try:
            res = client.table("food_catalog").select(
                "id, canonical_name, normalized_name, aliases, category, nutrition_profiles(*)"
            ).or_(f"normalized_name.eq.{norm_q},canonical_name.ilike.%{food_term}%").limit(1).execute()

            if res.data and len(res.data) > 0:
                food_row = res.data[0]
                food_id = str(food_row["id"])
                canonical_name = str(food_row["canonical_name"]).strip()
                norm_name = str(food_row["normalized_name"]).strip()
                aliases = food_row.get("aliases") or []
                profiles = food_row.get("nutrition_profiles") or []

                primary_profile = None
                for p in profiles:
                    if p.get("preparation_method") == "standard" and p.get("nutrition_basis") == "per_100g":
                        primary_profile = p
                        break
                if not primary_profile and profiles:
                    primary_profile = profiles[0]

                if primary_profile:
                    profile_id = str(primary_profile["id"])
                    serving_unit = str(primary_profile.get("default_portion_description") or "serving").strip()
                    serving_g = float(primary_profile.get("default_portion_weight_g") or 150.0)
                    cals_100g = float(primary_profile["energy_kcal"])
                    p_100g = float(primary_profile["protein_g"]) if primary_profile.get("protein_g") is not None else None
                    c_100g = float(primary_profile["carb_g"]) if primary_profile.get("carb_g") is not None else None
                    f_100g = float(primary_profile["fat_g"]) if primary_profile.get("fat_g") is not None else None
                    fib_100g = float(primary_profile["fiber_g"]) if primary_profile.get("fiber_g") is not None else None
                    val_status = str(primary_profile.get("validation_status", "verified")).strip()

                    self.register_runtime_profile(
                        food_id=food_id,
                        profile_id=profile_id,
                        canonical_name=canonical_name,
                        norm_name=norm_name,
                        aliases=aliases,
                        serving_unit=serving_unit,
                        serving_size_g=serving_g,
                        energy_kcal_per_100g=cals_100g,
                        protein_g_per_100g=p_100g,
                        carbohydrates_g_per_100g=c_100g,
                        fat_g_per_100g=f_100g,
                        fiber_g_per_100g=fib_100g,
                        validation_status=val_status
                    )

                    return CandidateMatch(
                        recipe_code=food_id,
                        name=canonical_name,
                        normalized_name=norm_name,
                        match_type="exact_normalized",
                        score=100.0,
                        serving_unit=serving_unit,
                        serving_size_g=serving_g,
                        energy_kcal_per_100g=cals_100g,
                        protein_g_per_100g=p_100g,
                        carbohydrates_g_per_100g=c_100g,
                        fat_g_per_100g=f_100g,
                        aliases=aliases,
                        validation_status=val_status,
                        food_id=food_id,
                        profile_id=profile_id
                    )
        except Exception as e:
            logger.debug(f"Dynamic Supabase food catalog search failed: {e}")
        return None

    def save_ai_estimation_profile(
        self,
        ai_res: ItemNutritionResult,
        food_term: str,
        quantity: float,
        unit: str,
        client: Any
    ):
        """Persists newly estimated AI nutrition results into food_catalog and nutrition_profiles."""
        if not client:
            return
        try:
            canonical_name = ai_res.selected_food_name
            norm_name = normalize_text(canonical_name)
            weight_g = ai_res.serving_weight_g or 100.0
            scale_to_100 = (100.0 / weight_g) if weight_g > 0 else 1.0

            per_100g_cals = round(ai_res.total_calories * scale_to_100, 2)
            per_100g_p = round((ai_res.protein_g or 0.0) * scale_to_100, 2)
            per_100g_c = round((ai_res.carbohydrates_g or 0.0) * scale_to_100, 2)
            per_100g_f = round((ai_res.fat_g or 0.0) * scale_to_100, 2)
            per_100g_fib = round((ai_res.fiber_g or 0.0) * scale_to_100, 2) if ai_res.fiber_g is not None else None
            unit_portion_weight = round(weight_g / quantity, 2) if quantity > 0 else weight_g

            aliases = [food_term] if normalize_text(food_term) != norm_name else []
            cat_payload = {
                "canonical_name": canonical_name,
                "normalized_name": norm_name,
                "aliases": aliases,
                "category": "indian_dish",
                "food_state": "cooked",
                "description": f"AI estimated food profile for {canonical_name}",
                "is_active": True
            }
            cat_res = client.table("food_catalog").upsert(cat_payload, on_conflict="normalized_name").execute()
            if not cat_res.data:
                return

            food_id = str(cat_res.data[0]["id"])
            ai_res.food_id = food_id

            prof_payload = {
                "food_id": food_id,
                "preparation_method": "standard",
                "nutrition_basis": "per_100g",
                "basis_weight_g": 100.0,
                "energy_kcal": per_100g_cals,
                "protein_g": per_100g_p,
                "carb_g": per_100g_c,
                "fat_g": per_100g_f,
                "fiber_g": per_100g_fib,
                "default_portion_description": unit,
                "default_portion_weight_g": unit_portion_weight,
                "source_type": "ai_estimation",
                "source_name": "Gemini_Flash",
                "assumptions": "AI estimated profile saved for reuse",
                "confidence": 0.85,
                "validation_status": "unverified",
                "model_provider": "google",
                "model_version": "gemini-2.5-flash"
            }
            prof_res = client.table("nutrition_profiles").upsert(
                prof_payload,
                on_conflict="food_id,preparation_method,nutrition_basis"
            ).execute()

            if prof_res.data:
                profile_id = str(prof_res.data[0]["id"])
                ai_res.profile_id = profile_id
                ai_res.nutrition_source = "nutrition_profile"

                self.register_runtime_profile(
                    food_id=food_id,
                    profile_id=profile_id,
                    canonical_name=canonical_name,
                    norm_name=norm_name,
                    aliases=aliases,
                    serving_unit=unit,
                    serving_size_g=unit_portion_weight,
                    energy_kcal_per_100g=per_100g_cals,
                    protein_g_per_100g=per_100g_p,
                    carbohydrates_g_per_100g=per_100g_c,
                    fat_g_per_100g=per_100g_f,
                    fiber_g_per_100g=per_100g_fib,
                    validation_status="unverified"
                )
                logger.info(f"Persisted and cached new AI profile for {canonical_name} (food_id: {food_id}, profile_id: {profile_id})")
        except Exception as e:
            logger.warning(f"Could not persist AI estimation profile to Supabase: {e}")

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
                aliases=r["aliases"],
                validation_status=r["validation_status"],
                food_id=r.get("food_id"),
                profile_id=r.get("profile_id")
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
                aliases=r["aliases"],
                validation_status=r["validation_status"],
                food_id=r.get("food_id"),
                profile_id=r.get("profile_id")
            )]

        # 3. Substring & token scoring
        q_tokens = set(norm_q.split())
        scored: List[CandidateMatch] = []
        for code, r in self._recipes.items():
            name_norm = r["normalized_name"]

            # Guardrail: Do not match across conflicting culinary dish families
            # (e.g. flatbread bhakri must never match sweet ladoo, dosa, or snack mathri)
            if are_dish_families_incompatible(norm_q, name_norm):
                continue

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
                    aliases=r["aliases"],
                    validation_status=r["validation_status"],
                    food_id=r.get("food_id"),
                    profile_id=r.get("profile_id")
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

        if not candidates and client:
            supa_candidate = self.lookup_food_in_supabase(food_term, client=client)
            if supa_candidate:
                candidates = [supa_candidate]

        if not candidates:
            # Fallback to AI / clinical baseline
            ai_res = await interpret_with_ai(food_term, qty, unit)
            if client:
                self.save_ai_estimation_profile(ai_res, food_term, qty, unit, client=client)
            return ai_res

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

        val_status = r.get("validation_status", "verified")
        flags = [] if is_std else ["Serving weight estimated from standard household measures."]
        if val_status == "needs_review":
            flags.insert(0, "UNVERIFIED RECIPE (NEEDS REVIEW): This recipe contains uncalibrated bulk frying oil or suspicious macronutrients. Values are pending culinary team audit and must not be trusted as verified.")
            source_type = "needs_review_catalog_entry"
            calc_method = "unverified_needs_review"
        else:
            source_type = r.get("source_type", "indb_verified_recipe")
            calc_method = "deterministic_indb_serving" if is_std else "deterministic_per_100g_scaled"

        return ItemNutritionResult(
            selected_food_name=top.name,
            recipe_code=top.recipe_code,
            food_id=top.food_id or r.get("food_id"),
            profile_id=top.profile_id or r.get("profile_id"),
            quantity=qty,
            serving_unit=unit,
            serving_weight_g=weight_g,
            total_calories=cals,
            protein_g=p,
            carbohydrates_g=c,
            fat_g=f,
            fiber_g=fib,
            nutrition_source=source_type,
            calculation_method=calc_method,
            validation_status=val_status,
            uncertainty_flags=flags,
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
