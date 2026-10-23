"""Calorie recommendation engine using Mifflin-St Jeor equation and evidence-based clinical guidance."""
from typing import Dict, Any, List
from app.schemas.user import CalorieCalculationInput, CalorieCalculationResult

# Standard Harris-Benedict / Mifflin-St Jeor activity multipliers
ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,           # Little or no exercise, desk job
    "lightly_active": 1.375,    # Light exercise/sports 1-3 days/week
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

def calculate_macro_split(daily_calories: int, goal: str, weight_kg: float) -> Dict[str, float]:
    """
    Computes evidence-based macronutrient targets in grams.
    Protein (4 kcal/g), Carbohydrates (4 kcal/g), Fat (9 kcal/g).
    """
    if goal == "gain_muscle":
        # Resistance training focus: 1.8g - 2.0g protein / kg bodyweight
        protein_g = round(min(weight_kg * 2.0, daily_calories * 0.30 / 4.0), 1)
        fat_calories = daily_calories * 0.25
        fat_g = round(fat_calories / 9.0, 1)
        carb_calories = daily_calories - (protein_g * 4.0) - fat_calories
        carbs_g = round(max(50.0, carb_calories / 4.0), 1)
    elif goal == "lose_weight":
        # Preserve lean mass with slightly higher protein ratio (~28%)
        protein_calories = daily_calories * 0.28
        protein_g = round(protein_calories / 4.0, 1)
        fat_calories = daily_calories * 0.27
        fat_g = round(fat_calories / 9.0, 1)
        carbs_g = round((daily_calories - protein_calories - fat_calories) / 4.0, 1)
    elif goal == "gain_weight":
        # Calorie surplus with balanced high carb / moderate fat
        protein_calories = daily_calories * 0.20
        protein_g = round(protein_calories / 4.0, 1)
        fat_calories = daily_calories * 0.25
        fat_g = round(fat_calories / 9.0, 1)
        carbs_g = round((daily_calories - protein_calories - fat_calories) / 4.0, 1)
    else: # maintain_weight
        # Standard balanced distribution (20% P, 30% F, 50% C)
        protein_g = round((daily_calories * 0.20) / 4.0, 1)
        fat_g = round((daily_calories * 0.30) / 9.0, 1)
        carbs_g = round((daily_calories * 0.50) / 4.0, 1)

    return {
        "protein_g": protein_g,
        "carbohydrates_g": carbs_g,
        "fat_g": fat_g
    }

def calculate_calories(data: CalorieCalculationInput) -> CalorieCalculationResult:
    """
    Calculates estimated BMR, TDEE, and safe personalized daily calorie intake.
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
    multiplier = ACTIVITY_MULTIPLIERS.get(data.activity_level, 1.2)
    tdee_val = bmr_val * multiplier

    # 3. Goal-Specific Adjustments
    explanation_parts = []
    
    if data.fitness_goal == "lose_weight":
        # Moderate, sustainable deficit of ~20% (capped around 400-500 kcal)
        deficit = min(500.0, max(300.0, tdee_val * 0.20))
        target = tdee_val - deficit
        explanation_parts.append(
            f"Set a moderate, sustainable daily deficit of {int(deficit)} kcal below your estimated maintenance (TDEE) "
            "to support steady fat loss while preserving metabolic health and muscle mass."
        )
    elif data.fitness_goal == "gain_muscle":
        # Conservative surplus of ~10% (150 - 300 kcal) with resistance training
        surplus = min(300.0, max(150.0, tdee_val * 0.10))
        target = tdee_val + surplus
        explanation_parts.append(
            f"Provided a conservative surplus of {int(surplus)} kcal above maintenance to support muscle protein synthesis. "
            "Muscle gain requires consistent resistance training and adequate dietary protein alongside energy intake, rather than excessive calorie surpluses."
        )
    elif data.fitness_goal == "gain_weight":
        # Gradual surplus of ~15% (300 - 450 kcal)
        surplus = min(450.0, max(300.0, tdee_val * 0.15))
        target = tdee_val + surplus
        explanation_parts.append(
            f"Calculated a gradual energy surplus of {int(surplus)} kcal above maintenance for steady, healthy weight gain."
        )
    else:  # maintain_weight
        target = tdee_val
        explanation_parts.append(
            "Target set to estimated maintenance energy requirement (TDEE) to preserve your current weight and body composition."
        )

    # 4. Safe Minimum Floor Enforcement
    min_floor = MIN_CALORIES_MALE if data.gender == "male" else (
        MIN_CALORIES_FEMALE if data.gender == "female" else MIN_CALORIES_DEFAULT
    )
    if target < min_floor:
        target = min_floor
        warnings.append(
            f"To prevent malnutrition and metabolic slowdown, target is safely capped at the evidence-based minimum of {min_floor} kcal/day."
        )

    final_target = int(round(target))
    bmr_int = int(round(bmr_val))
    tdee_int = int(round(tdee_val))
    bmi, bmi_category = calculate_bmi(data.current_weight_kg, data.height_cm)

    explanation = (
        f"Based on the Mifflin-St Jeor equation, your Basal Metabolic Rate (BMR) is ~{bmr_int} kcal/day. "
        f"Factoring in your {data.activity_level.replace('_', ' ')} routine, your estimated maintenance (TDEE) is ~{tdee_int} kcal/day. "
        + " ".join(explanation_parts) +
        " (Note: BMI and calorie calculations are estimates for informational guidance, not formal clinical prescriptions)."
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
