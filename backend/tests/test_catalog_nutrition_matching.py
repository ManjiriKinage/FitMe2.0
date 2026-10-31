"""Unit tests for Supabase food catalog and nutrition profiles matching & Python calculations."""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from app.services.image_analysis_service import ImageAnalysisService
from app.schemas.meal_scan import DetectedFoodItem, RecalculateItemResponse


def create_mock_supabase_catalog_client(food_rows):
    """Creates a mock Supabase PostgREST client returning specified food catalog rows."""
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_client.table.return_value = mock_table
    
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    mock_eq = MagicMock()
    mock_select.eq.return_value = mock_eq
    mock_or = MagicMock()
    mock_eq.or_.return_value = mock_or
    mock_limit = MagicMock()
    mock_or.limit.return_value = mock_limit
    mock_execute = MagicMock()
    mock_limit.execute.return_value = mock_execute
    mock_execute.data = food_rows

    return mock_client


def test_match_canonical_name_and_per_100g_basis():
    """Matches canonical name and calculates exact calories, protein, carbs, fat, fiber in Python."""
    mock_food_id = "f00d0000-0000-0000-0000-000000000001"
    mock_profile_id = "pr0f0000-0000-0000-0000-000000000001"
    mock_food_rows = [
        {
            "id": mock_food_id,
            "canonical_name": "Chapati",
            "normalized_name": "chapati",
            "aliases": ["roti", "phulka", "rotli"],
            "category": "flatbread",
            "food_state": "cooked",
            "is_active": True,
            "nutrition_profiles": [
                {
                    "id": mock_profile_id,
                    "food_id": mock_food_id,
                    "preparation_method": "cooked",
                    "nutrition_basis": "per_100g",
                    "basis_weight_g": 100.0,
                    "energy_kcal": 242.0,
                    "protein_g": 7.4,
                    "carb_g": 50.0,
                    "fat_g": 1.1,
                    "fiber_g": 3.2,
                    "source_type": "nutrition_profile",
                    "validation_status": "verified"
                }
            ]
        }
    ]
    mock_client = create_mock_supabase_catalog_client(mock_food_rows)

    detected = ImageAnalysisService.calculate_detected_item_nutrition({
        "name": "Chapati",
        "estimated_weight_g": 70.0,
        "serving_quantity": 2.0,
        "serving_unit": "piece",
        "preparation": "cooked"
    }, client=mock_client)

    # 70g = 0.7 of 100g basis
    assert detected.food_id == mock_food_id
    assert detected.profile_id == mock_profile_id
    assert detected.estimated_calories == 169.4   # 242.0 * 0.7 = 169.4
    assert detected.protein_g == 5.2             # 7.4 * 0.7 = 5.18 -> 5.2
    assert detected.carbohydrates_g == 35.0      # 50.0 * 0.7 = 35.0
    assert detected.fat_g == 0.8                 # 1.1 * 0.7 = 0.77 -> 0.8
    assert detected.fiber_g == 2.2               # 3.2 * 0.7 = 2.24 -> 2.2
    assert detected.nutrition_source == "nutrition_profile"
    assert "Matched catalog profile" in detected.assumptions[1]


def test_match_alias_resolution():
    """Resolves food via aliases when detected name differs from canonical name."""
    mock_food_id = "f00d0000-0000-0000-0000-000000000002"
    mock_profile_id = "pr0f0000-0000-0000-0000-000000000002"
    mock_food_rows = [
        {
            "id": mock_food_id,
            "canonical_name": "Cooked White Rice",
            "normalized_name": "cooked white rice",
            "aliases": ["chawal", "bhat", "steamed rice", "plain rice"],
            "category": "grain",
            "food_state": "cooked",
            "is_active": True,
            "nutrition_profiles": [
                {
                    "id": mock_profile_id,
                    "food_id": mock_food_id,
                    "preparation_method": "steamed",
                    "nutrition_basis": "per_100g",
                    "basis_weight_g": 100.0,
                    "energy_kcal": 130.0,
                    "protein_g": 2.7,
                    "carb_g": 28.0,
                    "fat_g": 0.3,
                    "fiber_g": 0.4,
                    "source_type": "nutrition_profile",
                    "validation_status": "verified"
                }
            ]
        }
    ]
    mock_client = create_mock_supabase_catalog_client(mock_food_rows)

    # User photo detected as 'Bhat' with alias 'Chawal'
    detected = ImageAnalysisService.calculate_detected_item_nutrition({
        "name": "Bhat",
        "aliases": ["Chawal"],
        "estimated_weight_g": 150.0,
        "serving_quantity": 1.0,
        "serving_unit": "cup",
        "preparation": "steamed"
    }, client=mock_client)

    # 150g = 1.5 of 100g basis
    assert detected.food_id == mock_food_id
    assert detected.profile_id == mock_profile_id
    assert detected.canonical_name == "Cooked White Rice"
    assert detected.estimated_calories == 195.0   # 130.0 * 1.5 = 195.0
    assert detected.protein_g == 4.1             # 2.7 * 1.5 = 4.05 -> 4.1
    assert detected.carbohydrates_g == 42.0      # 28.0 * 1.5 = 42.0
    assert detected.fat_g == 0.4                 # round(0.3 * 1.5, 1) = 0.4 (round-half-to-even)
    assert detected.fiber_g == 0.6               # 0.4 * 1.5 = 0.6


