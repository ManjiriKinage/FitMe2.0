"""Unit tests for calorie calculator engine."""
import pytest
from app.services.calorie_calculator import (
    calculate_bmr,
    calculate_bmi,
    calculate_calories,
    calculate_macro_split
)
from app.schemas.user import CalorieCalculationInput

def test_bmi_calculation():
    # 70kg, 175cm -> 70 / (1.75 * 1.75) = 22.86 -> Normal
    bmi, category = calculate_bmi(70, 175)
    assert round(bmi, 1) == 22.9
    assert category == "Normal weight"

    # Underweight
    bmi_under, cat_under = calculate_bmi(45, 170)
    assert bmi_under < 18.5
    assert cat_under == "Underweight"

    # Overweight
    bmi_over, cat_over = calculate_bmi(85, 170)
    assert 25.0 <= bmi_over < 30.0
    assert cat_over == "Overweight"

def test_mifflin_st_jeor_bmr():
    # Male: 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
    bmr_m = calculate_bmr(80, 180, 30, "male")
    assert bmr_m == 1780.0

    # Female: 10 * 60 + 6.25 * 165 - 5 * 28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25
    bmr_f = calculate_bmr(60, 165, 28, "female")
    assert bmr_f == 1330.25

def test_weight_loss_calorie_target():
    data = CalorieCalculationInput(
        age=25,
        gender="male",
        height_cm=180,
        current_weight_kg=85,
        activity_level="moderately_active",
        fitness_goal="lose_weight"
    )
    result = calculate_calories(data)
    # Target should be less than TDEE with a moderate deficit
    assert result.daily_calorie_target < result.tdee
    assert result.daily_calorie_target >= 1500  # Male minimum safety floor
    assert result.bmi_category in ["Normal weight", "Overweight", "Obesity range"]

def test_gain_muscle_conservative_surplus():
    data = CalorieCalculationInput(
        age=24,
        gender="female",
        height_cm=165,
        current_weight_kg=55,
        activity_level="lightly_active",
        fitness_goal="gain_muscle"
    )
    result = calculate_calories(data)
    # Muscle gain target should have conservative surplus
    assert result.daily_calorie_target > result.tdee
    assert "muscle protein synthesis" in result.explanation.lower()

def test_under_18_warning():
    data = CalorieCalculationInput(
        age=16,
        gender="female",
        height_cm=160,
        current_weight_kg=50,
        activity_level="sedentary",
        fitness_goal="lose_weight"
    )
    result = calculate_calories(data)
    assert len(result.warnings) > 0
    assert "under 18" in result.warnings[0].lower()
