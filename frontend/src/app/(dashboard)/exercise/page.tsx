"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import HowToPanel from "@/components/exercise/HowToPanel";
import WorkoutTimerModal from "@/components/exercise/WorkoutTimerModal";
import ManualWorkoutLogModal from "@/components/exercise/ManualWorkoutLogModal";
import {
  Exercise,
  WorkoutAnswers,
  WorkoutPlanItem,
  RecommendWorkoutResult,
  recommendWorkout,
  caloriesBurned,
  minutesNeeded,
} from "@/lib/exercise";
import {
  Dumbbell,
  Clock,
  Flame,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Plus,
  Play,
  Heart,
  ShieldAlert,
  Loader2,
  Info
} from "lucide-react";

// Default fallback exercises if backend or DB is still seeding
const DEFAULT_FALLBACK_EXERCISES: Exercise[] = [
  {
    slug: "bodyweight-squat",
    name: "Bodyweight squats",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 4.5,
    muscles: ["thighs", "glutes", "core"],
    steps: [
      "Stand with feet shoulder-width apart, toes turned out slightly.",
      "Tighten your belly and keep your chest up.",
      "Push your hips back and bend your knees, lowering as far as is comfortable.",
      "Keep your knees over your toes and your heels on the floor.",
      "Press through your heels to stand up tall.",
    ],
    mistakes: ["Knees collapsing inward, heels lifting, rounding the back."],
    easier: "Sit down and stand up from a chair.",
    harder: "Or add a jump squat.",
    avoid_tags: ["knee"],
    default_sets: 3,
    default_reps: 12,
    default_seconds: 360,
  },
  {
    slug: "step-jacks",
    name: "Step jacks",
    category: "cardio",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 4.0,
    muscles: ["shoulders", "calves", "cardiovascular"],
    steps: [
      "Stand tall with feet together and arms at your sides.",
      "Step your right foot out to the side while raising both arms overhead.",
      "Return right foot to center as you lower arms.",
      "Step left foot out while raising arms again.",
      "Continue alternating at a brisk, low-impact pace.",
    ],
    mistakes: ["Stomping heavily on feet instead of staying light on toes."],
    easier: "Raise arms to shoulder height only and slow stepping pace.",
    harder: "Transition into full jumping jacks.",
    avoid_tags: [],
    default_sets: 3,
    default_reps: 20,
    default_seconds: 360,
  },
  {
    slug: "knee-push-up",
    name: "Knee push-ups",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.5,
    muscles: ["chest", "shoulders", "triceps", "core"],
    steps: [
      "Kneel on an exercise mat with hands slightly wider than shoulders.",
      "Brace core to keep a straight line from head to knees.",
      "Lower chest toward the mat by bending elbows at a 45-degree angle.",
      "Lower until elbows reach 90 degrees.",
      "Press through palms to return to top.",
    ],
    mistakes: ["Sagging lower back or sticking hips up in the air."],
    easier: "Perform wall push-ups or hands on a kitchen counter.",
    harder: "Perform full push-ups on toes.",
    avoid_tags: ["wrist", "shoulder"],
    default_sets: 3,
    default_reps: 8,
    default_seconds: 360,
  },
  {
    slug: "forearm-plank",
    name: "Forearm plank",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.3,
    muscles: ["core", "abs", "shoulders", "glutes"],
    steps: [
      "Rest forearms on mat with elbows directly under shoulders.",
      "Extend legs back with toes on floor.",
      "Brace core and glutes into a straight line.",
      "Gaze at floor between arms, keeping neck relaxed.",
      "Hold steadily while breathing continuously.",
    ],
    mistakes: ["Letting lower back sag or piking hips in the air."],
    easier: "Drop knees to mat while maintaining core brace.",
    harder: "Hold for 45-60 seconds or lift one foot slightly.",
    avoid_tags: ["back", "shoulder"],
    default_sets: 3,
    default_reps: 1,
    default_seconds: 360,
  },
  {
    slug: "cool-down-walk",
    name: "Cool-down walk",
    category: "cardio",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.0,
    muscles: ["legs", "calves"],
    steps: [
      "Walk gently around the room or march in place with soft arms.",
      "Take deep, slow breaths in through nose and out through mouth.",
      "Let heart rate gradually settle back to resting state.",
    ],
    mistakes: ["Stopping abruptly after vigorous movement."],
    easier: "Gentle seated leg extensions and arm swings.",
    harder: "Light dynamic stretching flow.",
    avoid_tags: [],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 360,
  },
  {
    slug: "brisk-walk",
    name: "Brisk walk",
    category: "cardio",
    place: "outdoors",
    equipment: "none",
    level: "beginner",
    met: 3.8,
    muscles: ["legs", "glutes", "calves"],
    steps: [
      "Maintain upright posture with relaxed shoulders.",
      "Bend elbows slightly and swing arms with rhythm.",
      "Walk at a conversational brisk pace.",
      "Push off through balls of feet.",
    ],
    mistakes: ["Slouching forward or overstriding."],
    easier: "Stroll at relaxed pace with short breaks.",
    harder: "Power walk on gentle inclines.",
    avoid_tags: [],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1800,
  },
  {
    slug: "jogging",
    name: "Jogging",
    category: "cardio",
    place: "outdoors",
    equipment: "none",
    level: "regular",
    met: 7.0,
    muscles: ["quads", "hamstrings", "calves", "cardiovascular"],
    steps: [
      "Keep head up, spine neutral, and shoulders relaxed.",
      "Land midfoot with knees slightly soft on impact.",
      "Swing arms forward and backward smoothly.",
      "Breathe rhythmically in tempo with your steps.",
    ],
    mistakes: ["Heel striking on stiff locked knees, hunching shoulders."],
    easier: "Alternate 1 min jogging with 2 min brisk walking intervals.",
    harder: "Increase cadence or jog on rolling inclines.",
    avoid_tags: ["knee", "back", "heart", "joint"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1200,
  },
  {
    slug: "glute-bridge",
    name: "Glute bridge",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.0,
    muscles: ["glutes", "hamstrings", "core"],
    steps: [
      "Lie on your back with knees bent and feet flat on the floor.",
      "Drive through your heels to raise your hips toward the ceiling.",
      "Squeeze glutes firmly at top in a straight line from knees to shoulders.",
      "Slowly lower hips back to mat with control.",
    ],
    mistakes: ["Overarching lower back, pushing off toes."],
    easier: "Perform smaller hip lifts with a pillow under pelvis.",
    harder: "Perform single-leg glute bridges or add a resistance loop.",
    avoid_tags: ["back"],
    default_sets: 3,
    default_reps: 12,
    default_seconds: 360,
  },
  {
    slug: "wall-sit",
    name: "Wall sit",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "beginner",
    met: 3.5,
    muscles: ["quads", "glutes", "calves"],
    steps: [
      "Press your back flat against a wall with feet 2 feet away.",
      "Slide down until thighs are roughly parallel to the ground.",
      "Ensure knees stay directly above ankles, not past toes.",
      "Hold steadily while breathing calmly.",
    ],
    mistakes: ["Knees caving past toes, resting hands on knees."],
    easier: "Hold at a shallower 45-degree knee angle.",
    harder: "Hold for 45-60 seconds or hold a light weight.",
    avoid_tags: ["knee"],
    default_sets: 3,
    default_reps: 1,
    default_seconds: 360,
  },
  {
    slug: "cycling",
    name: "Cycling",
    category: "cardio",
    place: "outdoors",
    equipment: "bicycle",
    level: "regular",
    met: 6.8,
    muscles: ["quads", "hamstrings", "calves", "cardiovascular"],
    steps: [
      "Adjust saddle so leg has a slight 25-degree bend at bottom pedal.",
      "Keep relaxed grip on handlebars with shoulders down.",
      "Maintain a smooth, continuous circular cadence around 75-90 RPM.",
    ],
    mistakes: ["Saddle set too low, locking elbows out."],
    easier: "Ride on flat ground at easy leisure pace.",
    harder: "Incorporate hill climbs and interval sprints.",
    avoid_tags: ["knee", "heart"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1800,
  },
  {
    slug: "yoga-flow",
    name: "Yoga flow",
    category: "mobility",
    place: "home",
    equipment: "mat",
    level: "beginner",
    met: 2.8,
    muscles: ["spine", "hip_flexors", "hamstrings", "core"],
    steps: [
      "Begin in Mountain Pose with deep centered breathing.",
      "Inhale to sweep arms overhead, exhale to fold forward with soft knees.",
      "Step back into downward dog, lengthening through spine.",
      "Flow through gentle cat-cow and cobra transitions.",
    ],
    mistakes: ["Forcing stretches past comfortable range, holding breath."],
    easier: "Use blocks under hands and bend knees generously.",
    harder: "Hold balance poses longer and add chaturanga push-ups.",
    avoid_tags: [],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1200,
  },
  {
    slug: "stair-climbing",
    name: "Stair climbing",
    category: "cardio",
    place: "home",
    equipment: "stairs",
    level: "regular",
    met: 6.5,
    muscles: ["glutes", "quads", "calves", "cardiovascular"],
    steps: [
      "Step onto each stair with your entire foot flat.",
      "Drive through your heel and midfoot to ascend.",
      "Ascend at a steady, rhythmic cadence.",
      "Walk down slowly and carefully to protect joints.",
    ],
    mistakes: ["Leaning forward excessively, stepping on tiptoes only."],
    easier: "Step up 1 flight slowly, resting 15 seconds at the top.",
    harder: "Take stairs two at a time.",
    avoid_tags: ["knee", "heart"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 900,
  },
  {
    slug: "bird-dog",
    name: "Bird dog",
    category: "mobility",
    place: "home",
    equipment: "mat",
    level: "beginner",
    met: 2.5,
    muscles: ["core", "lower_back", "glutes", "shoulders"],
    steps: [
      "Start on all fours on a padded mat with wrists under shoulders.",
      "Slowly extend right arm forward and left leg back simultaneously.",
      "Hold for 2 seconds while keeping hips and shoulders level with floor.",
      "Return to starting quadruped position and alternate sides.",
    ],
    mistakes: ["Arching lower back, rotating hips sideways."],
    easier: "Lift arm or leg individually instead of together.",
    harder: "Hold at full extension for 5 seconds.",
    avoid_tags: [],
    default_sets: 3,
    default_reps: 10,
    default_seconds: 360,
  },
  {
    slug: "dead-bug",
    name: "Dead bug",
    category: "mobility",
    place: "home",
    equipment: "mat",
    level: "beginner",
    met: 2.5,
    muscles: ["deep_core", "abs", "hip_flexors"],
    steps: [
      "Lie on back with arms extended toward ceiling and knees bent at 90 degrees.",
      "Press your lower back firmly into the mat.",
      "Slowly lower your right arm overhead and left leg toward floor.",
      "Keep lower back flat, then return to top and switch limbs.",
    ],
    mistakes: ["Allowing lower back to arch off the floor."],
    easier: "Tap heels to floor with knees bent instead of extending leg straight.",
    harder: "Pause for 2 seconds at full extension.",
    avoid_tags: [],
    default_sets: 3,
    default_reps: 10,
    default_seconds: 360,
  },
  {
    slug: "standard-push-up",
    name: "Standard push-ups",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "advanced",
    met: 5.0,
    muscles: ["chest", "triceps", "shoulders", "core"],
    steps: [
      "Start in a high plank with hands slightly wider than shoulders.",
      "Brace core and glutes into a rigid straight plank line.",
      "Lower chest until elbows reach 90 degrees, keeping elbows at 45 degrees.",
      "Press through full palms to return to full lockout.",
    ],
    mistakes: ["Sagging lower back, flaring elbows out wide."],
    easier: "Perform knee push-ups or incline push-ups.",
    harder: "Add a 2-second pause at the bottom or elevate feet on a chair.",
    avoid_tags: ["wrist", "shoulder"],
    default_sets: 3,
    default_reps: 15,
    default_seconds: 360,
  },
  {
    slug: "jump-squat",
    name: "Jump squats",
    category: "strength",
    place: "home",
    equipment: "none",
    level: "advanced",
    met: 8.0,
    muscles: ["quads", "glutes", "calves", "cardiovascular"],
    steps: [
      "Stand with feet shoulder-width apart.",
      "Lower into a quarter squat, then explosively jump vertically upward.",
      "Land softly on balls of feet and immediately sink into next squat.",
    ],
    mistakes: ["Landing stiff-legged, letting knees cave on impact."],
    easier: "Standard bodyweight squats without jumping.",
    harder: "Increase jump height and jump frequency.",
    avoid_tags: ["knee", "back", "joint", "heart"],
    default_sets: 3,
    default_reps: 12,
    default_seconds: 360,
  },
  {
    slug: "lat-pulldown",
    name: "Lat pulldown",
    category: "strength",
    place: "gym",
    equipment: "cable machine",
    level: "beginner",
    met: 4.0,
    muscles: ["lats", "upper_back", "biceps"],
    steps: [
      "Sit securely at the machine with thigh pads snug over your legs.",
      "Grasp the bar with hands slightly wider than shoulder-width.",
      "Pull the bar down toward your upper chest by driving elbows down and back.",
      "Squeeze shoulder blades together, then control bar back up.",
    ],
    mistakes: ["Leaning backward excessively and using body momentum."],
    easier: "Use lighter resistance pin on the stack.",
    harder: "Slow 3-second eccentric return.",
    avoid_tags: ["shoulder"],
    default_sets: 3,
    default_reps: 10,
    default_seconds: 360,
  },
  {
    slug: "treadmill-incline-walk",
    name: "Treadmill incline walk",
    category: "cardio",
    place: "gym",
    equipment: "treadmill",
    level: "beginner",
    met: 5.5,
    muscles: ["glutes", "hamstrings", "calves", "cardiovascular"],
    steps: [
      "Set treadmill incline between 6% and 12% at a 2.8 to 3.5 mph speed.",
      "Walk with an upright posture without holding onto the handrails.",
      "Drive through your heels and pump your arms rhythmically.",
    ],
    mistakes: ["Holding tightly onto the front console or leaning back."],
    easier: "Lower incline to 3-5% or reduce speed.",
    harder: "Increase incline to 12-15%.",
    avoid_tags: ["knee", "heart"],
    default_sets: 1,
    default_reps: 1,
    default_seconds: 1200,
  },
];

export default function ExercisePage() {
  const router = useRouter();

  // Page States
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>(DEFAULT_FALLBACK_EXERCISES);

  // Calorie Context for today
  const [caloriesEaten, setCaloriesEaten] = useState<number>(0);
  const [calorieGoal, setCalorieGoal] = useState<number>(2000);
  const [userWeightKg, setUserWeightKg] = useState<number>(70);

  // Quiz Form Answers State
  const [goal, setGoal] = useState<"burn" | "active" | "strength">("active");
  const [timeMinutes, setTimeMinutes] = useState<number>(30);
  const [place, setPlace] = useState<"home" | "outdoors" | "gym">("home");
  const [level, setLevel] = useState<"beginner" | "regular" | "advanced">("beginner");
  const [avoidTags, setAvoidTags] = useState<string[]>([]);

  // Workflow State: whether quiz is open or user has generated plan
  const [isQuizEditing, setIsQuizEditing] = useState<boolean>(true);
  const [hasSavedPrefs, setHasSavedPrefs] = useState<boolean>(false);
  const [planResult, setPlanResult] = useState<RecommendWorkoutResult | null>(null);

  // Active How-To Panel inspection
  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null);

  // Modals
  const [isTimerOpen, setIsTimerOpen] = useState(false);
  const [timerInitialIndex, setTimerInitialIndex] = useState(0);
  const [isManualLogOpen, setIsManualLogOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Compute Calorie Excess
  const excessKcal = Math.max(0, Math.round(caloriesEaten - calorieGoal));
  const isOverGoal = excessKcal > 0;

  // Load user data, preferences, and exercises
  const loadExerciseData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      // 1. Fetch Today Dashboard for eaten calories & goal
      const todayStr = new Date().toISOString().split("T")[0];
      try {
        const dashRes = await api.getDashboard(todayStr);
        if (dashRes) {
          const eaten = dashRes.calories_consumed || 0;
          const target = dashRes.daily_calorie_target || 2000;
          setCaloriesEaten(eaten);
          setCalorieGoal(target);
          if (eaten > target) {
            setGoal("burn");
          }
        }
      } catch (err) {
        console.warn("Could not load dashboard calories:", err);
      }

      // 2. Fetch User Profile for current weight
      let weight = 70;
      try {
        const profRes = await api.getProfile();
        if (profRes) {
          setUserProfile(profRes);
          if (profRes.current_weight_kg && profRes.current_weight_kg > 0) {
            weight = profRes.current_weight_kg;
            setUserWeightKg(weight);
          }
        }
      } catch (err) {
        console.warn("Could not load user profile:", err);
      }

      // 3. Fetch Curated Exercises
      let loadedExercises = DEFAULT_FALLBACK_EXERCISES;
      try {
        const catRes = await api.getExerciseCatalog();
        if (catRes.exercises && catRes.exercises.length >= 6) {
          loadedExercises = catRes.exercises;
          setExerciseCatalog(catRes.exercises);
        }
      } catch (err) {
        console.warn("Exercise catalog DB query skipped, using seed fallback:", err);
      }

      // 4. Fetch User's Exercise Preferences
      try {
        const prefsRes = await api.getExercisePrefs();
        if (prefsRes?.prefs && prefsRes.prefs.minutes_per_day) {
          const p = prefsRes.prefs;
          setPlace(p.place === "outdoors" ? "outdoors" : p.place === "gym" ? "gym" : "home");
          setLevel(p.level === "advanced" ? "advanced" : p.level === "regular" ? "regular" : "beginner");
          setTimeMinutes(p.minutes_per_day || 30);
          setAvoidTags(p.avoid_tags || []);
          setHasSavedPrefs(true);
          setIsQuizEditing(false);

          // Automatically generate plan for returning user
          const generated = recommendWorkout({
            answers: {
              goal: caloriesEaten > calorieGoal ? "burn" : "active",
              place: p.place || "home",
              level: p.level || "beginner",
              timeAvailableMinutes: p.minutes_per_day || 30,
              avoid_tags: p.avoid_tags || [],
            },
            excessKcal: Math.max(0, caloriesEaten - calorieGoal),
            weightKg: weight,
            exercises: loadedExercises,
          });
          setPlanResult(generated);
          if (generated.items.length > 0) {
            setInspectedIndex(0);
          }
        }
      } catch (err) {
        console.warn("Could not load exercise preferences:", err);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load exercise plan data.");
    } finally {
      setLoading(false);
    }
  }, [router, caloriesEaten, calorieGoal]);

  useEffect(() => {
    loadExerciseData();
  }, []);

  // Avoid Tag Toggles
  const handleToggleAvoidTag = (tag: string) => {
    if (tag === "None") {
      setAvoidTags([]);
      return;
    }
    setAvoidTags((prev) => {
      const exists = prev.includes(tag);
      if (exists) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev.filter((t) => t !== "None"), tag];
    });
  };

  // Generate / Submit Plan
  const handleGeneratePlan = async () => {
    setLoading(true);
    try {
      const answers: WorkoutAnswers = {
        goal,
        timeAvailableMinutes: timeMinutes,
        place,
        level,
        avoid_tags: avoidTags,
      };

      const result = recommendWorkout({
        answers,
        excessKcal,
        weightKg: userWeightKg,
        exercises: exerciseCatalog,
      });

      setPlanResult(result);
      setIsQuizEditing(false);
      setHasSavedPrefs(true);
      if (result.items.length > 0) {
        setInspectedIndex(0);
      }

      // Persist preferences to exercise_prefs table
      await api.updateExercisePrefs({
        place,
        level,
        minutes_per_day: timeMinutes,
        avoid_tags: avoidTags,
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate workout plan.");
    } finally {
      setLoading(false);
    }
  };

  // Callback on finishing a workout from the active timer
  const handleWorkoutFinished = (result: {
    name: string;
    completedSeconds: number;
    caloriesBurned: number;
    status: "completed" | "partial";
  }) => {
    setIsTimerOpen(false);
    setToastMsg(`Logged workout: ${result.name} (+${result.caloriesBurned} kcal burned)!`);
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Brisk walk extra equivalence for banner
  const briskWalkMinsNeeded = useMemo(() => {
    if (excessKcal <= 0) return 0;
    return minutesNeeded(excessKcal, 3.8, userWeightKg);
  }, [excessKcal, userWeightKg]);

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#22332d]">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 lg:p-8 flex flex-col md:flex-row gap-6 items-start">
        {/* Navigation Sidebar */}
        <Navbar userFullName={userProfile?.full_name} />

        {/* Main Content Area */}
        <main className="flex-1 w-full flex flex-col gap-6">
          {/* Toast Notification */}
          {toastMsg && (
            <div className="p-4 bg-[#eaf1ec] border border-[#7c9a7e] rounded-[18px] text-[#22332d] text-sm font-semibold flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#7c9a7e]" />
                <span>{toastMsg}</span>
              </div>
              <button
                onClick={() => setToastMsg(null)}
                className="text-[#5b6b64] hover:text-[#22332d]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-[32px] sm:text-[36px] font-bold text-[#22332d] tracking-tight">
                Exercise plan
              </h1>
              <p className="text-[#5b6b64] text-[14px] mt-1.5 leading-normal">
                Answer a few quick questions and get a workout that fits your time, place and level, with a how-to for every move.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsManualLogOpen(true)}
              className="self-start sm:self-center h-10 px-4 rounded-full border border-[#dfe6e1] bg-white text-[13px] font-semibold text-[#22332d] hover:bg-[#f4f8f5] transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4 text-[#7c9a7e]" />
              <span>Log workout</span>
            </button>
          </div>

          {/* Over-Goal Calorie Alert Banner (Only shown if over goal) */}
          {isOverGoal && (
            <div className="bg-[#fef9e5] border border-[#f5ebbf] rounded-[20px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_1px_3px_rgba(34,51,45,0.04)]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#fceea7] text-[#946c00] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#22332d] leading-snug">
                    You're {excessKcal} kcal over your goal today.
                  </h2>
                  <p className="text-[13px] text-[#5b6b64] mt-0.5">
                    A {briskWalkMinsNeeded}-minute brisk walk burns about that. Or pick a workout below to offset it.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setGoal("burn");
                    setIsQuizEditing(true);
                  }}
                  className="h-9 px-4 rounded-full bg-[#22332d] text-white text-xs font-semibold hover:bg-[#1a2823] transition-colors"
                >
                  Burn it off
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-[18px] text-red-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Two-Column Grid: Quiz Form + Generated Plan Card */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-6 items-start">
            {/* Column 1: 5-Question Quiz Card */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-2 border-b border-[#eef1ee]">
                <div className="text-[18px] font-bold text-[#22332d]">Tell us about today</div>
                <span className="inline-block rounded-full bg-[#eaf1ec] px-3 py-1 text-xs font-semibold text-[#22332d]">
                  20 seconds
                </span>
              </div>

              {/* If user already has plan and isn't editing, show compact summary with edit link */}
              {!isQuizEditing && hasSavedPrefs ? (
                <div className="flex flex-col gap-4 py-2">
                  <div className="text-[13px] text-[#5b6b64]">
                    Your customized workout settings are active:
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#f4f8f5] px-3.5 py-1 text-xs font-bold text-[#22332d] capitalize border border-[#eaf1ec]">
                      Goal: {goal === "burn" ? "Burn extra calories" : goal === "strength" ? "Build strength" : "Stay active"}
                    </span>
                    <span className="rounded-full bg-[#f4f8f5] px-3.5 py-1 text-xs font-bold text-[#22332d] border border-[#eaf1ec]">
                      {timeMinutes} min
                    </span>
                    <span className="rounded-full bg-[#f4f8f5] px-3.5 py-1 text-xs font-bold text-[#22332d] capitalize border border-[#eaf1ec]">
                      {place === "home" ? "Home, no equipment" : place}
                    </span>
                    <span className="rounded-full bg-[#f4f8f5] px-3.5 py-1 text-xs font-bold text-[#22332d] capitalize border border-[#eaf1ec]">
                      {level}
                    </span>
                    {avoidTags.length > 0 && (
                      <span className="rounded-full bg-[#fef9e5] px-3.5 py-1 text-xs font-bold text-[#946c00] border border-[#f5ebbf]">
                        Avoid: {avoidTags.join(", ")}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsQuizEditing(true)}
                    className="self-start text-[13px] font-semibold text-[#22332d] hover:text-[#7c9a7e] underline mt-2 transition-colors"
                  >
                    Edit answers
                  </button>
                </div>
              ) : (
                /* Full Interactive Quiz Form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleGeneratePlan();
                  }}
                  className="flex flex-col gap-4 mt-1"
                >
                  {/* Q1: What do you want today? */}
                  <div>
                    <label className="text-[13px] font-semibold text-[#22332d] block mb-2">
                      What do you want today?
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setGoal("burn")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          goal === "burn"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Burn extra calories
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoal("active")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          goal === "active"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Stay active
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoal("strength")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          goal === "strength"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Build strength
                      </button>
                    </div>
                  </div>

                  {/* Q2: Time you have */}
                  <div>
                    <label className="text-[13px] font-semibold text-[#22332d] block mb-2">
                      Time you have
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {[15, 30, 45, 60].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTimeMinutes(t)}
                          className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                            timeMinutes === t
                              ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                          }`}
                        >
                          {t} min
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3: Where will you exercise? */}
                  <div>
                    <label className="text-[13px] font-semibold text-[#22332d] block mb-2">
                      Where will you exercise?
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPlace("outdoors")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          place === "outdoors"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Outdoors
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlace("home")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          place === "home"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Home, no equipment
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlace("gym")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          place === "gym"
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        Gym
                      </button>
                    </div>
                  </div>

                  {/* Q4: Your level */}
                  <div>
                    <label className="text-[13px] font-semibold text-[#22332d] block mb-2">
                      Your level
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {(["beginner", "regular", "advanced"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLevel(l)}
                          className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold capitalize transition-all border ${
                            level === l
                              ? "bg-[#22332d] text-white border-[#22332d]"
                              : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q5: Anything to avoid? */}
                  <div>
                    <label className="text-[13px] font-semibold text-[#22332d] block mb-2">
                      Anything to avoid?
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleToggleAvoidTag("None")}
                        className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                          avoidTags.length === 0
                            ? "bg-[#22332d] text-white border-[#22332d]"
                            : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                        }`}
                      >
                        None
                      </button>
                      {["Knee pain", "Back pain", "Heart or blood pressure"].map((tag) => {
                        const isSelected = avoidTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleAvoidTag(tag)}
                            className={`px-3.5 py-2 rounded-[12px] text-[13px] font-semibold transition-all border ${
                              isSelected
                                ? "bg-[#22332d] text-white border-[#22332d]"
                                : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f4f8f5]"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-[#5b6b64] mt-2.5 leading-relaxed">
                      If you pick heart or blood pressure, we suggest checking with a doctor first and keep it to easy walking.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-full bg-[#22332d] text-white text-[14px] font-semibold hover:bg-[#1a2823] transition-all flex items-center justify-center gap-2 mt-2 shadow-md"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Building your plan...</span>
                      </>
                    ) : (
                      <span>Get my plan</span>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Column 2: Generated Plan List Card */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-4">
              {loading && !planResult ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#5b6b64] text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#7c9a7e] mb-2" />
                  <span>Loading personalized exercise plan...</span>
                </div>
              ) : planResult && planResult.items.length > 0 ? (
                <>
                  {/* Plan Card Header */}
                  <div className="flex justify-between items-center pb-2">
                    <div className="text-[18px] font-bold text-[#22332d]">
                      Your plan · {planResult.totalMinutes} min · {place === "home" ? "Home" : place.charAt(0).toUpperCase() + place.slice(1)}
                    </div>
                    <span className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d] capitalize">
                      {level}
                    </span>
                  </div>

                  {/* Subtitle / Excess Context */}
                  <p className="text-[#5b6b64] text-[13px] m-0 -mt-2">
                    {isOverGoal ? (
                      <>
                        You're {excessKcal} kcal over today. This plan covers about {planResult.estimatedKcal} of it.
                      </>
                    ) : (
                      <>
                        Stay active plan: burns approximately {planResult.estimatedKcal} kcal to keep your metabolism elevated.
                      </>
                    )}
                  </p>

                  {/* Move Items List */}
                  <div className="flex flex-col divide-y divide-[#eef1ee]">
                    {planResult.items.map((item, idx) => {
                      const isInspected = inspectedIndex === idx;
                      return (
                        <div
                          key={item.slug + idx}
                          className={`flex items-center gap-3.5 py-3.5 transition-colors ${
                            isInspected ? "bg-[#f4f8f5] -mx-3 px-3 rounded-[16px]" : ""
                          }`}
                        >
                          {/* Number Badge */}
                          <div className="w-8 h-8 rounded-[10px] bg-[#eaf1ec] flex items-center justify-center text-[13px] font-bold text-[#22332d] flex-shrink-0">
                            {item.order}
                          </div>

                          {/* Exercise Name and Prescription */}
                          <div className="flex-1 min-w-0">
                            <b className="text-[15px] font-bold text-[#22332d] block truncate">
                              {item.name}
                            </b>
                            <div className="text-[12px] text-[#5b6b64] mt-0.5">
                              {item.description}
                            </div>
                          </div>

                          {/* Kcal Badge */}
                          <b className="text-[14px] font-bold text-[#22332d] flex-shrink-0">
                            {item.estimatedKcal} kcal
                          </b>

                          {/* How-to Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedIndex(idx);
                              const howToElem = document.getElementById("exercise-howto-section");
                              if (howToElem) {
                                howToElem.scrollIntoView({ behavior: "smooth" });
                              }
                            }}
                            className={`h-[34px] px-3.5 rounded-full border text-[13px] font-semibold transition-all flex items-center justify-center flex-shrink-0 ${
                              isInspected
                                ? "bg-[#22332d] text-white border-[#22332d]"
                                : "border-[#dfe6e1] bg-white text-[#22332d] hover:bg-[#f4f8f5]"
                            }`}
                          >
                            How to
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Extra Suggestion & Start Workout Button */}
                  <div className="pt-3 border-t border-[#eef1ee] flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
                    <span className="text-[13px] text-[#5b6b64] max-w-[280px] leading-snug">
                      {planResult.extraSuggestion || "Consistent daily movement helps build metabolic flexibility."}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setTimerInitialIndex(0);
                        setIsTimerOpen(true);
                      }}
                      className="h-11 px-5 rounded-full bg-[#7c9a7e] text-white text-[14px] font-semibold hover:bg-[#68856a] transition-all flex items-center justify-center gap-2 shadow-sm self-start sm:self-auto"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start workout timer</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-[#5b6b64] text-center">
                  <Dumbbell className="w-10 h-10 text-[#889989] mb-2" />
                  <b className="text-[16px] text-[#22332d]">No Workout Plan Yet</b>
                  <p className="text-[13px] mt-1 max-w-[280px]">
                    Choose your time, place, and goals on the left and click <b>Get my plan</b> to generate your workout.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Interactive How-To Panel matching attached mockup */}
          {planResult && inspectedIndex !== null && planResult.items[inspectedIndex] && (
            <div id="exercise-howto-section" className="mt-2 scroll-mt-6">
              <HowToPanel
                item={planResult.items[inspectedIndex]}
                currentIndex={inspectedIndex}
                totalItems={planResult.items.length}
                onClose={() => setInspectedIndex(null)}
                onNext={() => {
                  if (inspectedIndex < planResult.items.length - 1) {
                    setInspectedIndex((i) => (i !== null ? i + 1 : 0));
                  }
                }}
                onStartSetTimer={(item) => {
                  setTimerInitialIndex(inspectedIndex);
                  setIsTimerOpen(true);
                }}
              />
            </div>
          )}

          {/* Disclaimer Line */}
          <div className="text-center py-2 text-[12px] text-[#5b6b64]">
            Calories burned are estimates.
          </div>
        </main>
      </div>

      {/* Workout Timer Modal */}
      {isTimerOpen && planResult && planResult.items.length > 0 && (
        <WorkoutTimerModal
          planItems={planResult.items}
          userWeightKg={userWeightKg}
          initialItemIndex={timerInitialIndex}
          onClose={() => setIsTimerOpen(false)}
          onFinishAndLog={handleWorkoutFinished}
        />
      )}

      {/* Manual Workout Log Modal */}
      {isManualLogOpen && (
        <ManualWorkoutLogModal
          userWeightKg={userWeightKg}
          onClose={() => setIsManualLogOpen(false)}
          onSuccess={(logged) => {
            setToastMsg(`Logged ${logged.name} (${logged.calories_burned} kcal)!`);
            setTimeout(() => setToastMsg(null), 5000);
          }}
        />
      )}
    </div>
  );
}
