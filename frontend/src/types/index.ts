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

export interface ParsedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g?: number | null;
  serving_weight_g?: number | null;
  nutrition_source?: string | null;
  calculation_method?: string | null;
  clarification_question?: string | null;
  uncertainty_note?: string | null;
  assumptions?: string | null;
  validation_status?: string | null;
  food_id?: string | null;
  profile_id?: string | null;
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
  items?: ParsedFoodItem[];
  has_ambiguity?: boolean;
  needs_user_confirmation?: boolean;
  validation_status?: string | null;
}

export interface RecipeSearchResult {
  source_recipe_code: string;
  name: string;
  normalized_name: string;
  reported_serving_unit: string;
  reported_serving_size_g: number;
  serving_energy_kcal?: number | null;
  reported_energy_kcal_per_100g: number;
  reported_protein_g_per_100g?: number | null;
  reported_carbohydrates_g_per_100g?: number | null;
  reported_fat_g_per_100g?: number | null;
}

export interface RecipeDetailResponse {
  source_recipe_code: string;
  name: string;
  normalized_name: string;
  aliases: string[];
  reported_serving_unit: string;
  reported_serving_size_g: number;
  serving_energy_kcal?: number | null;
  serving_protein_g?: number | null;
  serving_carbohydrates_g?: number | null;
  serving_fat_g?: number | null;
  reported_energy_kcal_per_100g: number;
  reported_protein_g_per_100g?: number | null;
  reported_carbohydrates_g_per_100g?: number | null;
  reported_fat_g_per_100g?: number | null;
  reported_fiber_g_per_100g?: number | null;
}

export interface UserPreferenceItem {
  id: string;
  user_id: string;
  food_name: string;
  normalized_food_name: string;
  preferred_serving_quantity: number;
  preferred_serving_unit: string;
  preferred_serving_weight_g?: number | null;
  observation_count: number;
  confidence_score: number;
  is_explicit_override: boolean;
  last_used_at?: string;
  created_at?: string;
}

export interface BatchFoodLogConfirmRequest {
  meal_type: MealType;
  items: {
    food_name: string;
    quantity: number;
    unit: string;
    estimated_calories: number;
    protein_g: number;
    carbohydrates_g: number;
    fat_g: number;
    meal_type?: MealType;
    food_id?: string | null;
    profile_id?: string | null;
  }[];
  logged_at?: string;
}

export interface BatchFoodLogConfirmResponse {
  success: boolean;
  saved_count: number;
  total_calories: number;
  message: string;
  saved_logs: FoodLogItem[];
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

// AI Plate Scanner & Vision Types
export interface DetectedFoodItem {
  id: string;
  name: string;
  canonical_name?: string | null;
  aliases?: string[];
  category?: string;
  preparation?: string | null;
  estimated_weight_g: number;
  serving_description?: string | null;
  serving_quantity: number;
  serving_unit: string;
  confidence: "high" | "medium" | "low" | string;
  assumptions?: string[];
  clarification_needed?: string | null;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g?: number | null;
  nutrition_source?: string;
  food_id?: string | null;
  profile_id?: string | null;
}

export interface MealImageAnalysisResponse {
  image_id: string;
  image_hash: string;
  storage_path?: string | null;
  signed_image_url?: string | null;
  is_cached_analysis: boolean;
  requires_confirmation: boolean;
  uncertainty_notice: string;
  foods: DetectedFoodItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbohydrates_g: number;
  total_fat_g: number;
  model_provider?: string;
  model_version?: string;
  analysis_version?: string;
  processing_time_ms?: number | null;
}

export interface ConfirmedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  preparation?: string | null;
  estimated_weight_g?: number | null;
  food_id?: string | null;
  profile_id?: string | null;
  was_edited?: boolean;
  was_added?: boolean;
}

export interface MealScanConfirmRequest {
  image_id: string;
  meal_type: MealType;
  items: ConfirmedFoodItem[];
  deleted_items?: string[];
  allow_training_consent?: boolean;
}

export interface MealScanConfirmResponse {
  success: boolean;
  saved_count: number;
  total_calories: number;
  saved_logs: FoodLogItem[];
  feedback_saved: boolean;
  message: string;
}

export interface RecalculateItemRequest {
  food_name: string;
  quantity: number;
  unit: string;
  preparation?: string | null;
  weight_g?: number | null;
}

export interface RecalculateItemResponse {
  food_name: string;
  quantity: number;
  unit: string;
  weight_g: number;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g?: number | null;
  nutrition_source: string;
  food_id?: string | null;
  profile_id?: string | null;
}
