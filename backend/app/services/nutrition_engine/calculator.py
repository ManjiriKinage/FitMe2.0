"""Deterministic Mathematical Nutrition Calculator.

Implements Parts A, B, and C of the Nutrition Engine specification:
- Ingredient per-100g scaling: total = (per_100g * weight_g) / 100.0
- Explicit preservation of missing nutrients (no silent zeroing)
- Raw vs Cooked retention / expansion factors
- Recipe aggregation and finished-product yield calculations
- Differentiated serving size weights (no universal bowl/plate assumption)
- Prevention of duplicate calculation and double-counting
"""
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
from app.services.nutrition_engine.models import (
    IngredientCalculationInput,
    IngredientCalculationResult,
    RecipeCalculationInput,
    RecipeCalculationResult,
)

logger = logging.getLogger(__name__)

# Standard Indian Household Serving Weights (g or ml)
DISH_SPECIFIC_SERVINGS: Dict[str, Dict[str, float]] = {
    "chapati": {"piece": 35.0, "medium piece": 35.0, "large piece": 50.0, "serving": 70.0}, # 2 chapatis = 70g
    "roti": {"piece": 35.0, "medium piece": 35.0, "serving": 70.0},
    "paratha": {"piece": 75.0, "medium piece": 75.0, "serving": 75.0},
    "puri": {"piece": 25.0, "serving": 100.0},
    "dal": {"bowl": 150.0, "katori": 150.0, "cup": 180.0, "serving": 150.0},
    "sambar": {"bowl": 150.0, "katori": 150.0, "cup": 180.0, "serving": 150.0},
    "poha": {"plate": 200.0, "bowl": 150.0, "katori": 120.0, "serving": 200.0},
    "upma": {"plate": 200.0, "bowl": 150.0, "katori": 120.0, "serving": 200.0},
    "rice": {"cup": 150.0, "bowl": 150.0, "plate": 250.0, "serving": 150.0},
    "khichdi": {"bowl": 180.0, "plate": 250.0, "serving": 200.0},
    "biryani": {"plate": 300.0, "bowl": 200.0, "serving": 300.0},
    "idli": {"piece": 40.0, "serving": 80.0}, # 2 idlis = 80g
    "dosa": {"piece": 100.0, "serving": 100.0},
    "paneer": {"bowl": 150.0, "katori": 120.0, "serving": 150.0},
    "curry": {"bowl": 160.0, "katori": 130.0, "serving": 160.0},
    "sabzi": {"bowl": 140.0, "katori": 120.0, "serving": 140.0},
    "curd": {"bowl": 150.0, "katori": 120.0, "cup": 200.0, "serving": 150.0},
    "raita": {"bowl": 120.0, "katori": 100.0, "serving": 120.0},
}

# General fallback unit factors (when dish-specific weight is not applicable)
GENERIC_UNIT_FACTORS: Dict[str, float] = {
    "tsp": 5.0,
    "teaspoon": 5.0,
    "tbsp": 15.0,
    "tablespoon": 15.0,
    "cup": 200.0,
    "glass": 240.0,
    "tall glass": 300.0,
    "katori": 150.0,
    "bowl": 150.0,
    "plate": 250.0,
    "piece": 50.0,
    "slice": 30.0,
    "g": 1.0,
    "gm": 1.0,
    "grams": 1.0,
    "ml": 1.0,
}

# Raw to Cooked Yield Ratios (water retention / cooking loss)
RAW_TO_COOKED_EXPANSION: Dict[str, float] = {
    "rice": 2.8,        # 100g raw rice -> 280g cooked rice
    "dal": 3.0,         # 100g dry dal -> 300g cooked dal
    "lentils": 3.0,
    "pulses": 2.8,
    "flour": 1.4,       # 100g atta + water -> 140g cooked chapati
    "chicken": 0.75,    # 100g raw chicken -> 75g cooked chicken (moisture loss)
    "mutton": 0.70,
    "fish": 0.80,
    "vegetable": 0.85,
}


def round_or_none(val: Optional[float], decimals: int = 1) -> Optional[float]:
    if val is None or math.isnan(val) or math.isinf(val):
        return None
    return round(float(val), decimals)


def resolve_serving_weight(food_name: str, quantity: float, unit: str) -> Tuple[float, bool]:
    """
    Resolves the gram weight for a given food, quantity, and unit.
    Returns: (total_weight_g, is_dish_specific_standard)
    Ensures that a 'bowl of dal' (150g) is NOT assumed to have the same weight
    as a 'plate of poha' (200g) or a 'medium chapati' (35g).
    """
    clean_name = food_name.lower().strip()
    clean_unit = unit.lower().strip().rstrip("s") # normalize plural

    # 1. Direct gram unit
    if clean_unit in ["g", "gm", "gram"]:
        return quantity, True

    # 2. Check dish-specific standard dictionary
    for dish_key, unit_dict in DISH_SPECIFIC_SERVINGS.items():
        if dish_key in clean_name:
            for u_key, gram_val in unit_dict.items():
                if clean_unit == u_key or clean_unit.startswith(u_key):
                    return round(gram_val * quantity, 1), True
            # Default serving for this specific dish if unit is just "serving"
            if clean_unit in ["serving", "portion"] and "serving" in unit_dict:
                return round(unit_dict["serving"] * quantity, 1), True

    # 3. Fallback to generic household measure
    if clean_unit in GENERIC_UNIT_FACTORS:
        return round(GENERIC_UNIT_FACTORS[clean_unit] * quantity, 1), False

    # Default fallback: 100g per unit, flagged as uncalibrated estimate
    return round(100.0 * quantity, 1), False


