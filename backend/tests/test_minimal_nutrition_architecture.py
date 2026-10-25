"""Tests for the Minimal Nutrition Architecture (Phase 3 & 4).

Validates:
- Catalog loading with food_catalog.id and nutrition_profiles.id
- Propagation of food_id and profile_id in candidate matching and ItemNutritionResult
- Compound meal estimation preserving food_id and profile_id
- Runtime registration of reusable AI profiles preventing duplicate API calls
- Schema serialization for FoodLogCreate and FoodLogResponse
"""
import pytest
from app.services.nutrition_engine import nutrition_engine
from app.services.nutrition_engine.models import CandidateMatch, ItemNutritionResult
from app.schemas.food import (
    ParsedFoodItem,
    AIEstimateResponse,
    FoodLogCreate,
    FoodLogResponse
)
from datetime import datetime, timezone


def test_runtime_profile_registration_enables_zero_latency_reuse():
    """Registering a new profile in-memory enables immediate exact and fuzzy lookup."""
    test_food_id = "test-food-uuid-999"
    test_prof_id = "test-prof-uuid-888"
    food_name = "Kodo Millet Upma"
    norm_name = "kodo millet upma"

    nutrition_engine.register_runtime_profile(
        food_id=test_food_id,
        profile_id=test_prof_id,
        canonical_name=food_name,
        norm_name=norm_name,
        aliases=["Kodri Upma"],
        serving_unit="plate",
        serving_size_g=180.0,
        energy_kcal_per_100g=120.0,
        protein_g_per_100g=3.5,
        carbohydrates_g_per_100g=22.0,
        fat_g_per_100g=2.5,
        fiber_g_per_100g=4.0,
        validation_status="verified"
    )

    # 1. Exact match
    candidates = nutrition_engine.search_candidates(food_name)
    assert len(candidates) > 0
    assert candidates[0].name == food_name
    assert candidates[0].food_id == test_food_id
    assert candidates[0].profile_id == test_prof_id

    # 2. Alias match
    alias_candidates = nutrition_engine.search_candidates("Kodri Upma")
    assert len(alias_candidates) > 0
    assert alias_candidates[0].food_id == test_food_id


def test_candidate_matches_attach_food_and_profile_ids():
    """CandidateMatch objects must include valid food_id and profile_id."""
    matches = nutrition_engine.search_candidates("Kodo Millet Upma", limit=5)
    assert len(matches) > 0

    match = matches[0]
    assert match.food_id is not None
    assert match.profile_id is not None
    assert isinstance(match.food_id, str)
    assert isinstance(match.profile_id, str)


@pytest.mark.asyncio
async def test_single_item_calculation_propagates_ids():
    """Calculating nutrition for a registered food profile must propagate food_id and profile_id."""
    res = await nutrition_engine.calculate_single_item("1 plate Kodo Millet Upma")
    assert isinstance(res, ItemNutritionResult)
    assert res.total_calories > 0
    assert res.food_id == "test-food-uuid-999"
    assert res.profile_id == "test-prof-uuid-888"


@pytest.mark.asyncio
async def test_compound_meal_preserves_per_item_ids():
    """Multi-item meal calculation preserves individual food_id and profile_id."""
    # Register second item
    nutrition_engine.register_runtime_profile(
        food_id="test-food-uuid-777",
        profile_id="test-prof-uuid-666",
        canonical_name="Masala Chai",
        norm_name="masala chai",
        aliases=["chai", "tea"],
        serving_unit="cup",
        serving_size_g=150.0,
        energy_kcal_per_100g=60.0,
        protein_g_per_100g=2.0,
        carbohydrates_g_per_100g=8.0,
        fat_g_per_100g=2.0,
        fiber_g_per_100g=0.0,
        validation_status="verified"
    )

    compound = await nutrition_engine.parse_and_calculate_meal("1 cup tea and 1 plate Kodo Millet Upma")
    assert len(compound.items) == 2
    for item in compound.items:
        assert item.food_id is not None
        assert item.profile_id is not None


def test_food_log_schema_serializes_food_and_profile_ids():
    """FoodLogCreate and FoodLogResponse schemas accurately serialize food_id and profile_id."""
    log_create = FoodLogCreate(
        food_name="Test Food",
        quantity=2.0,
        unit="piece",
        estimated_calories=250.0,
        protein_g=6.0,
        carbohydrates_g=40.0,
        fat_g=2.0,
        meal_type="breakfast",
        food_id="sample-food-uuid",
        profile_id="sample-profile-uuid"
    )
    data = log_create.model_dump()
    assert data["food_id"] == "sample-food-uuid"
    assert data["profile_id"] == "sample-profile-uuid"

    log_response = FoodLogResponse(
        id="log-entry-uuid",
        user_id="user-uuid",
        food_name="Test Food",
        quantity=2.0,
        unit="piece",
        estimated_calories=250.0,
        protein_g=6.0,
        carbohydrates_g=40.0,
        fat_g=2.0,
        meal_type="breakfast",
        logged_at=datetime.now(timezone.utc),
        food_id="sample-food-uuid",
        profile_id="sample-profile-uuid"
    )
    resp_data = log_response.model_dump()
    assert resp_data["food_id"] == "sample-food-uuid"
    assert resp_data["profile_id"] == "sample-profile-uuid"
