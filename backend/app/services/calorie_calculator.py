"""Calorie recommendation engine using Mifflin-St Jeor equation and evidence-based clinical guidance."""
from typing import Dict, Any, List
from app.schemas.user import CalorieCalculationInput, CalorieCalculationResult

# Standard Harris-Benedict / Mifflin-St Jeor activity multipliers
ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,           # Little or no exercise, desk job
    "light": 1.375,
    "lightly_active": 1.375,    # Light exercise/sports 1-3 days/week
    "moderate": 1.55,
    "moderately_active": 1.55,  # Moderate exercise/sports 3-5 days/week
    "very_active": 1.725,       # Hard exercise/sports 6-7 days a week
    "extra_active": 1.9         # Very hard exercise, physical job or 2x training
}

# Clinical absolute floor recommendations (NIH, NHS, WHO guidelines)
MIN_CALORIES_MALE = 1500
MIN_CALORIES_FEMALE = 1200
MIN_CALORIES_DEFAULT = 1350

def calculate_bmi(weight_kg: float, height_cm: float) -> tuple[float, str]:
    """Calculate BMI and return value with contextual category."""
    height_m = height_cm / 100.0
    bmi = round(weight_kg / (height_m * height_m), 1)
    
    if bmi < 18.5:
        category = "Underweight"
    elif bmi < 25.0:
        category = "Normal weight"
    elif bmi < 30.0:
        category = "Overweight"
    else:
        category = "Obesity range"
        
    return bmi, category

def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """
    Mifflin-St Jeor Equation:
    Male:   10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) + 5
    Female: 10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) - 161
    Other/Neutral: Midpoint average offset (-78)
    """
    base = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age)
    if gender == "male":
        return base + 5.0
    elif gender == "female":
        return base - 161.0
    else:
        # For non-binary, other, or prefer not to say, use midpoint
        return base - 78.0

PACE_VALUES = {
    "slow": 0.25,
    "steady": 0.5,
    "faster": 0.75
}

def calculate_macro_split(daily_calories: int, goal: str, weight_kg: float) -> Dict[str, float]:
    """
    Computes evidence-based macronutrient targets in whole grams:
    - protein = 1.6 g/kg when losing, 1.2 g/kg otherwise
    - fats = 25% of target calories / 9
    - carbs = remaining calories / 4
    """
    is_losing = goal in ("lose", "lose_weight")
    protein_mult = 1.6 if is_losing else 1.2
    protein_g = round(weight_kg * protein_mult)
    fat_g = round((daily_calories * 0.25) / 9.0)
    remaining_cals = (daily_calories * 0.75) - (protein_g * 4.0)
    carbs_g = max(0, round(remaining_cals / 4.0))

    return {
        "protein_g": float(protein_g),
        "carbohydrates_g": float(carbs_g),
        "fat_g": float(fat_g)
    }

def calculate_calories(data: CalorieCalculationInput) -> CalorieCalculationResult:
    """
    Calculates estimated BMR, TDEE, and safe personalized daily calorie intake
    using pure Mifflin-St Jeor and pace calculations.
    """
    warnings: List[str] = []
    
    # 1. Age Safety Check
    if data.age < 18:
        warnings.append(
            "Users under 18 years of age are in key developmental stages. Standard adult calorie equations "
            "do not account for adolescent growth velocity. Please consult a qualified pediatrician or dietitian."
        )

    # 2. BMR & TDEE Calculations
    bmr_val = calculate_bmr(data.current_weight_kg, data.height_cm, data.age, data.gender)
    multiplier = ACTIVITY_MULTIPLIERS.get(data.activity_level, 1.55)
    tdee_val = bmr_val * multiplier

    # 3. Pace and Deficit/Surplus (pace * 7700 / 7 = pace * 1100)
    pace_kg = PACE_VALUES.get(data.pace, 0.5)
    daily_change = round(pace_kg * 1100)

    is_losing = data.fitness_goal in ("lose", "lose_weight")
    is_gaining = data.fitness_goal in ("gain", "gain_weight", "gain_muscle")

    explanation_parts = []
    if is_losing:
        target = tdee_val - daily_change
        explanation_parts.append(
            f"Set a daily deficit of {daily_change} kcal below TDEE ({pace_kg} kg/week pace)."
        )
    elif is_gaining:
        target = tdee_val + daily_change
        note = " to support muscle protein synthesis." if data.fitness_goal == "gain_muscle" else "."
        explanation_parts.append(
            f"Set a daily surplus of {daily_change} kcal above TDEE ({pace_kg} kg/week pace){note}"
        )
    else:
        target = tdee_val
        explanation_parts.append("Target set to maintenance (TDEE).")

    # 4. Safety floor: never below 1200 (female) or 1500 (male), and never below BMR
    abs_floor = 1500.0 if data.gender == "male" else 1200.0
    safety_floor = max(abs_floor, bmr_val)
    if target < safety_floor:
        target = safety_floor
        warnings.append(
            f"Safety floor applied: target cannot be below {int(safety_floor)} kcal/day."
        )

    final_target = int(round(target))
    bmr_int = int(round(bmr_val))
    tdee_int = int(round(tdee_val))
    bmi, bmi_category = calculate_bmi(data.current_weight_kg, data.height_cm)

    explanation = (
        f"Based on Mifflin-St Jeor, BMR is ~{bmr_int} kcal/day and TDEE is ~{tdee_int} kcal/day. "
        + " ".join(explanation_parts)
    )

    macro_targets = calculate_macro_split(final_target, data.fitness_goal, data.current_weight_kg)

    return CalorieCalculationResult(
        bmr=bmr_int,
        tdee=tdee_int,
        daily_calorie_target=final_target,
        bmi=bmi,
        bmi_category=bmi_category,
        macro_targets=macro_targets,
        explanation=explanation,
        warnings=warnings
    )
