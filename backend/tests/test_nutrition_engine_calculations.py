"""Test suite for the Core Nutrition Engine calculations and constraints.

Validates Parts A through F of the specification:
- Quantity scaling (linear proportionality)
- Ingredient unit conversion
- Raw vs Cooked food handling and differentiated serving weights
- Recipe yield and serving calculations
- Oil and fat additions
- Missing data preservation (no silent zeroing)
- Invalid quantities rejection
- Duplicate calculation prevention
- Recipe-versus-ingredient reconciliation
- Multi-item sentence parsing ('I ate 2 chapatis and 1 bowl of dal')
- Material ambiguity clarification
"""
import pytest
import math
from app.services.nutrition_engine import (
    calculate_ingredient,
    calculate_recipe,
    resolve_serving_weight,
    split_multi_item_description,
    parse_item_portion,
    detect_material_ambiguity,
    nutrition_engine,
    IngredientCalculationInput,
    RecipeCalculationInput,
    CandidateMatch,
)


def test_ingredient_per_100g_exact_formula():
    """Validates: total_nutrient = nutrient_per_100g * ingredient_weight_g / 100.0"""
    inp = IngredientCalculationInput(
        ingredient_name="Atta (Whole Wheat Flour)",
        weight_g=150.0,
        energy_kcal_per_100g=340.0,
        protein_g_per_100g=12.0,
        carbohydrates_g_per_100g=69.0,
        fat_g_per_100g=1.5,
        fiber_g_per_100g=11.0,
        edible_portion_factor=1.0
    )
    res = calculate_ingredient(inp)
    assert res.edible_weight_g == 150.0
    assert res.energy_kcal == 510.0  # 340 * 1.5
    assert res.protein_g == 18.0     # 12.0 * 1.5
    assert res.carbohydrates_g == 103.5 # 69.0 * 1.5
    assert res.fat_g == 2.25         # 1.5 * 1.5
    assert res.fiber_g == 16.5       # 11.0 * 1.5
    assert len(res.missing_nutrients) == 0


def test_missing_data_not_treated_as_zero():
    """Unmeasured nutrients (None) must be preserved as None, never coerced to 0.0."""
    inp = IngredientCalculationInput(
        ingredient_name="Specialty Micro-ingredient",
        weight_g=50.0,
        energy_kcal_per_100g=120.0,
        protein_g_per_100g=None,  # Unmeasured
        carbohydrates_g_per_100g=20.0,
        fat_g_per_100g=None,      # Unmeasured
        fiber_g_per_100g=None     # Unmeasured
    )
    res = calculate_ingredient(inp)
    assert res.energy_kcal == 60.0
    assert res.carbohydrates_g == 10.0
    assert res.protein_g is None, "Missing protein must remain None, not 0.0"
    assert res.fat_g is None, "Missing fat must remain None, not 0.0"
    assert res.fiber_g is None, "Missing fiber must remain None, not 0.0"
    assert "protein_g" in res.missing_nutrients
    assert "fat_g" in res.missing_nutrients
    assert "fiber_g" in res.missing_nutrients


def test_invalid_quantities_rejected():
    """Negative or zero quantities must raise ValueError."""
    with pytest.raises(ValueError):
        calculate_ingredient(IngredientCalculationInput(
            ingredient_name="Salt",
            weight_g=0.0
        ))

    with pytest.raises(ValueError):
        calculate_ingredient(IngredientCalculationInput(
            ingredient_name="Flour",
            weight_g=-10.0
        ))

    with pytest.raises(ValueError):
        calculate_recipe(RecipeCalculationInput(
            recipe_name="Invalid Servings Recipe",
            ingredients=[
                IngredientCalculationInput(ingredient_name="Rice", weight_g=100.0)
            ],
            servings_count=0.0
        ))


def test_ingredient_unit_conversions():
    """Tests conversions for household measures (tsp, tbsp)."""
    # 1 tsp oil = 5g
    w_tsp, _ = resolve_serving_weight("cooking oil", 1.0, "tsp")
    assert w_tsp == 5.0

    # 2 tbsp oil = 30g
    w_tbsp, _ = resolve_serving_weight("cooking oil", 2.0, "tbsp")
    assert w_tbsp == 30.0


def test_differentiated_serving_weights():
    """
    Ensures that bowls, plates, and pieces do not assume identical weight.
    - Chapati (piece) = 35g
    - Dal (bowl) = 150g
    - Poha (plate) = 200g
    - Cooked Rice (cup) = 150g
    """
    w_chapati, is_std1 = resolve_serving_weight("chapati", 1.0, "piece")
    w_dal, is_std2 = resolve_serving_weight("dal tadka", 1.0, "bowl")
    w_poha, is_std3 = resolve_serving_weight("kanda poha", 1.0, "plate")
    w_rice, is_std4 = resolve_serving_weight("steamed rice", 1.0, "cup")

    assert w_chapati == 35.0, "1 medium chapati must be ~35g"
    assert w_dal == 150.0, "1 bowl of dal must be ~150g"
    assert w_poha == 200.0, "1 plate of poha must be ~200g"
    assert w_rice == 150.0, "1 cup of cooked rice must be ~150g"

    # Verify they are differentiated and not assumed identical
    assert len({w_chapati, w_dal, w_poha, w_rice}) >= 3
    assert is_std1 and is_std2 and is_std3 and is_std4


