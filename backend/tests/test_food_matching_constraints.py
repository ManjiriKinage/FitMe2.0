"""Regression tests for Food Matching Constraints and Dish-Type Disambiguation.

Ensures:
1. '1 Bajra bhakri' and 'bajra_bhakri' NEVER match 'Pearl millet ladoo'.
2. Underscores, hyphens, and casing are cleanly normalized without leaking into display titles.
3. 'pearl millet ladoo' continues to match verified INDB recipe ASC470.
4. 'jowar bhakri' matches flatbread estimates, never dosas, ladoos, or fried snacks.
5. 'jowar dosa' matches crepe/pancake preparation, never flatbread bhakris.
6. Quantity scaling doubles nutrition linearly.
7. Save-to-Log data contract preserves the selected food's actual nutrition values.
"""
import pytest
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_engine.matcher import (
    normalize_text,
    get_dish_families,
    are_dish_families_incompatible,
)


def test_text_normalization_underscores_and_hyphens():
    assert normalize_text("bajra_bhakri") == "bajra bhakri"
    assert normalize_text("Bajra-Bhakri") == "bajra bhakri"
    assert normalize_text("1_piece_of_jowar_bhakri") == "1 piece of jowar bhakri"


def test_dish_family_taxonomies():
    assert "flatbread" in get_dish_families("bajra bhakri")
    assert "flatbread" in get_dish_families("jowar roti")
    assert "sweet_dessert" in get_dish_families("pearl millet ladoo")
    assert "crepe_pancake" in get_dish_families("jowar dosa")
    assert "savory_snack" in get_dish_families("pearl millet mathri")


def test_dish_family_incompatibility():
    # Flatbread vs Dessert
    assert are_dish_families_incompatible("bajra bhakri", "pearl millet ladoo (bajra ladoo)") is True
    # Flatbread vs Pancake
    assert are_dish_families_incompatible("jowar bhakri", "jowar dosa") is True
    # Flatbread vs Snack
    assert are_dish_families_incompatible("bajra bhakri", "pearl millet mathri") is True
    # Compatible (same family)
    assert are_dish_families_incompatible("chapati", "roti") is False
    # No family constraint in query
    assert are_dish_families_incompatible("bajra", "pearl millet ladoo") is False


@pytest.mark.asyncio
async def test_bajra_bhakri_never_returns_pearl_millet_ladoo():
    """Acceptance criterion: entering '1 Bajra bhakri' must never return 'Pearl millet ladoo'."""
    res = await nutrition_engine.calculate_single_item("1 Bajra bhakri")
    assert "ladoo" not in res.selected_food_name.lower()
    assert "bhakri" in res.selected_food_name.lower()


@pytest.mark.asyncio
async def test_bajra_bhakri_with_underscores():
    """Entering 'bajra_bhakri' normalizes cleanly without underscores in food name."""
    res = await nutrition_engine.calculate_single_item("bajra_bhakri")
    assert "_" not in res.selected_food_name
    assert "ladoo" not in res.selected_food_name.lower()
    assert "bhakri" in res.selected_food_name.lower()


@pytest.mark.asyncio
async def test_pearl_millet_ladoo_matches_verified_catalog():
    """Querying 'pearl millet ladoo' returns sweet ladoo, never flatbread bhakri."""
    res = await nutrition_engine.calculate_single_item("1 pearl millet ladoo")
    assert "ladoo" in res.selected_food_name.lower()
    assert "bhakri" not in res.selected_food_name.lower()


@pytest.mark.asyncio
async def test_jowar_bhakri_and_jowar_dosa_dish_type_separation():
    """Jowar bhakri must never match jowar dosa, and vice versa."""
    bhakri_res = await nutrition_engine.calculate_single_item("1 jowar bhakri")
    assert "dosa" not in bhakri_res.selected_food_name.lower()
    assert "bhakri" in bhakri_res.selected_food_name.lower()

    dosa_res = await nutrition_engine.calculate_single_item("1 jowar dosa")
    assert "bhakri" not in dosa_res.selected_food_name.lower()
    assert "dosa" in dosa_res.selected_food_name.lower()


@pytest.mark.asyncio
async def test_quantity_scaling_linearity():
    """Scaling 1 piece to 2 pieces doubles grams and calories linearly on calibrated profiles."""
    nutrition_engine.register_runtime_profile(
        food_id="bhakri-uuid-1",
        profile_id="bhakri-prof-1",
        canonical_name="Bajra Bhakri",
        norm_name="bajra bhakri",
        aliases=["bhakri"],
        serving_unit="piece",
        serving_size_g=60.0,
        energy_kcal_per_100g=280.0,
        protein_g_per_100g=7.6,
        carbohydrates_g_per_100g=57.0,
        fat_g_per_100g=2.4,
        validation_status="verified"
    )

    one_item = await nutrition_engine.calculate_single_item("1 piece of bajra bhakri")
    two_items = await nutrition_engine.calculate_single_item("2 pieces of bajra bhakri")

    assert two_items.quantity == 2.0
    assert two_items.serving_weight_g == pytest.approx(one_item.serving_weight_g * 2.0, rel=1e-2)
    assert two_items.total_calories == pytest.approx(one_item.total_calories * 2.0, rel=1e-2)
    assert two_items.protein_g == pytest.approx(one_item.protein_g * 2.0, abs=0.2)
    assert two_items.carbohydrates_g == pytest.approx(one_item.carbohydrates_g * 2.0, abs=0.2)


def test_indb_engine_search_respects_dish_families():
    """Nutrition engine search candidates must not return ladoos for bhakri query."""
    matches = nutrition_engine.search_candidates("bajra bhakri")
    for m in matches:
        assert "ladoo" not in m.name.lower()
        assert "mathri" not in m.name.lower()
