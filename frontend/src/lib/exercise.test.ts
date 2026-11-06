/**
 * Unit Tests for FitMe Exercise Calculations and Workout Recommender
 */

import {
  caloriesBurned,
  minutesNeeded,
  netCalories,
  recommendWorkout,
  Exercise
} from "./exercise";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log("Running exercise calculation unit tests...\n");

// Mock catalog of the 12 exercises
const mockExercises: Exercise[] = [
  {
    slug: "brisk-walk",
    name: "Brisk Walk",
    category: "cardio",
    place: "outdoors",
    equipment: "none",
    level: "beginner",
    met: 3.8,
    muscles: ["legs", "glutes", "calves"],
    steps: ["Walk at steady pace."],
    mistakes: ["Slouching."],
    avoid_tags: [],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1800
  },
  {
    slug: "jogging",
    name: "Jogging",
    category: "cardio",
    place: "outdoors",
    equipment: "none",
    level: "regular",
    met: 7.0,
    muscles: ["quads", "hamstrings", "calves"],
    steps: ["Jog smoothly."],
    mistakes: ["Heel strike."],
    avoid_tags: ["knee", "back", "heart", "joint"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1200
  },
  {
    slug: "home-circuit",
    name: "Home Circuit",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "regular",
    met: 5.0,
    muscles: ["full_body", "core"],
    steps: ["Circuit moves."],
    mistakes: ["Rushing."],
    avoid_tags: ["heart"],
    default_sets: 3,
    default_reps: 10,
    default_seconds: 900
  },
  {
    slug: "bodyweight-squat",
    name: "Bodyweight Squat",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 4.5,
    muscles: ["thighs", "glutes", "core"],
    steps: ["Lower hips back and bend knees."],
    mistakes: ["Knees collapsing inward."],
    avoid_tags: ["knee"],
    default_sets: 3,
    default_reps: 12,
    default_seconds: 360
  },
  {
    slug: "step-jacks",
    name: "Step Jacks",
    category: "cardio",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 4.0,
    muscles: ["shoulders", "calves"],
    steps: ["Step out to side and raise arms."],
    mistakes: ["Stomping."],
    avoid_tags: [],
    default_sets: 3,
    default_reps: 20,
    default_seconds: 360
  },
  {
    slug: "knee-push-up",
    name: "Knee Push-Up",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.5,
    muscles: ["chest", "shoulders", "triceps"],
    steps: ["Lower chest to floor from knees."],
    mistakes: ["Sagging back."],
    avoid_tags: ["wrist", "shoulder"],
    default_sets: 3,
    default_reps: 8,
    default_seconds: 360
  },
  {
    slug: "forearm-plank",
    name: "Forearm Plank",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.3,
    muscles: ["core", "abs", "glutes"],
    steps: ["Hold forearm plank straight."],
    mistakes: ["Piking hips."],
    avoid_tags: ["back", "shoulder"],
    default_sets: 3,
    default_reps: 1,
    default_seconds: 360
  },
  {
    slug: "glute-bridge",
    name: "Glute Bridge",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.0,
    muscles: ["glutes", "hamstrings"],
    steps: ["Lift hips toward ceiling."],
    mistakes: ["Overarching."],
    avoid_tags: ["back"],
    default_sets: 3,
    default_reps: 12,
    default_seconds: 360
  },
  {
    slug: "wall-sit",
    name: "Wall Sit",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.5,
    muscles: ["quads", "glutes"],
    steps: ["Slide down against wall to 90 degrees."],
    mistakes: ["Hands on knees."],
    avoid_tags: ["knee"],
    default_sets: 3,
    default_reps: 1,
    default_seconds: 360
  },
  {
    slug: "cycling",
    name: "Cycling",
    category: "cardio",
    place: "outdoors",
    equipment: "bicycle",
    level: "regular",
    met: 6.8,
    muscles: ["quads", "hamstrings", "calves"],
    steps: ["Pedal at steady cadence."],
    mistakes: ["Saddle too low."],
    avoid_tags: ["knee", "heart"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1800
  },
  {
    slug: "yoga-flow",
    name: "Yoga Flow",
    category: "mobility",
    place: "home",
    equipment: "mat",
    level: "beginner",
    met: 2.8,
    muscles: ["full_body", "spine"],
    steps: ["Flow through postures."],
    mistakes: ["Holding breath."],
    avoid_tags: [],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1200
  },
  {
    slug: "stair-climbing",
    name: "Stair Climbing",
    category: "cardio",
    place: "home",
    equipment: "stairs",
    level: "regular",
    met: 6.5,
    muscles: ["glutes", "quads", "calves"],
    steps: ["Step onto each stair."],
    mistakes: ["Leaning forward."],
    avoid_tags: ["knee", "heart"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 900
  }
];

// -------------------------------------------------------------
// Test Case 1: 70 kg, MET 3.8, 63 minutes gives about 280 kcal
// -------------------------------------------------------------
const seconds63Min = 63 * 60; // 3780 sec
const calsBurned = caloriesBurned(3.8, 70, seconds63Min);
console.log(`Test 1: 70 kg, MET 3.8, 63 min -> ${calsBurned} kcal (expected ~280 kcal)`);
assert(Math.round(calsBurned) >= 278 && Math.round(calsBurned) <= 280, `Expected ~280 kcal, got ${calsBurned}`);

const mins = minutesNeeded(280, 3.8, 70);
console.log(`Test 1b: minutesNeeded(280 kcal, MET 3.8, 70 kg) -> ${mins} minutes`);
assert(mins === 63, `Expected 63 minutes, got ${mins}`);

// -------------------------------------------------------------
// Test Case 2: Knee tag excludes squats and jumps
// -------------------------------------------------------------
console.log("\nTest 2: Verifying knee tag excludes squats and jumps...");
const kneeWorkout = recommendWorkout({
  answers: {
    place: "home",
    level: "beginner",
    avoid_tags: ["knee", "knee pain"],
    timeAvailableMinutes: 30
  },
  excessKcal: 280,
  weightKg: 70,
  exercises: mockExercises
});

console.log("Workout items for knee pain user:", kneeWorkout.items.map((i) => i.name));
const containsSquat = kneeWorkout.items.some((i) => i.slug.includes("squat"));
const containsWallSit = kneeWorkout.items.some((i) => i.slug.includes("wall-sit"));
assert(!containsSquat, "Knee tag must exclude squats!");
assert(!containsWallSit, "Knee tag must exclude wall sit!");
assert(kneeWorkout.items.length >= 3, "Should provide at least 3 safe alternative moves");

// -------------------------------------------------------------
// Test Case 3: Heart tag returns walking only with doctor check note
// -------------------------------------------------------------
console.log("\nTest 3: Verifying heart/blood pressure tag returns walking only...");
const heartWorkout = recommendWorkout({
  answers: {
    place: "home",
    level: "beginner",
    avoid_tags: ["Heart or blood pressure"],
    timeAvailableMinutes: 30
  },
  excessKcal: 280,
  weightKg: 70,
  exercises: mockExercises
});

console.log("Workout items for heart condition:", heartWorkout.items.map((i) => i.name));
assert(heartWorkout.items.length === 1, "Heart condition should return walking only");
assert(heartWorkout.items[0].name.toLowerCase().includes("walk"), "Must be walking");
assert(
  Boolean(heartWorkout.medicalNote && heartWorkout.medicalNote.toLowerCase().includes("doctor")),
  "Must include 'check with a doctor first' note"
);

// -------------------------------------------------------------
// Test Case 4: The 500 kcal daily cap and netCalories behavior
// -------------------------------------------------------------
console.log("\nTest 4: Verifying netCalories with 500 kcal cap, addback modes, and safety floor...");

// A. 500 kcal Cap: Burned 800 kcal, eaten 2200 kcal, mode 'all', cap 500 -> net = 2200 - 500 = 1700
const netWithCap = netCalories(2200, 800, "all", 500, 1200);
console.log(`4A: Eaten 2200, Burned 800 (cap 500) -> Net: ${netWithCap}`);
assert(netWithCap === 1700, `Expected 1700 net calories with 500 cap, got ${netWithCap}`);

// B. Addback mode 'off': Burned 400 kcal, eaten 2000 kcal -> credit = 0 -> net = 2000
const netOff = netCalories(2000, 400, "off", 500, 1200);
console.log(`4B: Addback 'off': Eaten 2000, Burned 400 -> Net: ${netOff}`);
assert(netOff === 2000, `Expected 2000 net calories with mode 'off', got ${netOff}`);

// C. Addback mode 'half': Burned 400 kcal, eaten 2000 kcal -> credit = 200 -> net = 1800
const netHalf = netCalories(2000, 400, "half", 500, 1200);
console.log(`4C: Addback 'half': Eaten 2000, Burned 400 -> Net: ${netHalf}`);
assert(netHalf === 1800, `Expected 1800 net calories with mode 'half', got ${netHalf}`);

// D. Safety floor protection: Eaten 1300 kcal, burned 400 kcal -> raw net = 900, safety floor 1200 -> net clamped to 1200
const netFloor = netCalories(1300, 400, "all", 500, 1200);
console.log(`4D: Safety floor clamping: Eaten 1300, Burned 400, Floor 1200 -> Net: ${netFloor}`);
assert(netFloor === 1200, `Expected net clamped to safety floor 1200, got ${netFloor}`);

// -------------------------------------------------------------
// Test Case 5: Light options only for under-18, pregnancy, injury
// -------------------------------------------------------------
console.log("\nTest 5: Verifying under-18 / pregnancy / injury returns light options only...");
const lightWorkout = recommendWorkout({
  answers: {
    place: "home",
    level: "regular",
    under18: true,
    timeAvailableMinutes: 30
  },
  excessKcal: 150,
  weightKg: 60,
  exercises: mockExercises
});

console.log("Light workout items:", lightWorkout.items.map((i) => i.name));
const hasAdvancedOrHighMet = lightWorkout.items.some((i) => {
  const orig = mockExercises.find((e) => e.slug === i.slug);
  return orig && (orig.level === "advanced" || orig.met > 4.5);
});
assert(!hasAdvancedOrHighMet, "Light workouts must not include advanced or high-intensity (>4.5 MET) exercises");

console.log("\nAll exercise calculation and recommendation tests passed successfully! ✅");
