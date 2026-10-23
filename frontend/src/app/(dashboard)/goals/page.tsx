"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, ActivityLevelType, FitnessGoalType, GoalRecalculateResponse } from "@/types";
import Navbar from "@/components/Navbar";
import {
  Target,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Scale,
  Activity,
  Heart
} from "lucide-react";

export default function GoalsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Form Fields
  const [currentWeight, setCurrentWeight] = useState<number>(70);
  const [targetWeight, setTargetWeight] = useState<string>("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevelType>("moderately_active");
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoalType>("lose_weight");
  const [age, setAge] = useState<number>(25);
  const [heightCm, setHeightCm] = useState<number>(170);

  // Recalculation Results Modal/Banner
  const [recalcResult, setRecalcResult] = useState<GoalRecalculateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadGoals() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        const res = await api.getGoals();
        setProfile(res.profile);
        setCurrentWeight(res.profile.current_weight_kg);
        setTargetWeight(res.profile.target_weight_kg ? String(res.profile.target_weight_kg) : "");
        setActivityLevel(res.profile.activity_level);
        setFitnessGoal(res.profile.fitness_goal);
        setAge(res.profile.age);
        setHeightCm(res.profile.height_cm);
      } catch (err: any) {
        console.error("Error loading goals:", err);
      } finally {
        setLoading(false);
      }
    }

    loadGoals();
  }, [router]);

  const handleRecalculateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await api.recalculateGoals({
        current_weight_kg: Number(currentWeight),
        target_weight_kg: targetWeight ? Number(targetWeight) : null,
        activity_level: activityLevel,
        fitness_goal: fitnessGoal,
        age: Number(age),
        height_cm: Number(heightCm),
      });

      setRecalcResult(res);
      // Update local profile target
      if (profile) {
        setProfile({
          ...profile,
          daily_calorie_target: res.new_daily_calorie_target,
          current_weight_kg: Number(currentWeight),
          target_weight_kg: targetWeight ? Number(targetWeight) : null,
          activity_level: activityLevel,
          fitness_goal: fitnessGoal,
          age: Number(age),
          height_cm: Number(heightCm),
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to recalculate goals.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-sage" />
          <p className="text-sm font-semibold text-charcoal/70">Loading goal parameters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col md:flex-row text-charcoal selection:bg-sage/20 selection:text-charcoal">
      <Navbar userFullName={profile?.full_name} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full pb-24 md:pb-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mint text-charcoal text-xs font-bold mb-2">
            <Target className="w-4 h-4 text-sage" />
            <span>Goal Adjustment & Calorie Recalculation</span>
          </div>
          <h1 className="text-3xl font-extrabold text-charcoal tracking-tight">Set Up Goals</h1>
          <p className="text-sm text-charcoal/60 mt-1 max-w-2xl">
            Update your weight, target weight, activity, and primary fitness goal. When you save, FitMe recalculates your daily recommendation without modifying historical food logs.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-3xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Recalculation Results Comparison Banner */}
        {recalcResult && (
          <div className="mb-8 p-6 sm:p-7 rounded-4xl bg-white border-2 border-sage/40 shadow-soft-lg animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-charcoal/5">
              <span className="text-xs font-bold uppercase tracking-wider text-sage-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sage" />
                Calorie Recommendation Recalculated
              </span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-mint text-charcoal">
                Historical logs preserved
              </span>
            </div>

            {/* Old vs New Target Visualizer */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="p-4 rounded-3xl bg-cream/70 border border-charcoal/5 text-center">
                <span className="text-xs font-bold text-charcoal/50 uppercase block mb-1">Previous Target</span>
                <span className="text-2xl font-black text-charcoal/70">
                  {recalcResult.previous_daily_calorie_target} <span className="text-xs font-normal">kcal</span>
                </span>
              </div>

              <div className="flex items-center justify-center">
                <div className="px-4 py-2 rounded-2xl bg-charcoal text-cream font-bold text-xs flex items-center gap-2 shadow-sm">
                  {recalcResult.difference >= 0 ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-sage" />
                      <span>+{recalcResult.difference} kcal</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-amber-300" />
                      <span>{recalcResult.difference} kcal</span>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-3xl bg-mint border border-sage/30 text-center">
                <span className="text-xs font-bold text-charcoal/60 uppercase block mb-1">New Target</span>
                <span className="text-3xl font-black text-charcoal">
                  {recalcResult.new_daily_calorie_target} <span className="text-xs font-normal text-charcoal/70">kcal/day</span>
                </span>
              </div>
            </div>

            {/* Why it changed explanation */}
            <div className="bg-cream/60 rounded-2xl p-4 text-xs text-charcoal/80 space-y-2 border border-charcoal/5">
              <div className="font-bold text-charcoal flex items-center gap-1.5">
                <Info className="w-4 h-4 text-sage" />
                <span>Why your recommendation changed:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-charcoal/70 pl-2">
                {recalcResult.change_reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="pt-2 text-charcoal/80 leading-relaxed font-medium">
                {recalcResult.calculation_details.explanation}
              </p>
            </div>
          </div>
        )}

        {/* Goals Form */}
        <div className="bg-white rounded-4xl p-6 sm:p-8 border border-mint shadow-soft">
          <form onSubmit={handleRecalculateAndSave} className="space-y-6">
            {/* Weight inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-sage" />
                  Current Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min={20}
                  max={500}
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-sage" />
                  Target Weight (kg, optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={20}
                  max={500}
                  placeholder="e.g. 65"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                />
              </div>
            </div>

            {/* Goal & Activity inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-sage" />
                  Primary Fitness Goal
                </label>
                <select
                  value={fitnessGoal}
                  onChange={(e) => setFitnessGoal(e.target.value as FitnessGoalType)}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                >
                  <option value="lose_weight">Lose Weight (Sustainable Deficit)</option>
                  <option value="maintain_weight">Maintain Weight (TDEE Maintenance)</option>
                  <option value="gain_muscle">Gain Muscle (Lean Surplus + High Protein)</option>
                  <option value="gain_weight">Gain Weight (Calorie Surplus)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sage" />
                  Activity Level
                </label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value as ActivityLevelType)}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                >
                  <option value="sedentary">Sedentary (Desk job, little to no exercise)</option>
                  <option value="lightly_active">Lightly Active (1–3 days light exercise)</option>
                  <option value="moderately_active">Moderately Active (3–5 days moderate workout)</option>
                  <option value="very_active">Very Active (6–7 days hard workout)</option>
                  <option value="extra_active">Extra Active (Very heavy labor / 2x training)</option>
                </select>
              </div>
            </div>

            {/* Biological Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-charcoal/5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                  Age (Years)
                </label>
                <input
                  type="number"
                  required
                  min={10}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                  Height (cm)
                </label>
                <input
                  type="number"
                  required
                  min={50}
                  max={300}
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-4 px-6 bg-charcoal text-cream font-bold rounded-2xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 text-sm disabled:opacity-75"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-sage" />
                    <span>Recalculating Target...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-sage" />
                    <span>Recalculate & Save Goal</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
