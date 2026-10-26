"""Unit tests for food estimation and daily nutrition aggregation."""
import pytest
from app.services.food_ai import heuristic_estimate
from app.services.nutrition_service import aggregate_daily_dashboard

def test_indian_food_heuristic_chapati():
    res = heuristic_estimate("2 medium chapatis")
    assert res.quantity == 2.0
    assert "Chapati" in res.food_name or "chapatis" in res.food_name.lower()
    # 2 * 85 = 170 cals
    assert res.estimated_calories == 170.0
    assert res.protein_g > 0
    assert res.carbohydrates_g > 0

def test_indian_food_heuristic_dal():
    res = heuristic_estimate("1 bowl of dal")
    assert res.quantity == 1.0
    assert res.estimated_calories == 140.0
    assert res.protein_g == 8.0

def test_daily_dashboard_aggregation():
    target = 2000
    food_logs = [
        {
            "id": "1",
            "user_id": "u1",
            "food_name": "Poha",
            "quantity": 1,
            "unit": "plate",
            "estimated_calories": 260.0,
            "protein_g": 4.5,
            "carbohydrates_g": 46.0,
            "fat_g": 6.5,
            "meal_type": "breakfast",
            "logged_at": "2026-10-23T08:30:00Z"
        },
        {
            "id": "2",
            "user_id": "u1",
            "food_name": "Paneer Bhurji & Roti",
            "quantity": 1,
            "unit": "serving",
            "estimated_calories": 450.0,
            "protein_g": 20.0,
            "carbohydrates_g": 35.0,
            "fat_g": 22.0,
            "meal_type": "lunch",
            "logged_at": "2026-10-23T13:00:00Z"
        }
    ]

    summary = aggregate_daily_dashboard(
        daily_calorie_target=target,
        food_logs=food_logs,
        target_date="2026-10-23"
    )

    assert summary.calories_consumed == 710.0
    assert summary.calories_remaining == 1290.0
    assert len(summary.meals["breakfast"]) == 1
    assert len(summary.meals["lunch"]) == 1
    assert len(summary.meals["dinner"]) == 0
    assert summary.macro_totals.protein_g == 24.5

def test_daily_dashboard_exceeded_target_non_negative():
    target = 1500
    food_logs = [
        {
            "id": "1",
            "user_id": "u1",
            "food_name": "Feast",
            "quantity": 1,
            "unit": "meal",
            "estimated_calories": 1800.0,
            "protein_g": 50.0,
            "carbohydrates_g": 150.0,
            "fat_g": 80.0,
            "meal_type": "dinner",
            "logged_at": "2026-10-23T20:00:00Z"
        }
    ]

    summary = aggregate_daily_dashboard(
        daily_calorie_target=target,
        food_logs=food_logs,
        target_date="2026-10-23"
    )

    # Calories remaining must not be negative
    assert summary.calories_remaining == 0.0
    assert summary.calories_consumed == 1800.0


def test_batch_food_log_request_validation():
    from app.schemas.food import BatchFoodLogRequest
    req = BatchFoodLogRequest(
        meal_type="dinner",
        items=[
            {
                "food_name": "Chapati",
                "quantity": 2.0,
                "unit": "piece",
                "estimated_calories": 210.0,
                "protein_g": 6.0,
                "carbohydrates_g": 36.0,
                "fat_g": 4.5
            },
            {
                "food_name": "Dal",
                "quantity": 1.0,
                "unit": "bowl",
                "estimated_calories": 116.0,
                "protein_g": 6.8,
                "carbohydrates_g": 16.5,
                "fat_g": 2.2,
                "meal_type": "dinner"
            }
        ]
    )
    assert len(req.items) == 2
    assert req.items[0].estimated_calories == 210.0
    assert req.items[1].meal_type == "dinner"
