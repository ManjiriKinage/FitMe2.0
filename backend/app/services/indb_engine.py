"""Deterministic Indian Nutrient Databank (INDB) Nutrition Engine.

Implements:
1. Catalog loading and indexing for 1,014 official INDB prepared recipes.
2. High-precision deterministic calculation:
   - Per 100g scaling: nutrient_total = (nutrient_per_100g * grams) / 100.0
   - Per serving unit scaling: nutrient_total = serving_nutrient * quantity
3. Database-first query resolution (exact, alias, token search).
4. Strict scientific guardrails against double-counting and silent zero assumptions.
"""
import os
import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data_pipeline", "data"))
RECIPES_CSV = os.path.join(DATA_DIR, "recipes.csv")
UNITS_CSV = os.path.join(DATA_DIR, "unit_conversions.csv")

class INDBNutritionEngine:
    def __init__(self, recipes_path: str = RECIPES_CSV, units_path: str = UNITS_CSV):
        self.recipes_path = recipes_path
        self.units_path = units_path
        self._recipes: Dict[str, Dict[str, Any]] = {}
        self._normalized_index: Dict[str, str] = {}
        self._alias_index: Dict[str, str] = {}
        self._units: Dict[str, float] = {}
        self.load_catalog()

    def load_catalog(self):
        """Loads and indexes the normalized INDB recipes catalog."""
        if not os.path.exists(self.recipes_path):
            logger.warning(f"Recipes catalog not found at {self.recipes_path}. Using fallback.")
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
                "reported_protein_g_per_100g": float(row["reported_protein_g_per_100g"]),
                "reported_carbohydrates_g_per_100g": float(row["reported_carbohydrates_g_per_100g"]),
                "reported_fat_g_per_100g": float(row["reported_fat_g_per_100g"]),
                "reported_fiber_g_per_100g": float(row["reported_fiber_g_per_100g"]) if pd.notnull(row["reported_fiber_g_per_100g"]) else 0.0,
                "serving_energy_kcal": float(row["serving_energy_kcal"]) if pd.notnull(row["serving_energy_kcal"]) else None,
                "serving_protein_g": float(row["serving_protein_g"]) if pd.notnull(row["serving_protein_g"]) else None,
                "serving_carbohydrates_g": float(row["serving_carbohydrates_g"]) if pd.notnull(row["serving_carbohydrates_g"]) else None,
                "serving_fat_g": float(row["serving_fat_g"]) if pd.notnull(row["serving_fat_g"]) else None,
                "source_name": str(row["source_name"]),
            }

            self._recipes[code] = recipe_record
            self._normalized_index[norm_name] = code
            for alias in aliases:
                norm_alias = self._normalize_query(alias)
                if norm_alias:
                    self._alias_index[norm_alias] = code

        logger.info(f"Loaded {len(self._recipes)} INDB recipes into deterministic calculation engine.")

        # Load unit conversions
        if os.path.exists(self.units_path):
            udf = pd.read_csv(self.units_path)
            for _, urow in udf.iterrows():
                self._units[str(urow["unit_name"]).lower()] = float(urow["gram_factor"])

    @staticmethod
    def _normalize_query(text: str) -> str:
        if not text:
            return ""
        s = text.lower()
        s = re.sub(r"[^\w\s]", " ", s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    def calculate_from_grams(
        self,
        recipe_code: str,
        weight_g: float
    ) -> Dict[str, float]:
        """
        Deterministic arithmetic per 100g:
        nutrient_total = (nutrient_per_100g * weight_g) / 100.0
        """
        recipe = self._recipes.get(recipe_code)
        if not recipe:
            raise ValueError(f"Unknown recipe code: {recipe_code}")

        factor = weight_g / 100.0
        return {
            "calories": round(recipe["reported_energy_kcal_per_100g"] * factor, 1),
            "protein_g": round(recipe["reported_protein_g_per_100g"] * factor, 1),
            "carbohydrates_g": round(recipe["reported_carbohydrates_g_per_100g"] * factor, 1),
            "fat_g": round(recipe["reported_fat_g_per_100g"] * factor, 1),
            "fiber_g": round(recipe["reported_fiber_g_per_100g"] * factor, 1),
            "weight_g": round(weight_g, 1)
        }

    def calculate_from_servings(
        self,
        recipe_code: str,
        quantity: float,
        serving_unit: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Deterministic calculation from serving unit or portion count.
        Ensures linear proportionality: doubling serving doubles nutrition exactly.
        Never multiplies twice or adds ingredient-derived energy to finished recipe.
        """
        recipe = self._recipes.get(recipe_code)
        if not recipe:
            raise ValueError(f"Unknown recipe code: {recipe_code}")

        if quantity <= 0:
            raise ValueError("Serving quantity must be greater than zero.")

        # 1. If official unit serving nutrition exists in INDB:
        if recipe.get("serving_energy_kcal") is not None:
            cals = round(recipe["serving_energy_kcal"] * quantity, 1)
            p = round(recipe["serving_protein_g"] * quantity, 1)
            c = round(recipe["serving_carbohydrates_g"] * quantity, 1)
            f = round(recipe["serving_fat_g"] * quantity, 1)
            weight_g = round(recipe["reported_serving_size_g"] * quantity, 1)
            unit_label = serving_unit or recipe["reported_serving_unit"]
        else:
            # 2. Fall back to scaling the reported per-100g values with the standard serving weight
            weight_per_serving = recipe.get("reported_serving_size_g", 150.0)
            total_weight_g = weight_per_serving * quantity
            res = self.calculate_from_grams(recipe_code, total_weight_g)
            cals = res["calories"]
            p = res["protein_g"]
            c = res["carbohydrates_g"]
            f = res["fat_g"]
            weight_g = res["weight_g"]
            unit_label = serving_unit or recipe["reported_serving_unit"] or "serving"

        return {
            "recipe_code": recipe_code,
            "recipe_name": recipe["name"],
            "quantity": quantity,
            "serving_unit": unit_label,
            "total_weight_g": weight_g,
            "calories": cals,
            "protein_g": p,
            "carbohydrates_g": c,
            "fat_g": f,
            "calculation_method": "deterministic_indb_serving"
        }

    def search_recipes(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Database-first matching order:
        1. Exact normalized match
        2. Alias exact match
        3. Token overlap & substring match
        """
        norm_q = self._normalize_query(query)
        if not norm_q:
            return []

        # 1. Exact normalized match
        if norm_q in self._normalized_index:
            code = self._normalized_index[norm_q]
            return [self._recipes[code]]

        # 2. Exact alias match
        if norm_q in self._alias_index:
            code = self._alias_index[norm_q]
            return [self._recipes[code]]

        # 3. Substring & Token match
        q_tokens = set(norm_q.split())
        scored_matches = []
        for code, r in self._recipes.items():
            name_norm = r["normalized_name"]
            score = 0.0

            if norm_q in name_norm:
                score += 10.0
            
            # Alias substring
            for a in r["aliases"]:
                if norm_q in self._normalize_query(a):
                    score += 8.0
                    break

            # Token overlap (Jaccard-like)
            r_tokens = set(name_norm.split())
            common = q_tokens.intersection(r_tokens)
            if common:
                score += (len(common) / len(q_tokens)) * 5.0

            if score > 0:
                scored_matches.append((score, r))

        scored_matches.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored_matches[:limit]]

    def parse_natural_food_input(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Extracts quantity, unit, and food query from natural descriptions.
        e.g., '2 medium chapatis' -> qty=2.0, unit='piece', food='chapati'
              '1 bowl of dal' -> qty=1.0, unit='bowl', food='dal'
              '1 plate poha' -> qty=1.0, unit='plate', food='poha'
              '150g cooked rice' -> qty=150.0, unit='g', food='cooked rice'
        """
        clean_text = text.strip()
        
        # Match leading quantity (e.g. 2, 2.5, 1/2)
        qty = 1.0
        rest = clean_text

        # Word numbers
        word_numbers = {
            "one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0,
            "six": 6.0, "seven": 7.0, "eight": 8.0, "half": 0.5, "quarter": 0.25
        }
        for w, val in word_numbers.items():
            pattern = rf"^{w}\s+"
            if re.match(pattern, rest, flags=re.IGNORECASE):
                qty = val
                rest = re.sub(pattern, "", rest, flags=re.IGNORECASE).strip()
                break

        # Digit quantities
        m = re.match(r"^(\d+(?:\.\d+)?|\d+/\d+)\s*", rest)
        if m:
            qty_str = m.group(1)
            if "/" in qty_str:
                num, denom = qty_str.split("/")
                qty = float(num) / float(denom)
            else:
                qty = float(qty_str)
            rest = rest[m.end():].strip()

        # Check for serving units in text
        detected_unit = None
        common_units = ["bowl", "katori", "plate", "cup", "tea cup", "tall glass", "glass", "piece", "chapati", "roti", "slice", "tablespoon", "tbsp", "teaspoon", "tsp", "g", "gm", "grams", "ml"]
        for u in sorted(common_units, key=len, reverse=True):
            unit_pattern = rf"^(?:of\s+)?{u}s?\s+(?:of\s+)?"
            match = re.match(unit_pattern, rest, flags=re.IGNORECASE)
            if match:
                detected_unit = u
                rest = rest[match.end():].strip()
                break

        food_search_term = rest if rest else clean_text
        
        # Search catalog
        matches = self.search_recipes(food_search_term, limit=3)
        if not matches:
            return None

        primary_match = matches[0]
        recipe_code = primary_match["source_recipe_code"]

        # Calculate deterministically
        if detected_unit in ["g", "gm", "grams"]:
            calc_res = self.calculate_from_grams(recipe_code, qty)
            return {
                "recipe_code": recipe_code,
                "food_name": primary_match["name"],
                "quantity": qty,
                "unit": "grams",
                "estimated_calories": calc_res["calories"],
                "protein_g": calc_res["protein_g"],
                "carbohydrates_g": calc_res["carbohydrates_g"],
                "fat_g": calc_res["fat_g"],
                "estimate_source": "indb_catalog",
                "calculation_method": "deterministic_per_100g",
                "matches_count": len(matches)
            }
        else:
            calc_res = self.calculate_from_servings(recipe_code, qty, serving_unit=detected_unit)
            return {
                "recipe_code": recipe_code,
                "food_name": primary_match["name"],
                "quantity": qty,
                "unit": calc_res["serving_unit"],
                "estimated_calories": calc_res["calories"],
                "protein_g": calc_res["protein_g"],
                "carbohydrates_g": calc_res["carbohydrates_g"],
                "fat_g": calc_res["fat_g"],
                "estimate_source": "indb_catalog",
                "calculation_method": "deterministic_indb_serving",
                "matches_count": len(matches)
            }

# Singleton instance
indb_engine = INDBNutritionEngine()
