export type GenderType = "male" | "female" | "other" | "prefer_not_to_say";
export type ActivityLevelType = "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extra_active";
export type FitnessGoalType = "lose_weight" | "maintain_weight" | "gain_muscle" | "gain_weight";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface UserProfile {
  id: string;
  full_name: string;
  age: number;
  gender: GenderType;
  height_cm: number;
  current_weight_kg: number;
  activity_level: ActivityLevelType;
  fitness_goal: FitnessGoalType;
  target_weight_kg?: number | null;
  daily_calorie_target: number;
  bmr?: number | null;
  tdee?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface MacroTargets {
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
}

export interface CalorieCalculationResult {
  bmr: number;
  tdee: number;
  daily_calorie_target: number;
  bmi: number;
  bmi_category: string;
  macro_targets: MacroTargets;
  explanation: string;
  warnings: string[];
}

export interface AIEstimateResponse {
  food_name: string;
  quantity: number;
  unit: string;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  assumptions: string;
  uncertainty_note?: string | null;
  clarification_question?: string | null;
}

export interface FoodLogItem {
  id: string;
  user_id: string;
  food_name: string;
  quantity: number;
  unit: string;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  meal_type: MealType;
  logged_at: string;
  created_at?: string;
}

export interface DailyMacroTotals {
  calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
}

export interface DashboardSummary {
  date: string;
  daily_calorie_target: number;
  calories_consumed: number;
  calories_remaining: number;
  percentage_consumed: number;
  macro_totals: DailyMacroTotals;
  macro_targets?: MacroTargets;
  meals: Record<MealType, FoodLogItem[]>;
}

export interface GoalRecalculateResponse {
  previous_daily_calorie_target: number;
  new_daily_calorie_target: number;
  difference: number;
  calculation_details: CalorieCalculationResult;
  change_reasons: string[];
}
