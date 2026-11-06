/**
 * Pure Exercise Calculation and Recommendation Engine for FitMe
 * 
 * Provides:
 * 1. caloriesBurned: MET-based caloric expenditure
 * 2. minutesNeeded: Time required to burn off a caloric excess
 * 3. netCalories: Calorie add-back with cap and safety floor protection
 * 4. recommendWorkout: Intelligent constraint-based workout recommendation
 */

export type ExerciseCategory = "cardio" | "strength" | "mobility";
export type ExercisePlace = "outdoors" | "home" | "gym";
export type ExerciseLevel = "beginner" | "regular" | "advanced";
export type AddbackMode = "off" | "half" | "all";

export interface Exercise {
  id?: string;
  slug: string;
  name: string;
  category: ExerciseCategory;
  place: ExercisePlace;
  equipment: string;
  level: ExerciseLevel;
  met: number;
  muscles: string[];
  steps: string[];
  mistakes: string[];
  easier?: string | null;
  harder?: string | null;
  avoid_tags: string[];
  default_sets: number;
  default_reps: number;
  default_seconds: number;
}

export interface WorkoutAnswers {
  goal?: "burn" | "active" | "strength" | string;
  timeAvailableMinutes?: number; // e.g. 15, 30, 45, 60
  place?: "outdoors" | "home" | "gym" | string;
  level?: "beginner" | "regular" | "advanced" | string;
  avoid_tags?: string[]; // e.g. ['knee', 'back', 'heart', 'knee pain']
  under18?: boolean;
  pregnancy?: boolean;
  injury?: boolean;
}

export interface WorkoutPlanItem {
  id?: string;
  order: number;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  estimatedKcal: number;
  sets?: number;
  reps?: number;
  seconds?: number;
  howTo: {
    muscles: string[];
    steps: string[];
    mistakes: string[];
    easier?: string | null;
    harder?: string | null;
  };
}

export interface RecommendWorkoutResult {
  items: WorkoutPlanItem[];
  totalMinutes: number;
  estimatedKcal: number;
  coveredExcessPercent: number;
  extraSuggestion?: string;
  medicalNote?: string;
}

/**
 * Calculates calories burned using scientific MET formula:
 * calories = MET * weight_in_kg * (seconds / 3600)
 */
export function caloriesBurned(met: number, weightKg: number, seconds: number): number {
  if (met <= 0 || weightKg <= 0 || seconds <= 0) return 0;
  const kcal = (met * weightKg * seconds) / 3600;
  return Math.round(kcal * 10) / 10;
}

/**
 * Calculates minutes needed at a given MET to burn a specific excess calorie amount:
 * minutes = (excessKcal * 60) / (met * weightKg)
 */
export function minutesNeeded(excessKcal: number, met: number, weightKg: number): number {
  if (excessKcal <= 0 || met <= 0 || weightKg <= 0) return 0;
  const minutes = (excessKcal * 60) / (met * weightKg);
  return Math.round(minutes);
}

/**
 * Calculates net calories respecting user addbackMode ('off', 'half', 'all'),
 * a maximum daily credit cap, and never allowing net to dip below the safety floor.
 * 
 * credit = burned * (off: 0, half: 0.5, all: 1), capped at daily cap
 * net = eaten - credit (never below safetyFloor)
 */
export function netCalories(
  eaten: number,
  burnedToday: number,
  addbackMode: AddbackMode = "all",
  cap: number = 500,
  safetyFloor: number = 1200
): number {
  const safeEaten = Math.max(0, eaten);
  const safeBurned = Math.max(0, burnedToday);
  const safeCap = Math.max(0, cap);

  const factor = addbackMode === "off" ? 0 : addbackMode === "half" ? 0.5 : 1;
  const rawCredit = safeBurned * factor;
  const credit = Math.min(rawCredit, safeCap);

  const net = safeEaten - credit;
  return Math.max(safetyFloor, Math.round(net));
}

/**
 * Normalizes user avoid tags to canonical keywords.
 * e.g. "Knee pain" -> "knee", "Heart or blood pressure" -> "heart"
 */
function normalizeAvoidTags(tags: string[] = []): Set<string> {
  const norm = new Set<string>();
  for (const t of tags) {
    const s = t.toLowerCase().trim();
    if (!s || s === "none") continue;
    if (s.includes("knee")) norm.add("knee");
    if (s.includes("back")) norm.add("back");
    if (s.includes("heart") || s.includes("blood pressure") || s.includes("bp") || s.includes("cardiac")) {
      norm.add("heart");
    }
    if (s.includes("shoulder")) norm.add("shoulder");
    if (s.includes("wrist")) norm.add("wrist");
    if (s.includes("joint")) norm.add("joint");
    norm.add(s);
  }
  return norm;
}

/**
 * Generates an intelligent, personalized workout recommendation.
 */
