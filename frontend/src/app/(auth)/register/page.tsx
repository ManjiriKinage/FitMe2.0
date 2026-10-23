"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { ActivityLevelType, FitnessGoalType, GenderType, CalorieCalculationResult } from "@/types";
import {
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
  User,
  Scale,
  Ruler,
  Calendar,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Flame,
  Info
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();

  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState<number>(25);
  const [gender, setGender] = useState<GenderType>("female");
  const [heightCm, setHeightCm] = useState<number>(165);
  const [currentWeightKg, setCurrentWeightKg] = useState<number>(65);
  const [activityLevel, setActivityLevel] = useState<ActivityLevelType>("moderately_active");
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoalType>("lose_weight");
  const [targetWeightKg, setTargetWeightKg] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalorieCalculationResult | null>(null);
  const [calculatingPreview, setCalculatingPreview] = useState(false);

  // Live calorie calculation preview whenever metrics change
  useEffect(() => {
    let active = true;
    const fetchPreview = async () => {
      if (!age || !heightCm || !currentWeightKg) return;
      setCalculatingPreview(true);
      try {
        const res = await api.calculatePreview({
          age: Number(age),
          gender,
          height_cm: Number(heightCm),
          current_weight_kg: Number(currentWeightKg),
          activity_level: activityLevel,
          fitness_goal: fitnessGoal,
          target_weight_kg: targetWeightKg ? Number(targetWeightKg) : undefined,
        });
        if (active) setPreview(res);
      } catch (e) {
        // Silent catch for live preview
      } finally {
        if (active) setCalculatingPreview(false);
      }
    };

    const timer = setTimeout(fetchPreview, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [age, gender, heightCm, currentWeightKg, activityLevel, fitnessGoal, targetWeightKg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (age < 10 || age > 120) {
      setErrorMsg("Please enter a valid age.");
      return;
    }

    setLoading(true);

    try {
      // 1. Supabase Auth Sign Up
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (authError) throw authError;

      const user = authData.user;
      if (!user) {
        throw new Error("Could not complete user registration.");
      }

      // If email confirmation is required, Supabase returns a user but not an active session
      // If session exists or auto-confirmed, create profile on backend
      try {
        await api.createProfile({
          full_name: fullName.trim(),
          age: Number(age),
          gender,
          height_cm: Number(heightCm),
          current_weight_kg: Number(currentWeightKg),
          activity_level: activityLevel,
          fitness_goal: fitnessGoal,
          target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
        });
      } catch (profileErr: any) {
        console.warn("Profile creation response:", profileErr);
        // If profile creation failed because confirmation email was sent, inform user
      }

      if (authData.session) {
        router.push("/home");
      } else {
        // Confirmation email mode
        alert("Account registered successfully! Please check your email to confirm your account, then log in.");
        router.push("/login");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Registration failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream py-10 px-4 flex flex-col justify-center items-center">
      <div className="max-w-4xl w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-charcoal flex items-center justify-center text-cream font-bold text-lg shadow-soft">
              <span className="text-sage font-black">.</span>Fit
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-charcoal">FitMe</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-charcoal tracking-tight">Create your personal profile</h1>
          <p className="text-sm text-charcoal/60 mt-1 max-w-md mx-auto">
            Get personalized Mifflin-St Jeor daily calories and start logging foods effortlessly.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Form (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-4xl p-6 sm:p-8 border border-mint shadow-soft-lg">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Account Credentials */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal/50 pb-2 border-b border-charcoal/5">
                  1. Account Information
                </h2>

                <div>
                  <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Zahra Sharma"
                      className="w-full pl-10 pr-4 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="zahra@example.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Physical Bio-metrics */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal/50 pb-2 border-b border-charcoal/5">
                  2. Body Metrics & Biological Data
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Age (Years)</label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={120}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as GenderType)}
                      className="w-full px-3 py-2 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Height (cm)</label>
                    <input
                      type="number"
                      required
                      min={50}
                      max={250}
                      value={heightCm}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Weight (kg)</label>
                    <input
                      type="number"
                      required
                      step="0.1"
                      min={20}
                      max={300}
                      value={currentWeightKg}
                      onChange={(e) => setCurrentWeightKg(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Activity & Goals */}
              <div className="space-y-4 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal/50 pb-2 border-b border-charcoal/5">
                  3. Fitness Goal & Activity
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Primary Fitness Goal</label>
                    <select
                      value={fitnessGoal}
                      onChange={(e) => setFitnessGoal(e.target.value as FitnessGoalType)}
                      className="w-full px-3 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-medium"
                    >
                      <option value="lose_weight">Lose Weight (Sustainable Deficit)</option>
                      <option value="maintain_weight">Maintain Weight (TDEE balance)</option>
                      <option value="gain_muscle">Gain Muscle (High Protein & Lean Surplus)</option>
                      <option value="gain_weight">Gain Weight (Calorie Surplus)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Target Weight (kg, optional)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 60"
                      value={targetWeightKg}
                      onChange={(e) => setTargetWeightKg(e.target.value)}
                      className="w-full px-3 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-charcoal/70 mb-1.5">Daily Activity Level</label>
                  <select
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value as ActivityLevelType)}
                    className="w-full px-3 py-2.5 bg-cream/60 rounded-xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-medium"
                  >
                    <option value="sedentary">Sedentary (Desk job, little to no exercise)</option>
                    <option value="lightly_active">Lightly Active (1–3 days light exercise)</option>
                    <option value="moderately_active">Moderately Active (3–5 days moderate workout)</option>
                    <option value="very_active">Very Active (6–7 days hard workout)</option>
                    <option value="extra_active">Extra Active (Very heavy labor or athlete training)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-6 bg-charcoal text-cream font-bold rounded-2xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 text-base disabled:opacity-75"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Calculating & Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Profile & Open Dashboard</span>
                    <ArrowRight className="w-5 h-5 text-sage" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-charcoal/10 text-center">
              <p className="text-sm text-charcoal/70">
                Already registered?{" "}
                <Link href="/login" className="font-bold text-sage hover:text-sage-600 transition">
                  Sign In
                </Link>
              </p>
            </div>
          </div>

          {/* Live Preview Card (5 cols) */}
          <div className="lg:col-span-5 bg-charcoal text-cream rounded-4xl p-6 sm:p-7 shadow-soft-lg space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-cream/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sage" />
                <h3 className="font-bold text-base text-cream">Live Target Preview</h3>
              </div>
              {calculatingPreview && <Loader2 className="w-4 h-4 animate-spin text-sage" />}
            </div>

            {preview ? (
              <div className="space-y-5">
                {/* Calories Budget Ring Card */}
                <div className="bg-charcoal-light/70 rounded-3xl p-5 border border-cream/10 text-center">
                  <span className="text-xs font-semibold text-cream/70 uppercase tracking-wider block mb-1">
                    Recommended Daily Goal
                  </span>
                  <div className="text-4xl font-black text-sage flex items-center justify-center gap-1">
                    {preview.daily_calorie_target}
                    <span className="text-sm font-medium text-cream/60">kcal/day</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-cream/10 text-xs">
                    <div>
                      <span className="text-cream/50 block">Est. BMR</span>
                      <span className="font-bold text-cream text-sm">{preview.bmr} kcal</span>
                    </div>
                    <div>
                      <span className="text-cream/50 block">Est. TDEE</span>
                      <span className="font-bold text-cream text-sm">{preview.tdee} kcal</span>
                    </div>
                  </div>
                </div>

                {/* BMI Screening Context */}
                <div className="bg-cream/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-cream/70 block">Body Mass Index (BMI)</span>
                    <span className="font-extrabold text-base text-cream">{preview.bmi}</span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sage/30 text-cream border border-sage/40">
                    {preview.bmi_category}
                  </span>
                </div>

                {/* Target Macros */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cream/60 mb-2.5">
                    Target Macro Distribution
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-cream/10 rounded-2xl p-3 border border-cream/5">
                      <span className="text-[11px] text-accent-blue block font-semibold">Carbs</span>
                      <span className="font-bold text-sm text-cream">{preview.macro_targets.carbohydrates_g}g</span>
                    </div>
                    <div className="bg-cream/10 rounded-2xl p-3 border border-cream/5">
                      <span className="text-[11px] text-accent-yellow block font-semibold">Protein</span>
                      <span className="font-bold text-sm text-cream">{preview.macro_targets.protein_g}g</span>
                    </div>
                    <div className="bg-cream/10 rounded-2xl p-3 border border-cream/5">
                      <span className="text-[11px] text-accent-emerald block font-semibold">Fats</span>
                      <span className="font-bold text-sm text-cream">{preview.macro_targets.fat_g}g</span>
                    </div>
                  </div>
                </div>

                {/* Scientific Explanation */}
                <div className="bg-charcoal-dark/70 rounded-2xl p-4 text-xs text-cream/75 leading-relaxed border border-cream/5 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
                  <p>{preview.explanation}</p>
                </div>

                {/* Safety warnings if any */}
                {preview.warnings && preview.warnings.length > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-600/30 text-amber-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span>{preview.warnings[0]}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-cream/50 text-sm">
                Enter your age, height, and weight to view your real-time Mifflin-St Jeor recommendation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
