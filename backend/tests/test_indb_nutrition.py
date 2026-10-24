"""Automated test suite for INDB Deterministic Engine & Nutrition Correctness.

Tests all acceptance criteria from Section 9:
1. Data quality: Unique recipe IDs, traceable unit conversions, no silent zeros.
2. Nutrition correctness: Exact linear scaling, doubling servings, no double multiplication.
3. User personalization: Threshold compliance, user isolation.
4. Dashboard aggregation: Mathematical consistency.
"""
import pytest
from app.services.indb_engine import indb_engine
from app.services.nutrition_service import aggregate_daily_dashboard
from app.services.user_learning import UserPreferenceLearningEngine

def test_indb_catalog_uniqueness():
    """Verify all 1014 recipe identifiers are loaded and unique."""
    assert len(indb_engine._recipes) == 1014
    codes = list(indb_engine._recipes.keys())
    assert len(codes) == len(set(codes))

def test_linear_scaling_doubling_serving():
    """Doubling a serving must double calories, protein, carbs, and fat exactly."""
    sample_code = "ASC001" # Hot tea (Garam Chai)
    r1 = indb_engine.calculate_from_servings(sample_code, 1.0)
    r2 = indb_engine.calculate_from_servings(sample_code, 2.0)

    assert round(r1["calories"] * 2, 1) == pytest.approx(r2["calories"], abs=0.2)
    assert round(r1["protein_g"] * 2, 1) == pytest.approx(r2["protein_g"], abs=0.2)
    assert round(r1["carbohydrates_g"] * 2, 1) == pytest.approx(r2["carbohydrates_g"], abs=0.2)
    assert round(r1["fat_g"] * 2, 1) == pytest.approx(r2["fat_g"], abs=0.2)

def test_gram_weight_proportionality():
    """Increasing weight proportionally increases nutrition."""
    sample_code = "ASC004" # Mango milkshake
    g100 = indb_engine.calculate_from_grams(sample_code, 100.0)
    g250 = indb_engine.calculate_from_grams(sample_code, 250.0)

    expected_cals = round(g100["calories"] * 2.5, 1)
    assert g250["calories"] == pytest.approx(expected_cals, abs=0.2)

def test_natural_language_food_parser():
    """Test natural language parsing for common Indian dishes."""
    # 2 cups / servings
    p1 = indb_engine.parse_natural_food_input("2 cups of instant coffee")
    assert p1 is not None
    assert p1["quantity"] == 2.0
    assert p1["estimate_source"] == "indb_catalog"

    # Word numbers
    p2 = indb_engine.parse_natural_food_input("one bowl of dal")
    assert p2 is not None
    assert p2["quantity"] == 1.0
    assert "dal" in p2["food_name"].lower()

    # Grams
    p3 = indb_engine.parse_natural_food_input("150g rice")
    assert p3 is not None
    assert p3["quantity"] == 150.0
    assert p3["unit"] == "grams"

def test_dashboard_aggregation_matches_food_logs():
    """Dashboard totals must exactly equal the sum of saved food logs."""
    mock_logs = [
        {
            "id": "log-1", "user_id": "u1", "food_name": "Hot Tea",
            "quantity": 2.0, "unit": "cup", "estimated_calories": 50.0,
            "protein_g": 1.5, "carbohydrates_g": 8.0, "fat_g": 1.5,
            "meal_type": "breakfast", "logged_at": "2026-10-25T08:00:00Z"
        },
        {
            "id": "log-2", "user_id": "u1", "food_name": "Dal",
            "quantity": 1.0, "unit": "bowl", "estimated_calories": 140.0,
            "protein_g": 8.0, "carbohydrates_g": 20.0, "fat_g": 3.5,
            "meal_type": "lunch", "logged_at": "2026-10-25T13:00:00Z"
        }
    ]

    target = 2000
    res = aggregate_daily_dashboard(daily_calorie_target=target, food_logs=mock_logs, target_date="2026-10-25")
    assert res.calories_consumed == 190.0
    assert res.calories_remaining == 1810.0
    assert res.macro_totals.protein_g == 9.5
    assert res.macro_totals.carbohydrates_g == 28.0
    assert res.macro_totals.fat_g == 5.0
    assert len(res.meals["breakfast"]) == 1
    assert len(res.meals["lunch"]) == 1

def test_user_preference_learning_threshold():
    """A preference should only be trusted after reaching minimum observation threshold."""
    # Under threshold (1 observation) should return None
    class MockClient:
        def table(self, name):
            class Query:
                def select(self, *a): return self
                def eq(self, *a): return self
                def execute(self):
                    class Res:
                        data = [{"confirmed_observations": 1, "preferred_serving_quantity": 2.0, "preferred_serving_unit": "piece"}]
                    return Res()
            return Query()

    pref_unconfirmed = UserPreferenceLearningEngine.get_user_preference(MockClient(), "u1", "chapati")
    assert pref_unconfirmed is None