export function recommendWorkout(params: {
  answers: WorkoutAnswers;
  excessKcal: number;
  weightKg: number;
  exercises: Exercise[];
}): RecommendWorkoutResult {
  const { answers, excessKcal = 0, weightKg = 70, exercises = [] } = params;
  const timeMinutes = Math.max(10, Math.min(120, answers.timeAvailableMinutes || 30));
  const rawAvoidTags = answers.avoid_tags || [];
  const normalizedAvoid = normalizeAvoidTags(rawAvoidTags);

  const hasHeartCondition = normalizedAvoid.has("heart");
  const isLightOnly = Boolean(answers.under18 || answers.pregnancy || answers.injury);

  // 1. Special Case: Heart or Blood Pressure Condition
  // "If you pick heart or blood pressure, we suggest checking with a doctor first and keep it to easy walking."
  if (hasHeartCondition) {
    const walkingMet = 3.3; // Easy stroll / conversational walking
    const seconds = timeMinutes * 60;
    const burned = caloriesBurned(walkingMet, weightKg, seconds);

    const walkingHowTo = {
      muscles: ["legs", "cardiovascular"],
      steps: [
        "Maintain a relaxed, upright posture with eyes looking gently ahead.",
        "Walk at a calm, comfortable pace where breathing remains completely conversational.",
        "Take rest breaks whenever you feel slight fatigue.",
        "Stay hydrated and avoid sudden accelerations."
      ],
      mistakes: [
        "Pushing through shortness of breath or dizziness.",
        "Overstriding or walking in extreme outdoor heat."
      ],
      easier: "Sit and rest for 1 minute every 5 minutes.",
      harder: "Gradually extend walking time while keeping the pace light and relaxed."
    };

    const item: WorkoutPlanItem = {
      order: 1,
      slug: "easy-walk",
      name: "Gentle Medical-Safe Walk",
      description: `${timeMinutes} min easy conversational walk`,
      durationMinutes: timeMinutes,
      estimatedKcal: Math.round(burned),
      seconds,
      howTo: walkingHowTo
    };

    const coveredPct = excessKcal > 0 ? Math.min(100, Math.round((burned / excessKcal) * 100)) : 100;
    const remainingKcal = Math.max(0, excessKcal - burned);
    const extraMins = remainingKcal > 0 ? minutesNeeded(remainingKcal, walkingMet, weightKg) : 0;

    return {
      items: [item],
      totalMinutes: timeMinutes,
      estimatedKcal: Math.round(burned),
      coveredExcessPercent: coveredPct,
      extraSuggestion: extraMins > 0 ? `Add a ${extraMins}-minute walk later today to cover the rest.` : undefined,
      medicalNote: "Please check with a doctor first and keep physical activity to gentle, easy walking."
    };
  }

  // 2. Filter exercises by user location, level, avoid tags, and safety guards
  const userPlace = (answers.place || "home").toLowerCase();
  const userLevel = (answers.level || "beginner").toLowerCase();

  const filtered = exercises.filter((ex) => {
    // A. Check avoid tags (if any overlap, exclude exercise)
    if (ex.avoid_tags && ex.avoid_tags.length > 0) {
      for (const tag of ex.avoid_tags) {
        const tLower = tag.toLowerCase().trim();
        if (normalizedAvoid.has(tLower)) {
          return false;
        }
      }
    }

    // B. Place filter (gym includes gym and bodyweight home moves)
    if (userPlace.includes("home") && ex.place !== "home") {
      return false;
    }
    if (userPlace.includes("outdoor") && ex.place !== "outdoors" && ex.category !== "cardio") {
      return false;
    }
    if (userPlace.includes("gym") && ex.place !== "gym" && ex.place !== "home") {
      return false;
    }

    // C. Light options filter (under-18, pregnancy, injury)
    if (isLightOnly) {
      if (ex.level === "advanced" || ex.met > 4.5) return false;
      if (ex.avoid_tags.includes("joint") || ex.avoid_tags.includes("back")) return false;
    }

    // D. User level filter (beginners and regular don't get advanced exercises)
    if ((userLevel === "beginner" || userLevel === "regular") && ex.level === "advanced") {
      return false;
    }

    return true;
  });

  // Fallback to safe brisk walk if filters are excessively restrictive
  let pool = filtered;
  if (pool.length === 0) {
    const safeWalk = exercises.find((e) => e.slug === "brisk-walk") || {
      slug: "brisk-walk",
      name: "Brisk Walk",
      category: "cardio" as ExerciseCategory,
      place: "outdoors" as ExercisePlace,
      equipment: "none",
      level: "beginner" as ExerciseLevel,
      met: 3.8,
      muscles: ["legs", "calves"],
      steps: ["Walk at a steady, rhythmic pace."],
      mistakes: ["Slouching forward."],
      avoid_tags: [],
      default_sets: 1,
      default_reps: 1,
      default_seconds: 1800
    };
    pool = [safeWalk];
  }

  // 3. Assemble balanced plan: 3-5 movements fitting the chosen duration and user goal
  let targetMoveCount = 5;
  if (timeMinutes <= 20) {
    targetMoveCount = 3;
  } else if (timeMinutes >= 60) {
    targetMoveCount = 5;
  }

  const userGoal = (answers.goal || "burn").toLowerCase();
  const selectedMoves: Exercise[] = [];

  const cardios = pool.filter((e) => e.category === "cardio");
  const strengths = pool.filter((e) => e.category === "strength");
  const mobilities = pool.filter((e) => e.category === "mobility");

  // Selection tailored to selected goal:
  if (userGoal.includes("strength")) {
    // Prioritize strength exercises
    for (const s of strengths) {
      if (selectedMoves.length < targetMoveCount - 1 && !selectedMoves.some((m) => m.slug === s.slug)) {
        selectedMoves.push(s);
      }
    }
    for (const c of [...mobilities, ...cardios, ...pool]) {
      if (selectedMoves.length < targetMoveCount && !selectedMoves.some((m) => m.slug === c.slug)) {
        selectedMoves.push(c);
      }
    }
  } else if (userGoal.includes("burn")) {
    // Prioritize high calorie burn (cardio & high MET)
    const sortedBurn = [...pool].sort((a, b) => b.met - a.met);
    for (const b of sortedBurn) {
      if (selectedMoves.length < targetMoveCount && !selectedMoves.some((m) => m.slug === b.slug)) {
        selectedMoves.push(b);
      }
    }
  } else {
    // Stay active: balanced mix of mobility, strength, and cardio
    for (const s of strengths) {
      if (selectedMoves.length < 2 && !selectedMoves.some((m) => m.slug === s.slug)) {
        selectedMoves.push(s);
      }
    }
    for (const c of [...cardios, ...mobilities, ...pool]) {
      if (selectedMoves.length < targetMoveCount && !selectedMoves.some((m) => m.slug === c.slug)) {
        selectedMoves.push(c);
      }
    }
  }

  // If pool was very small, fill up with duplicates or safe walk
  while (selectedMoves.length < Math.min(targetMoveCount, 3) && pool.length > 0) {
    selectedMoves.push(pool[selectedMoves.length % pool.length]);
  }

  const finalMoveCount = selectedMoves.length || 1;
  const minutesPerMove = Math.floor(timeMinutes / finalMoveCount);
  const remainingMinutes = timeMinutes - (minutesPerMove * finalMoveCount);

  const planItems: WorkoutPlanItem[] = selectedMoves.map((ex, idx) => {
    // Add leftover minutes to the first item
    const duration = idx === 0 ? minutesPerMove + remainingMinutes : minutesPerMove;
    const seconds = duration * 60;
    const burned = caloriesBurned(ex.met, weightKg, seconds);

    let desc = `${duration} min`;
    if (ex.default_sets > 1 && ex.default_reps > 1) {
      desc = `${ex.default_sets} sets of ${ex.default_reps} reps · ${duration} min`;
    } else if (ex.default_sets > 1 && ex.default_seconds < 120) {
      desc = `${ex.default_sets} sets of ${Math.round(ex.default_seconds / ex.default_sets)} sec · ${duration} min`;
    } else {
      desc = `${duration} min ${ex.level === "beginner" ? "easy" : "moderate"} pace`;
    }

    return {
      id: ex.id,
      order: idx + 1,
      slug: ex.slug,
      name: ex.name,
      description: desc,
      durationMinutes: duration,
      estimatedKcal: Math.round(burned),
      sets: ex.default_sets,
      reps: ex.default_reps,
      seconds,
      howTo: {
        muscles: ex.muscles || [],
        steps: ex.steps || [],
        mistakes: ex.mistakes || [],
        easier: ex.easier,
        harder: ex.harder
      }
    };
  });

  const totalEstimatedKcal = planItems.reduce((acc, it) => acc + it.estimatedKcal, 0);
  const coveredExcessPercent = excessKcal > 0
    ? Math.min(100, Math.round((totalEstimatedKcal / excessKcal) * 100))
    : 100;

  let extraSuggestion: string | undefined = undefined;
  if (excessKcal > totalEstimatedKcal) {
    const unburned = excessKcal - totalEstimatedKcal;
    const walkMinutesNeeded = minutesNeeded(unburned, 3.8, weightKg);
    if (walkMinutesNeeded > 0) {
      extraSuggestion = `Add a ${walkMinutesNeeded}-minute walk later today to cover the rest.`;
    }
  }

  return {
    items: planItems,
    totalMinutes: timeMinutes,
    estimatedKcal: totalEstimatedKcal,
    coveredExcessPercent,
    extraSuggestion
  };
}

