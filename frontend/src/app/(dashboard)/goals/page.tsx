"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import {
  UserProfile,
  ActivityLevelType,
  FitnessGoalType,
  PaceType,
  GoalRecalculateResponse,
} from "@/types";
import Navbar from "@/components/Navbar";
import { calculateDailyTarget, Pace } from "@/lib/nutrition";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export default function GoalsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Form Fields
  const [weightStr, setWeightStr] = useState<string>("70");
  const [heightStr, setHeightStr] = useState<string>("170");
  const [ageStr, setAgeStr] = useState<string>("25");
  const [targetWeightStr, setTargetWeightStr] = useState<string>("65");
  const [primaryGoal, setPrimaryGoal] = useState<"lose" | "maintain" | "gain">("lose");
  const [pace, setPace] = useState<Pace>("steady");
  const [activityLevel, setActivityLevel] = useState<ActivityLevelType>("moderately_active");

  // Custom Target override state
  const [isCustomTargetOpen, setIsCustomTargetOpen] = useState(false);
  const [customCaloriesStr, setCustomCaloriesStr] = useState<string>("");

  // Exercise Calorie Add-Back setting (Off / Half / All)
  const [addbackMode, setAddbackMode] = useState<"off" | "half" | "all">("all");

  // Feedback messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadGoals() {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        try {
          const res = await api.getGoals();
          const p = res.profile;
          setProfile(p);
          if (p.current_weight_kg) setWeightStr(String(p.current_weight_kg));
          if (p.height_cm) setHeightStr(String(p.height_cm));
          if (p.age) setAgeStr(String(p.age));
          if (p.target_weight_kg) setTargetWeightStr(String(p.target_weight_kg));

          // Map goal
          if (p.fitness_goal === "gain_weight" || p.fitness_goal === "gain_muscle" || (p.fitness_goal as string) === "gain") {
            setPrimaryGoal("gain");
          } else if (p.fitness_goal === "maintain_weight" || (p.fitness_goal as string) === "maintain") {
            setPrimaryGoal("maintain");
          } else {
            setPrimaryGoal("lose");
          }

          if (p.pace && (p.pace === "slow" || p.pace === "steady" || p.pace === "faster")) {
            setPace(p.pace);
          }

          if (p.activity_level) {
            setActivityLevel(p.activity_level);
          }

          if (p.daily_calorie_target) {
            setCustomCaloriesStr(String(p.daily_calorie_target));
          }
        } catch (apiErr: any) {
          console.warn("api.getGoals failed, falling back to direct Supabase profile:", apiErr);
          const { data: directProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (directProfile) {
            setProfile(directProfile as UserProfile);
            if (directProfile.current_weight_kg) setWeightStr(String(directProfile.current_weight_kg));
            if (directProfile.height_cm) setHeightStr(String(directProfile.height_cm));
            if (directProfile.age) setAgeStr(String(directProfile.age));
            if (directProfile.target_weight_kg) setTargetWeightStr(String(directProfile.target_weight_kg));
          }
        }

        // Fetch exercise prefs for add-back setting
        try {
          const prefsRes = await api.getExercisePrefs();
          if (prefsRes?.prefs?.addback_mode) {
            setAddbackMode(prefsRes.prefs.addback_mode as "off" | "half" | "all");
          }
        } catch (prefErr) {
          console.warn("Could not load exercise prefs:", prefErr);
        }
      } catch (err: any) {
        console.error("Error loading goals:", err);
      } finally {
        setLoading(false);
      }
    }

    loadGoals();
  }, [router]);

  // Numeric parsers
  const weight = parseFloat(weightStr) || 0;
  const height = parseFloat(heightStr) || 0;
  const age = parseInt(ageStr, 10) || 0;
  const targetWeight = targetWeightStr.trim() ? parseFloat(targetWeightStr) : null;

  // Direction validation for target weight
  const isTargetWeightInvalid = useMemo(() => {
    if (targetWeight == null || isNaN(targetWeight) || weight <= 0) return false;
    if (primaryGoal === "lose" && targetWeight >= weight) return true;
    if (primaryGoal === "gain" && targetWeight <= weight) return true;
    return false;
  }, [primaryGoal, targetWeight, weight]);

  const targetWeightError = useMemo(() => {
    if (!isTargetWeightInvalid || targetWeight == null) return null;
    if (primaryGoal === "lose") {
      return "Target weight must be below your current weight to lose weight.";
    }
    if (primaryGoal === "gain") {
      return "Target weight must be above your current weight to gain weight.";
    }
    return null;
  }, [isTargetWeightInvalid, primaryGoal, targetWeight]);

  // Compute live target preview using the pure function (never blocked by profile loading)
  const calculationResult = useMemo(() => {
    if (weight <= 0 || height <= 0 || age <= 0) return null;

    return calculateDailyTarget({
      weight,
      height,
      age,
      gender: profile?.gender || "female",
      activity: activityLevel,
      goal: primaryGoal === "lose" ? "lose_weight" : primaryGoal === "gain" ? "gain_weight" : "maintain_weight",
      pace: primaryGoal === "maintain" ? "steady" : pace,
      targetWeight: isTargetWeightInvalid ? null : targetWeight,
    });
  }, [weight, height, age, profile?.gender, activityLevel, primaryGoal, pace, isTargetWeightInvalid, targetWeight]);

  // Estimated completion date string
  const estimatedTargetDate = useMemo(() => {
    if (!calculationResult || calculationResult.weeksToGoal == null) return null;
    const now = new Date();
    const targetDate = new Date(now.getTime() + calculationResult.weeksToGoal * 7 * 24 * 60 * 60 * 1000);
    const day = targetDate.getDate();
    const month = targetDate.toLocaleString("en-US", { month: "short" });
    return `About ${calculationResult.weeksToGoal} weeks · around ${day} ${month}`;
  }, [calculationResult]);

  // Custom calories difference calculation
  const customCaloriesNum = parseInt(customCaloriesStr, 10) || 0;
  const isCustomFarFromRecommended = useMemo(() => {
    if (!isCustomTargetOpen || !calculationResult || !customCaloriesNum) return false;
    return Math.abs(customCaloriesNum - calculationResult.target) > 300;
  }, [isCustomTargetOpen, calculationResult, customCaloriesNum]);

  // Pace label helper
  const paceKgPerWeek = pace === "slow" ? 0.25 : pace === "faster" ? 0.75 : 0.5;

  // Save handler
  const handleSave = async (overrideTarget?: number, redirectToHome: boolean = false) => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const finalGoal: FitnessGoalType =
        primaryGoal === "lose"
          ? "lose_weight"
          : primaryGoal === "gain"
          ? "gain_weight"
          : "maintain_weight";

      const calorieTargetToSave = overrideTarget !== undefined
        ? overrideTarget
        : isCustomTargetOpen && customCaloriesNum > 500
        ? customCaloriesNum
        : calculationResult?.target || 0;

      const payload: Record<string, any> = {
        current_weight_kg: weight,
        target_weight_kg: isTargetWeightInvalid ? null : targetWeight,
        activity_level: activityLevel,
        fitness_goal: finalGoal,
        age: age,
        height_cm: height,
        pace: primaryGoal === "maintain" ? "steady" : pace,
      };

      if (calorieTargetToSave > 0) {
        payload.daily_calorie_target = calorieTargetToSave;
      }

      // 1. Save via Backend API
      let newDailyTarget = calorieTargetToSave;
      let newBmr = calculationResult?.bmr;
      let newTdee = calculationResult?.tdee;

      try {
        const res = await api.recalculateGoals(payload);
        if (res.new_daily_calorie_target) newDailyTarget = res.new_daily_calorie_target;
        if (res.calculation_details?.bmr) newBmr = res.calculation_details.bmr;
        if (res.calculation_details?.tdee) newTdee = res.calculation_details.tdee;
      } catch (apiErr: any) {
        console.warn("api.recalculateGoals failed, falling back to direct Supabase update:", apiErr);
      }

      // 2. Also update Supabase directly for guaranteed instant consistency
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const directUpdate: Record<string, any> = {
            current_weight_kg: weight,
            target_weight_kg: isTargetWeightInvalid ? null : targetWeight,
            activity_level: activityLevel,
            fitness_goal: finalGoal,
            age: age,
            height_cm: height,
            daily_calorie_target: newDailyTarget,
            updated_at: new Date().toISOString(),
          };
          if (newBmr) directUpdate.bmr = newBmr;
          if (newTdee) directUpdate.tdee = newTdee;

          const { error: directErr } = await supabase.from("profiles").update(directUpdate).eq("id", user.id);
          if (directErr) {
            console.warn("Direct Supabase update error, retrying with core fields:", directErr);
            delete directUpdate.bmr;
            delete directUpdate.tdee;
            await supabase.from("profiles").update(directUpdate).eq("id", user.id);
          }
        }
      } catch (directErr) {
        console.warn("Direct Supabase update error:", directErr);
      }

      // 3. Persist to localStorage and dispatch event for instant dashboard sync
      if (typeof window !== "undefined") {
        localStorage.setItem("fitme_daily_calorie_target", String(newDailyTarget));
        localStorage.setItem("fitme_fitness_goal", finalGoal);
        localStorage.setItem("fitme_current_weight_kg", String(weight));
        if (newBmr) localStorage.setItem("fitme_bmr", String(newBmr));
        if (newTdee) localStorage.setItem("fitme_tdee", String(newTdee));
        window.dispatchEvent(new Event("fitme_goals_updated"));
      }

      // 4. Update exercise calorie add-back setting
      try {
        await api.updateExercisePrefs({
          addback_mode: addbackMode,
          daily_cap: 500,
        });
      } catch (prefErr) {
        console.warn("Could not save exercise prefs:", prefErr);
      }

      setSuccessMsg("Goal updated successfully! Target saved to dashboard.");
      
      // Update local profile state
      setProfile((prev) => ({
        ...(prev || ({} as any)),
        current_weight_kg: weight,
        target_weight_kg: isTargetWeightInvalid ? null : targetWeight,
        activity_level: activityLevel,
        fitness_goal: finalGoal,
        age: age,
        height_cm: height,
        pace: pace,
        daily_calorie_target: newDailyTarget,
        bmr: newBmr,
        tdee: newTdee,
      }));

      // If user clicked "Use this target", navigate to dashboard immediately
      if (redirectToHome) {
        router.push("/home");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update goals.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#7c9a7e]" />
          <p className="text-sm font-semibold text-[#22332d]/70">
            Loading your goals...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col md:flex-row gap-6 p-4 sm:p-5 lg:p-6 text-[#22332d] selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      {/* Sidebar Navigation */}
      <Navbar userFullName={profile?.full_name} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1100px] flex flex-col p-0 sm:py-2 mx-auto w-full">
        <header className="mb-6">
          <h1 className="text-[34px] sm:text-[36px] font-bold text-[#22332d] tracking-tight">
            Set up goals
          </h1>
          <p className="text-[14px] text-[#5b6b64] mt-2">
            Update your details and we&apos;ll recalculate your daily target. Past food logs stay unchanged.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 p-3.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mt-4 p-3.5 rounded-[14px] bg-[#eaf4fd] border border-[#cfe5f7] text-[#22332d] text-xs flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#7c9a7e] flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/home")}
                className="font-semibold text-[#22332d] underline hover:text-[#7c9a7e] flex-shrink-0 ml-2"
              >
                Go to Dashboard &rarr;
              </button>
            </div>
          )}
        </header>

        {/* 2-Column Responsive Layout: Left Form Card (1.5fr) + Right Dark Recommended Card (1fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
          {/* Left Form Card */}
          <div className="bg-white rounded-[28px] p-6 sm:p-8 shadow-sm border border-[#dfe6e1]/40">
            {/* BODY SECTION */}
            <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase mb-3">
              BODY
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <label className="block">
                <span className="text-[13px] font-semibold text-[#3a4a43]">
                  Current weight (kg)
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="20"
                  max="300"
                  value={weightStr}
                  onChange={(e) => setWeightStr(e.target.value)}
                  placeholder="70"
                  className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:outline-none focus:border-[#7c9a7e] transition-colors"
                />
              </label>

              <label className="block">
                <span className="text-[13px] font-semibold text-[#3a4a43]">
                  Height (cm)
                </span>
                <input
                  type="number"
                  step="1"
                  min="50"
                  max="250"
                  value={heightStr}
                  onChange={(e) => setHeightStr(e.target.value)}
                  placeholder="170"
                  className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:outline-none focus:border-[#7c9a7e] transition-colors"
                />
              </label>

              <label className="block">
                <span className="text-[13px] font-semibold text-[#3a4a43]">
                  Age (years)
                </span>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="120"
                  value={ageStr}
                  onChange={(e) => setAgeStr(e.target.value)}
                  placeholder="25"
                  className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:outline-none focus:border-[#7c9a7e] transition-colors"
                />
              </label>
            </div>

            {/* GOAL SECTION */}
            <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase mb-3">
              GOAL
            </div>
            <div className="space-y-4">
              {/* Target weight (optional) */}
              <div>
                <label className="block">
                  <span className="text-[13px] font-semibold text-[#3a4a43]">
                    Target weight (kg, optional)
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min="20"
                    max="300"
                    value={targetWeightStr}
                    onChange={(e) => setTargetWeightStr(e.target.value)}
                    placeholder="e.g. 65"
                    className={`w-full h-12 mt-1.5 px-4 rounded-[14px] border bg-white text-[15px] font-medium text-[#22332d] focus:outline-none transition-colors ${
                      targetWeightError ? "border-red-400 focus:border-red-500" : "border-[#dfe6e1] focus:border-[#7c9a7e]"
                    }`}
                  />
                </label>
                {targetWeightError && (
                  <p className="text-[12px] text-red-600 font-medium mt-1.5">
                    {targetWeightError}
                  </p>
                )}
              </div>

              {/* Primary Goal Segmented Control */}
              <div>
                <span className="text-[13px] font-semibold text-[#3a4a43] block mb-1.5">
                  Primary goal
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPrimaryGoal("lose")}
                    className={`flex-1 py-3 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      primaryGoal === "lose"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Lose weight
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrimaryGoal("maintain")}
                    className={`flex-1 py-3 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      primaryGoal === "maintain"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Maintain
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrimaryGoal("gain")}
                    className={`flex-1 py-3 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      primaryGoal === "gain"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Gain weight
                  </button>
                </div>
              </div>

              {/* Pace Segmented Control - Hidden when primaryGoal === 'maintain' */}
              {primaryGoal !== "maintain" && (
                <div>
                  <span className="text-[13px] font-semibold text-[#3a4a43] block mb-1.5">
                    Pace{" "}
                    <span className="text-[#5b6b64] font-normal">
                      · how fast you want to {primaryGoal === "lose" ? "lose" : "gain"}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPace("slow")}
                      className={`flex-1 py-2.5 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                        pace === "slow"
                          ? "bg-[#22332d] text-white border-[#22332d]"
                          : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                      }`}
                    >
                      Slow
                      <small className={`block text-[11px] font-normal mt-0.5 ${pace === "slow" ? "text-white/80" : "text-[#5b6b64]"}`}>
                        0.25 kg/week
                      </small>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPace("steady")}
                      className={`flex-1 py-2.5 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                        pace === "steady"
                          ? "bg-[#22332d] text-white border-[#22332d]"
                          : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                      }`}
                    >
                      Steady
                      <small className={`block text-[11px] font-normal mt-0.5 ${pace === "steady" ? "text-white/80" : "text-[#5b6b64]"}`}>
                        0.5 kg/week · Recommended
                      </small>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPace("faster")}
                      className={`flex-1 py-2.5 px-2 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                        pace === "faster"
                          ? "bg-[#22332d] text-white border-[#22332d]"
                          : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                      }`}
                    >
                      Faster
                      <small className={`block text-[11px] font-normal mt-0.5 ${pace === "faster" ? "text-white/80" : "text-[#5b6b64]"}`}>
                        0.75 kg/week
                      </small>
                    </button>
                  </div>
                </div>
              )}

              {/* Activity Level Segmented 2x2 Grid */}
              <div>
                <span className="text-[13px] font-semibold text-[#3a4a43] block mb-1.5">
                  Activity level
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActivityLevel("sedentary")}
                    className={`py-3 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      activityLevel === "sedentary"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Sedentary
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityLevel("lightly_active")}
                    className={`py-3 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      activityLevel === "lightly_active"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Light · 1–3 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityLevel("moderately_active")}
                    className={`py-3 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      activityLevel === "moderately_active"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Moderate · 3–5 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityLevel("very_active")}
                    className={`py-3 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      activityLevel === "very_active"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Very active · 6–7 days
                  </button>
                </div>
              </div>

              {/* Exercise Calorie Add-Back Setting */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-[#3a4a43] block">
                    Exercise calorie add-back
                  </span>
                  <span className="text-[11px] font-semibold text-[#5b6b64] bg-[#f4f8f5] px-2.5 py-0.5 rounded-full border border-[#eaf1ec]">
                    Cap: 500 kcal/day
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddbackMode("off")}
                    className={`py-2.5 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      addbackMode === "off"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Off
                    <small className={`block text-[11px] font-normal mt-0.5 ${addbackMode === "off" ? "text-white/80" : "text-[#5b6b64]"}`}>
                      0% added back
                    </small>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddbackMode("half")}
                    className={`py-2.5 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      addbackMode === "half"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    Half
                    <small className={`block text-[11px] font-normal mt-0.5 ${addbackMode === "half" ? "text-white/80" : "text-[#5b6b64]"}`}>
                      50% added back
                    </small>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddbackMode("all")}
                    className={`py-2.5 px-3 text-center rounded-[14px] border font-semibold text-[14px] transition-all ${
                      addbackMode === "all"
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    All
                    <small className={`block text-[11px] font-normal mt-0.5 ${addbackMode === "all" ? "text-white/80" : "text-[#5b6b64]"}`}>
                      100% (Default)
                    </small>
                  </button>
                </div>
                <p className="text-[12px] text-[#5b6b64] mt-2 leading-relaxed">
                  Adds calories burned during exercise back to your daily budget, capped at 500 kcal/day to protect weight loss progress.
                </p>
              </div>
            </div>

            {/* Recalculate & save goal button */}
            <button
              type="button"
              disabled={saving || !calculationResult}
              onClick={() => handleSave()}
              className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182520] text-white font-semibold text-[15px] mt-7 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving goal...
                </>
              ) : (
                "Recalculate & save goal"
              )}
            </button>
          </div>

          {/* Right Dark Card "Recommended for you" */}
          <div className="bg-[#22332d] text-white rounded-[28px] p-7 shadow-soft self-start">
            <div className="text-[12px] font-semibold tracking-[0.08em] text-[#b7cdb9] uppercase">
              RECOMMENDED FOR YOU
            </div>

            {/* Big Target Number */}
            <div className="text-[52px] font-bold text-white mt-2 leading-none">
              {calculationResult?.target ? (
                <>
                  {calculationResult.target}{" "}
                  <span className="text-[18px] font-medium text-[#b7cdb9]">kcal/day</span>
                </>
              ) : (
                "—"
              )}
            </div>

            <p className="text-[14px] text-[#b7cdb9] mt-2">
              Based on your current weight, height, age and activity
            </p>

            {/* Safety Floor note */}
            {calculationResult?.floorApplied && (
              <div className="mt-3 p-3 rounded-[14px] bg-[#2d4238] border border-[#7c9a7e]/40 text-[#dfe9e2] text-xs">
                This is the lowest safe target, so we&apos;ve set it to {calculationResult.target} kcal.
              </div>
            )}

            {/* Macros Tiles Grid (Carbs, Protein, Fats) */}
            <div className="grid grid-cols-3 gap-2.5 mt-6">
              <div className="bg-[#2d4238] rounded-[16px] p-3 text-center border border-[#3d5247]/30">
                <small className="block text-[#b7cdb9] text-[12px] font-medium">Carbs</small>
                <b className="text-[20px] font-bold text-white block mt-0.5">
                  {calculationResult?.carbs ? `${calculationResult.carbs}g` : "—"}
                </b>
              </div>
              <div className="bg-[#2d4238] rounded-[16px] p-3 text-center border border-[#3d5247]/30">
                <small className="block text-[#b7cdb9] text-[12px] font-medium">Protein</small>
                <b className="text-[20px] font-bold text-white block mt-0.5">
                  {calculationResult?.protein ? `${calculationResult.protein}g` : "—"}
                </b>
              </div>
              <div className="bg-[#2d4238] rounded-[16px] p-3 text-center border border-[#3d5247]/30">
                <small className="block text-[#b7cdb9] text-[12px] font-medium">Fats</small>
                <b className="text-[20px] font-bold text-white block mt-0.5">
                  {calculationResult?.fats ? `${calculationResult.fats}g` : "—"}
                </b>
              </div>
            </div>

            {/* How it's worked out */}
            <div className="border-t border-[#3d5247] mt-5 pt-4 text-[13px] text-[#b7cdb9] leading-[1.7]">
              <div>
                Resting burn (BMR){" "}
                <b className="text-white">
                  {calculationResult?.bmr ? calculationResult.bmr.toLocaleString() : "—"}
                </b>
              </div>
              <div>
                With activity (TDEE){" "}
                <b className="text-white">
                  {calculationResult?.tdee ? calculationResult.tdee.toLocaleString() : "—"}
                </b>
              </div>
              {calculationResult && (
                <div>
                  {primaryGoal === "lose" && (
                    <>
                      Daily deficit <b className="text-white">−{calculationResult.dailyChange}</b> → about {paceKgPerWeek} kg/week
                    </>
                  )}
                  {primaryGoal === "gain" && (
                    <>
                      Daily surplus <b className="text-white">+{calculationResult.dailyChange}</b> → about {paceKgPerWeek} kg/week
                    </>
                  )}
                  {primaryGoal === "maintain" && (
                    <>
                      Energy balance <b className="text-white">0</b> → maintenance
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Estimated time to reach target weight box */}
            {estimatedTargetDate && !isTargetWeightInvalid && (
              <div className="bg-[#2d4238] rounded-[16px] p-3.5 mt-4 text-left border border-[#3d5247]/30">
                <small className="block text-[#b7cdb9] text-[12px]">
                  Estimated time to reach {targetWeight} kg
                </small>
                <b className="text-[15px] font-bold text-white block mt-0.5">
                  {estimatedTargetDate}
                </b>
              </div>
            )}

            {/* "Use this target" button */}
            <button
              type="button"
              disabled={saving || !calculationResult}
              onClick={() => handleSave(calculationResult?.target, true)}
              className="w-full h-[52px] rounded-full bg-[#7c9a7e] hover:bg-[#6e8a70] text-white font-semibold text-[15px] mt-4 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {saving ? "Saving & updating dashboard..." : "Use this target"}
            </button>

            {/* Footnote */}
            <p className="text-[12px] text-[#b7cdb9] mt-3.5 leading-[1.5]">
              Updates as you edit. Estimates only, not medical advice. Never set below 1,200 kcal.
            </p>

            {/* "Set my own target" link and collapsible input */}
            <div className="border-t border-[#3d5247] mt-5 pt-4">
              <button
                type="button"
                onClick={() => setIsCustomTargetOpen((prev) => !prev)}
                className="text-[13px] text-[#b7cdb9] hover:text-white font-medium inline-flex items-center gap-1 transition-colors underline underline-offset-2"
              >
                <span>{isCustomTargetOpen ? "Hide custom calorie target" : "Set my own target"}</span>
                {isCustomTargetOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isCustomTargetOpen && (
                <div className="mt-3 p-3.5 rounded-[16px] bg-[#2d4238] border border-[#3d5247]/50 space-y-2.5">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#b7cdb9] block">
                      Custom Daily Target (kcal)
                    </span>
                    <input
                      type="number"
                      step="50"
                      min="500"
                      max="10000"
                      value={customCaloriesStr}
                      onChange={(e) => setCustomCaloriesStr(e.target.value)}
                      placeholder={calculationResult?.target ? String(calculationResult.target) : "2000"}
                      className="w-full h-10 mt-1 px-3 rounded-[12px] border border-[#3d5247] bg-[#22332d] text-white text-[14px] font-semibold focus:outline-none focus:border-[#7c9a7e]"
                    />
                  </label>

                  {isCustomFarFromRecommended && calculationResult && (
                    <p className="text-[12px] text-[#e0cf87] font-medium leading-snug">
                      This is far from the recommended {calculationResult.target} kcal.
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={saving || !customCaloriesNum}
                      onClick={() => handleSave(customCaloriesNum)}
                      className="flex-1 py-2 px-3 rounded-full bg-[#7c9a7e] hover:bg-[#6e8a70] text-white text-[13px] font-semibold transition-colors disabled:opacity-50"
                    >
                      Save custom target
                    </button>
                    {calculationResult && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomCaloriesStr(String(calculationResult.target));
                        }}
                        className="py-2 px-3 rounded-full bg-[#22332d] hover:bg-[#182520] text-[#b7cdb9] text-[13px] font-medium border border-[#3d5247] transition-colors"
                      >
                        Reset to {calculationResult.target}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