def test_match_preparation_method_variants():
    """Selects specific nutrition profile matching the preparation method (e.g. fried vs steamed)."""
    mock_food_id = "f00d0000-0000-0000-0000-000000000003"
    profile_steamed = "pr0f0000-0000-0000-0000-00000000000a"
    profile_fried = "pr0f0000-0000-0000-0000-00000000000b"
    mock_food_rows = [
        {
            "id": mock_food_id,
            "canonical_name": "Momos",
            "normalized_name": "momos",
            "aliases": ["dim sum", "dumplings"],
            "category": "snack",
            "is_active": True,
            "nutrition_profiles": [
                {
                    "id": profile_steamed,
                    "food_id": mock_food_id,
                    "preparation_method": "steamed",
                    "nutrition_basis": "per_100g",
                    "basis_weight_g": 100.0,
                    "energy_kcal": 140.0,
                    "protein_g": 5.0,
                    "carb_g": 24.0,
                    "fat_g": 2.5,
                    "fiber_g": 1.0,
                    "validation_status": "verified"
                },
                {
                    "id": profile_fried,
                    "food_id": mock_food_id,
                    "preparation_method": "deep_fried",
                    "nutrition_basis": "per_100g",
                    "basis_weight_g": 100.0,
                    "energy_kcal": 280.0,
                    "protein_g": 5.0,
                    "carb_g": 26.0,
                    "fat_g": 16.0,
                    "fiber_g": 1.0,
                    "validation_status": "verified"
                }
            ]
        }
    ]
    mock_client = create_mock_supabase_catalog_client(mock_food_rows)

    # 1. Steamed preparation
    detected_steamed = ImageAnalysisService.calculate_detected_item_nutrition({
        "name": "Momos",
        "estimated_weight_g": 100.0,
        "preparation": "steamed"
    }, client=mock_client)
    assert detected_steamed.profile_id == profile_steamed
    assert detected_steamed.estimated_calories == 140.0
    assert detected_steamed.fat_g == 2.5

    # 2. Deep fried preparation
    detected_fried = ImageAnalysisService.calculate_detected_item_nutrition({
        "name": "Momos",
        "estimated_weight_g": 100.0,
        "preparation": "deep_fried"
    }, client=mock_client)
    assert detected_fried.profile_id == profile_fried
    assert detected_fried.estimated_calories == 280.0
    assert detected_fried.fat_g == 16.0


def test_match_per_serving_nutrition_basis():
    """Calculates scaling correctly when profile uses per_serving basis instead of per_100g."""
    mock_food_id = "f00d0000-0000-0000-0000-000000000004"
    mock_profile_id = "pr0f0000-0000-0000-0000-000000000004"
    mock_food_rows = [
        {
            "id": mock_food_id,
            "canonical_name": "Gulab Jamun",
            "normalized_name": "gulab jamun",
            "aliases": ["jamun"],
            "category": "sweet",
            "is_active": True,
            "nutrition_profiles": [
                {
                    "id": mock_profile_id,
                    "food_id": mock_food_id,
                    "preparation_method": "standard",
                    "nutrition_basis": "per_serving",
                    "basis_weight_g": 50.0,   # 1 piece = 50g
                    "energy_kcal": 150.0,
                    "protein_g": 2.5,
                    "carb_g": 25.0,
                    "fat_g": 5.0,
                    "fiber_g": 0.2,
                    "validation_status": "verified"
                }
            ]
        }
    ]
    mock_client = create_mock_supabase_catalog_client(mock_food_rows)

    # 2 pieces = 100g total (factor = 100.0 / 50.0 = 2.0)
    detected = ImageAnalysisService.calculate_detected_item_nutrition({
        "name": "Gulab Jamun",
        "estimated_weight_g": 100.0,
        "serving_quantity": 2.0,
        "serving_unit": "piece"
    }, client=mock_client)

    assert detected.estimated_calories == 300.0   # 150.0 * 2.0
    assert detected.protein_g == 5.0              # 2.5 * 2.0
    assert detected.carbohydrates_g == 50.0       # 25.0 * 2.0
    assert detected.fat_g == 10.0                 # 5.0 * 2.0
    assert detected.fiber_g == 0.4                # 0.2 * 2.0


