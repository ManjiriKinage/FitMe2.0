/**
 * Pure nutrition & daily calorie target calculation engine.
 * Implements Mifflin-St Jeor BMR, activity TDEE, pace-based deficits/surpluses,
 * safety floors, and macro distribution.
 */

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "lightly_active"
  | "moderate"
  | "moderately_active"
  | "very_active"
  | "extra_active";
export type FitnessGoal =
  | "lose"
  | "lose_weight"
  | "maintain"
  | "maintain_weight"
  | "gain"
  | "gain_weight"
  | "gain_muscle";
export type Pace = "slow" | "steady" | "faster";

export interface CalculateDailyTargetInput {
  weight: number; // in kg
  height: number; // in cm
  age: number; // in years
  gender: Gender | string;
  activity: ActivityLevel | string;
  goal: FitnessGoal | string;
  pace?: Pace | string;
  targetWeight?: number | null;
}

export interface CalculateDailyTargetResult {
  bmr: number;
  tdee: number;
  target: number;
  protein: number; // grams
  carbs: number; // grams
  fats: number; // grams
  weeksToGoal: number | null;
  floorApplied: boolean;
  dailyChange: number;
  error?: string | null;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  lightly_active: 1.375,
  moderate: 1.55,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.725,
};

const PACE_VALUES_KG_PER_WEEK: Record<Pace, number> = {
  slow: 0.25,
  steady: 0.5,
  faster: 0.75,
};

export function calculateDailyTarget(
  input: CalculateDailyTargetInput
): CalculateDailyTargetResult {
  const {
    weight,
    height,
    age,
    gender,
    activity,
    goal,
    pace = "steady",
    targetWeight,
  } = input;

  // Basic sanity validation
  if (!weight || weight <= 0 || !height || height <= 0 || !age || age <= 0) {
    return {
      bmr: 0,
      tdee: 0,
      target: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      weeksToGoal: null,
      floorApplied: false,
      dailyChange: 0,
      error: "Weight, height, and age must be positive numbers.",
    };
  }

  const isLosing = goal === "lose" || goal === "lose_weight";
  const isGaining =
    goal === "gain" || goal === "gain_weight" || goal === "gain_muscle";
  const isMaintaining = !isLosing && !isGaining;

  // Validate target weight direction if provided
  if (targetWeight != null && targetWeight > 0) {
    if (isLosing && targetWeight >= weight) {
      return {
        bmr: 0,
        tdee: 0,
        target: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        weeksToGoal: null,
        floorApplied: false,
        dailyChange: 0,
        error: "Target weight must be below current weight for weight loss.",
      };
    }
    if (isGaining && targetWeight <= weight) {
      return {
        bmr: 0,
        tdee: 0,
        target: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        weeksToGoal: null,
        floorApplied: false,
        dailyChange: 0,
        error: "Target weight must be above current weight for weight gain.",
      };
    }
  }

  // 1. BMR (Mifflin-St Jeor)
  // Male: 10*weight + 6.25*height - 5*age + 5
  // Female: 10*weight + 6.25*height - 5*age - 161
  const genderOffset = gender === "male" ? 5 : -161;
  const rawBmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;
  const bmr = Math.round(rawBmr);

  // 2. TDEE = BMR * activity multiplier
  const multiplier = ACTIVITY_MULTIPLIERS[activity] ?? 1.55;
  const rawTdee = rawBmr * multiplier;
  const tdee = Math.round(rawTdee);

  // 3. Pace and Daily Change: pace in kg/week: slow 0.25, steady 0.5, faster 0.75
  // 1 kg fat ~ 7700 kcal -> dailyChange = pace * 7700 / 7 = pace * 1100
  const normalizedPace = (pace as Pace) in PACE_VALUES_KG_PER_WEEK ? (pace as Pace) : "steady";
  const paceKgPerWeek = PACE_VALUES_KG_PER_WEEK[normalizedPace];
  const dailyChange = Math.round(paceKgPerWeek * 1100);

  // 4. Target calories by goal
  let rawTarget = rawTdee;
  if (isLosing) {
    rawTarget = rawTdee - dailyChange;
  } else if (isGaining) {
    rawTarget = rawTdee + dailyChange;
  }

  // 5. Safety Floor:
  // Never below 1200 (female) or 1500 (male), and never below BMR.
  const absoluteFloor = gender === "male" ? 1500 : 1200;
  const safetyFloor = Math.max(absoluteFloor, rawBmr);

  let floorApplied = false;
  if (rawTarget < safetyFloor) {
    rawTarget = safetyFloor;
    floorApplied = true;
  }

  const target = Math.round(rawTarget);

  // 6. Macros:
  // protein = 1.6 g/kg when losing, 1.2 g/kg otherwise
  // fats = 25% of target calories / 9
  // carbs = remaining calories / 4
  const proteinMultiplier = isLosing ? 1.6 : 1.2;
  const protein = Math.round(weight * proteinMultiplier);
  const fats = Math.round((target * 0.25) / 9);
  // remaining calories = target - protein cals - fat cals (25% of target calories)
  const remainingCals = target * 0.75 - protein * 4;
  const carbs = Math.max(0, Math.round(remainingCals / 4));

  // 7. weeksToGoal = abs(weight - targetWeight) / pace (null if no target weight or goal is maintain)
  let weeksToGoal: number | null = null;
  if (!isMaintaining && targetWeight != null && targetWeight > 0) {
    const weightDiff = Math.abs(weight - targetWeight);
    weeksToGoal = Math.round(weightDiff / paceKgPerWeek);
  }

  return {
    bmr,
    tdee,
    target,
    protein,
    carbs,
    fats,
    weeksToGoal,
    floorApplied,
    dailyChange,
    error: null,
  };
}