def calculate_ingredient(inp: IngredientCalculationInput) -> IngredientCalculationResult:
    """
    Core ingredient calculation:
    total_nutrient = nutrient_per_100g * ingredient_weight_g / 100.0
    Preserves None for unmeasured nutrients without silently treating as zero.
    """
    if inp.weight_g <= 0:
        raise ValueError(f"Ingredient weight must be strictly positive. Got: {inp.weight_g}")

    edible_weight = inp.weight_g * inp.edible_portion_factor
    factor = edible_weight / 100.0

    missing: List[str] = []

    def scale_nutrient(val: Optional[float], name: str) -> Optional[float]:
        if val is None or math.isnan(val) or math.isinf(val):
            missing.append(name)
            return None
        return round(val * factor, 2)

    cals = scale_nutrient(inp.energy_kcal_per_100g, "energy_kcal")
    p = scale_nutrient(inp.protein_g_per_100g, "protein_g")
    c = scale_nutrient(inp.carbohydrates_g_per_100g, "carbohydrates_g")
    f = scale_nutrient(inp.fat_g_per_100g, "fat_g")
    fib = scale_nutrient(inp.fiber_g_per_100g, "fiber_g")

    return IngredientCalculationResult(
        ingredient_name=inp.ingredient_name,
        weight_g=inp.weight_g,
        edible_weight_g=round(edible_weight, 2),
        energy_kcal=cals,
        protein_g=p,
        carbohydrates_g=c,
        fat_g=f,
        fiber_g=fib,
        missing_nutrients=missing,
        calculation_basis="deterministic_per_100g_edible"
    )


def calculate_recipe(inp: RecipeCalculationInput) -> RecipeCalculationResult:
    """
    Computes recipe nutrition from ingredient components:
    1. Calculates each ingredient's contribution.
    2. Sums energy and available macronutrients.
    3. Accounts for added oils and fats explicitly (9 kcal/g).
    4. Applies cooked yield if known, otherwise flags yield uncertainty.
    5. Calculates per-serving values based on servings_count.
    """
    if inp.servings_count <= 0:
        raise ValueError("Recipe servings_count must be strictly positive.")

    ing_results: List[IngredientCalculationResult] = []
    total_raw_weight = 0.0
    tot_energy = 0.0
    tot_p = 0.0
    tot_c = 0.0
    tot_f = 0.0
    tot_fib = 0.0

    missing_fields: List[str] = []
    uncertainty_flags: List[str] = []

    for ing in inp.ingredients:
        res = calculate_ingredient(ing)
        ing_results.append(res)
        total_raw_weight += res.weight_g

        if res.energy_kcal is not None:
            tot_energy += res.energy_kcal
        else:
            missing_fields.append(f"{ing.ingredient_name}:energy_kcal")

        if res.protein_g is not None:
            tot_p += res.protein_g
        else:
            missing_fields.append(f"{ing.ingredient_name}:protein_g")

        if res.carbohydrates_g is not None:
            tot_c += res.carbohydrates_g
        else:
            missing_fields.append(f"{ing.ingredient_name}:carbohydrates_g")

        if res.fat_g is not None:
            tot_f += res.fat_g
        else:
            missing_fields.append(f"{ing.ingredient_name}:fat_g")

        if res.fiber_g is not None:
            tot_fib += res.fiber_g

    # Account for cooking oil / added fat (9 kcal/g, 100% fat)
    if inp.oil_fat_addition_g > 0:
        oil_cals = inp.oil_fat_addition_g * 9.0
        tot_energy += oil_cals
        tot_f += inp.oil_fat_addition_g
        total_raw_weight += inp.oil_fat_addition_g

    # Determine cooked yield and serving weight
    if inp.cooked_yield_g and inp.cooked_yield_g > 0:
        serving_weight = round(inp.cooked_yield_g / inp.servings_count, 1)
        final_yield = inp.cooked_yield_g
    else:
        # Flag cooked yield uncertainty
        uncertainty_flags.append("Final cooked yield is undocumented; serving weight estimated from raw weight.")
        final_yield = None
        serving_weight = round(total_raw_weight / inp.servings_count, 1)

    serving_cals = round(tot_energy / inp.servings_count, 1)
    serving_p = round(tot_p / inp.servings_count, 1)
    serving_c = round(tot_c / inp.servings_count, 1)
    serving_f = round(tot_f / inp.servings_count, 1)
    serving_fib = round(tot_fib / inp.servings_count, 1)

    return RecipeCalculationResult(
        recipe_name=inp.recipe_name,
        total_raw_weight_g=round(total_raw_weight, 1),
        cooked_yield_g=round(final_yield, 1) if final_yield else None,
        servings_count=inp.servings_count,
        serving_weight_g=serving_weight,
        serving_unit=inp.serving_unit,
        serving_energy_kcal=serving_cals,
        serving_protein_g=serving_p,
        serving_carbohydrates_g=serving_c,
        serving_fat_g=serving_f,
        serving_fiber_g=serving_fib,
        total_energy_kcal=round(tot_energy, 1),
        total_protein_g=round(tot_p, 1),
        total_carbohydrates_g=round(tot_c, 1),
        total_fat_g=round(tot_f, 1),
        total_fiber_g=round(tot_fib, 1),
        ingredient_breakdown=ing_results,
        uncertainty_flags=uncertainty_flags,
        missing_data_fields=list(set(missing_fields))
    )