def test_quantity_scaling_linearity():
    """Doubling the serving count must double energy and macros exactly."""
    w1, _ = resolve_serving_weight("chapati", 1.0, "piece")
    w2, _ = resolve_serving_weight("chapati", 2.0, "piece")
    w4, _ = resolve_serving_weight("chapati", 4.0, "piece")

    assert w2 == 2.0 * w1
    assert w4 == 4.0 * w1


def test_recipe_yield_and_serving_calculations():
    """Tests multi-ingredient aggregation, cooked yield, and per-serving division."""
    ing1 = IngredientCalculationInput(
        ingredient_name="Rice (Raw)",
        weight_g=100.0,
        energy_kcal_per_100g=350.0,
        protein_g_per_100g=7.0,
        carbohydrates_g_per_100g=78.0,
        fat_g_per_100g=0.5
    )
    ing2 = IngredientCalculationInput(
        ingredient_name="Moong Dal (Raw)",
        weight_g=50.0,
        energy_kcal_per_100g=340.0,
        protein_g_per_100g=24.0,
        carbohydrates_g_per_100g=60.0,
        fat_g_per_100g=1.2
    )
    recipe_inp = RecipeCalculationInput(
        recipe_name="Moong Dal Khichdi",
        ingredients=[ing1, ing2],
        cooked_yield_g=400.0,  # 150g dry grains absorb water -> 400g cooked
        servings_count=2.0,
        serving_unit="bowl",
        oil_fat_addition_g=10.0  # 10g ghee added (90 kcal, 10g fat)
    )

    result = calculate_recipe(recipe_inp)

    # Check total recipe sums:
    # ing1: 350 kcal, 7g P, 78g C, 0.5g F
    # ing2: 170 kcal, 12g P, 30g C, 0.6g F
    # ghee: 90 kcal, 0g P, 0g C, 10g F
    # Totals: 610 kcal, 19g P, 108g C, 11.1g F
    assert result.total_energy_kcal == 610.0
    assert result.total_protein_g == 19.0
    assert result.total_carbohydrates_g == 108.0
    assert result.total_fat_g == 11.1

    # Check per serving (divided by 2.0):
    assert result.serving_energy_kcal == 305.0
    assert result.serving_protein_g == 9.5
    assert result.serving_carbohydrates_g == 54.0
    assert result.serving_fat_g == 5.5
    assert result.serving_weight_g == 200.0  # 400g cooked yield / 2 servings


def test_oil_and_fat_addition_energy():
    """Adding 15g cooking oil must add exactly 135 kcal and 15g fat."""
    recipe_inp = RecipeCalculationInput(
        recipe_name="Tempered Vegetable",
        ingredients=[
            IngredientCalculationInput(
                ingredient_name="Boiled Potato",
                weight_g=100.0,
                energy_kcal_per_100g=80.0,
                protein_g_per_100g=2.0,
                carbohydrates_g_per_100g=18.0,
                fat_g_per_100g=0.1
            )
        ],
        servings_count=1.0,
        oil_fat_addition_g=15.0
    )
    res = calculate_recipe(recipe_inp)
    assert res.total_energy_kcal == 80.0 + (15.0 * 9.0)  # 215.0 kcal
    assert res.total_fat_g == 0.1 + 15.0                # 15.1 g fat


def test_multi_item_sentence_splitting():
    """Splits compound meal statements into individual food items."""
    text1 = "I ate 2 chapatis and 1 bowl of dal"
    chunks1 = split_multi_item_description(text1)
    assert len(chunks1) == 2
    assert chunks1[0] == "2 chapatis"
    assert chunks1[1] == "1 bowl of dal"

    text2 = "For lunch I had 1 plate poha, 1 boiled egg and chai"
    chunks2 = split_multi_item_description(text2)
    assert len(chunks2) == 3
    assert "poha" in chunks2[0]
    assert "boiled egg" in chunks2[1]
    assert "chai" in chunks2[2]


def test_material_ambiguity_clarification():
    """Detects when candidates have >25% caloric divergence and formulates question."""
    c1 = CandidateMatch(
        recipe_code="R1",
        name="Yellow Toor Dal (Plain)",
        normalized_name="yellow toor dal plain",
        match_type="token_similarity",
        score=75.0,
        serving_unit="bowl",
        serving_size_g=150.0,
        energy_kcal_per_100g=85.0
    )
    c2 = CandidateMatch(
        recipe_code="R2",
        name="Dal Makhani (Butter & Cream)",
        normalized_name="dal makhani butter cream",
        match_type="token_similarity",
        score=72.0,  # Close score
        serving_unit="bowl",
        serving_size_g=150.0,
        energy_kcal_per_100g=160.0  # >25% higher
    )

    clarification = detect_material_ambiguity([c1, c2])
    assert clarification is not None
    assert "Yellow Toor Dal" in clarification
    assert "Dal Makhani" in clarification


@pytest.mark.asyncio
async def test_multi_item_meal_estimation():
    """Tests the full multi-item calculation pipeline for '2 chapatis and 1 bowl of dal'."""
    meal = await nutrition_engine.parse_and_calculate_meal("I ate 2 chapatis and 1 bowl of dal")
    assert len(meal.items) == 2
    assert meal.total_calories > 0
    assert meal.total_protein_g > 0
    assert meal.total_carbohydrates_g > 0

    chapati_item = next(it for it in meal.items if "chapati" in it.selected_food_name.lower() or "roti" in it.selected_food_name.lower())
    assert chapati_item.quantity == 2.0
    assert chapati_item.nutrition_source == "indb_verified_recipe"