@pytest.mark.asyncio
async def test_ai_estimation_fallback_for_uncataloged_food():
    """Uncataloged food uses AI / clinical baseline fallback with explicit assumptions and uncertainty."""
    from unittest.mock import AsyncMock, patch
    from app.services.nutrition_engine.models import ItemNutritionResult

    mock_ai_result = ItemNutritionResult(
        selected_food_name="Exotic Quinoa Avocado Salad",
        quantity=1.0,
        serving_unit="bowl",
        serving_weight_g=120.0,
        total_calories=150.0,
        protein_g=4.0,
        carbohydrates_g=20.0,
        fat_g=6.0,
        fiber_g=3.0,
        nutrition_source="ai_estimation",
        calculation_method="ai_heuristic_interpretation",
        validation_status="unverified_estimate",
        uncertainty_flags=["Uncataloged item: calculated via AI fallback."],
        missing_data_fields=[],
        clarification_question=None,
        needs_user_confirmation=True,
        alternative_candidates=[]
    )
    with patch("app.services.image_analysis_service.interpret_with_ai", new=AsyncMock(return_value=mock_ai_result)):
        mock_client = create_mock_supabase_catalog_client([])  # Empty catalog

        detected = await ImageAnalysisService.match_and_calculate_item_nutrition({
            "name": "Exotic Quinoa Avocado Salad",
            "estimated_weight_g": 120.0,
            "serving_quantity": 1.0,
            "serving_unit": "bowl",
            "preparation": "raw"
        }, client=mock_client)

        # Must NOT invent verified nutrition values
        assert detected.food_id is None
        assert detected.profile_id is None
        assert detected.nutrition_source in ("ai_estimation", "clinical_heuristic")
        assert detected.estimated_calories > 0
        assert detected.uncertainty is not None
        assert "not found in verified food catalog" in detected.uncertainty
        assert any("no verified catalog profile" in a for a in detected.assumptions)


def test_recalculate_item_uses_supabase_catalog_and_profiles():
    """Recalculating item portion passes Supabase client and computes instant Python math."""
    mock_food_id = "f00d0000-0000-0000-0000-000000000005"
    mock_profile_id = "pr0f0000-0000-0000-0000-000000000005"
    mock_food_rows = [
        {
            "id": mock_food_id,
            "canonical_name": "Bajra Bhakri",
            "normalized_name": "bajra bhakri",
            "aliases": ["bhakri", "pearl millet flatbread"],
            "category": "flatbread",
            "is_active": True,
            "nutrition_profiles": [
                {
                    "id": mock_profile_id,
                    "food_id": mock_food_id,
                    "preparation_method": "roasted",
                    "nutrition_basis": "per_100g",
                    "basis_weight_g": 100.0,
                    "energy_kcal": 280.0,
                    "protein_g": 7.6,
                    "carb_g": 57.0,
                    "fat_g": 2.4,
                    "fiber_g": 4.5,
                    "validation_status": "verified"
                }
            ]
        }
    ]
    mock_client = create_mock_supabase_catalog_client(mock_food_rows)

    resp = ImageAnalysisService.recalculate_item(
        food_name="Bajra Bhakri",
        quantity=1.0,
        unit="piece",
        preparation="roasted",
        weight_g=60.0,
        client=mock_client
    )

    # 60g = 0.6 * per 100g
    assert resp.food_id == mock_food_id
    assert resp.profile_id == mock_profile_id
    assert resp.estimated_calories == 168.0   # 280.0 * 0.6 = 168.0
    assert resp.protein_g == 4.6             # 7.6 * 0.6 = 4.56 -> 4.6
    assert resp.carbohydrates_g == 34.2      # 57.0 * 0.6 = 34.2
    assert resp.fat_g == 1.4                 # 2.4 * 0.6 = 1.44 -> 1.4
    assert resp.fiber_g == 2.7               # 4.5 * 0.6 = 2.7
    assert resp.nutrition_source == "nutrition_profile"
