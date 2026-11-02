"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import {
  ActivityLevelType,
  FitnessGoalType,
  GenderType,
  CalorieCalculationResult,
} from "@/types";
import { calculateDailyTarget } from "@/lib/nutrition";
import LiveTargetPreviewCard from "@/components/auth/LiveTargetPreviewCard";
import { AlertCircle, Loader2 } from "lucide-react";

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

  // Live calorie calculation preview using pure calculation function
  const preview: CalorieCalculationResult | null = useMemo(() => {
    if (!age || !heightCm || !currentWeightKg) return null;
    const res = calculateDailyTarget({
      weight: Number(currentWeightKg),
      height: Number(heightCm),
      age: Number(age),
      gender: gender,
      activity: activityLevel,
      goal: fitnessGoal,
      pace: "steady",
      targetWeight: targetWeightKg ? Number(targetWeightKg) : null,
    });

    const heightM = Number(heightCm) / 100;
    const bmiVal = Number((Number(currentWeightKg) / (heightM * heightM)).toFixed(1));
    const bmiCat = bmiVal < 18.5 ? "Underweight" : bmiVal < 25 ? "Normal weight" : bmiVal < 30 ? "Overweight" : "Obese";

    return {
      bmr: res.bmr,
      tdee: res.tdee,
      daily_calorie_target: res.target,
      bmi: bmiVal,
      bmi_category: bmiCat,
      macro_targets: {
        carbohydrates_g: res.carbs,
        protein_g: res.protein,
        fat_g: res.fats,
      },
      explanation: "",
      warnings: [],
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

      // 2. Create profile on backend
      try {
        await api.createProfile({
          full_name: fullName.trim(),
          age: Number(age),
          gender,
          height_cm: Number(heightCm),
          current_weight_kg: Number(currentWeightKg),
          activity_level: activityLevel,
          fitness_goal: fitnessGoal,
          pace: "steady",
          target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
        });
      } catch (profileErr: any) {
        console.warn("Profile creation response:", profileErr);
      }

      if (authData.session) {
        router.push("/home");
      } else {
        alert(
          "Account registered successfully! Please check your email to confirm your account, then log in."
        );
        router.push("/login");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Registration failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#faf9f6] flex flex-col items-center px-4 sm:px-8 lg:px-28 py-8 selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      <div className="w-full max-w-[1280px] flex flex-col items-center">
        {/* Brand Logo Header */}
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold text-[22px] text-[#22332d] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] rounded-xl"
          aria-label="FitMe Home"
        >
          <span
            className="w-10 h-10 rounded-[12px] bg-[#22332d] text-white flex items-center justify-center text-sm font-bold tracking-tight select-none"
            aria-hidden="true"
          >
            .fit
          </span>
          <span>FitMe</span>
        </Link>

        <h1 className="text-[34px] sm:text-[38px] font-bold text-[#22332d] mt-4 tracking-tight text-center">
          Create your profile
        </h1>
        <p className="text-[14px] text-[#5b6b64] text-center mt-2">
          Get a personalised daily calorie target and start logging in minutes.
        </p>

        {errorMsg && (
          <div
            role="alert"
            className="w-full max-w-2xl mt-4 p-3.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 2-Column Responsive Layout (.c on left, .dk on right) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-7 w-full items-start">
          {/* Left Form Card (.c) */}
          <div className="bg-white rounded-[28px] p-6 sm:p-8 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col">
            <form onSubmit={handleSubmit} className="flex flex-col">
              {/* 1 · ACCOUNT */}
              <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase mb-3">
                1 · ACCOUNT
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="register-fullname"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Full name
                  </label>
                  <input
                    id="register-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Zahra Sharma"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="register-email"
                      className="block text-[13px] font-semibold text-[#3a4a43]"
                    >
                      Email
                    </label>
                    <input
                      id="register-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-password"
                      className="block text-[13px] font-semibold text-[#3a4a43]"
                    >
                      Password
                    </label>
                    <input
                      id="register-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* 2 · BODY */}
              <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase mt-6 mb-3">
                2 · BODY
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="register-age"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Age
                  </label>
                  <input
                    id="register-age"
                    type="number"
                    required
                    min={10}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-gender"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Gender
                  </label>
                  <select
                    id="register-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as GenderType)}
                    className="w-full h-12 mt-1.5 px-3 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all cursor-pointer"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="register-height"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Height (cm)
                  </label>
                  <input
                    id="register-height"
                    type="number"
                    required
                    min={50}
                    max={250}
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value))}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="register-weight"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Weight (kg)
                  </label>
                  <input
                    id="register-weight"
                    type="number"
                    required
                    step="0.1"
                    min={20}
                    max={300}
                    value={currentWeightKg}
                    onChange={(e) => setCurrentWeightKg(Number(e.target.value))}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>
              </div>

              {/* 3 · GOAL & ACTIVITY */}
              <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase mt-6 mb-3">
                3 · GOAL &amp; ACTIVITY
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="register-goal"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Primary goal
                  </label>
                  <select
                    id="register-goal"
                    value={fitnessGoal}
                    onChange={(e) => setFitnessGoal(e.target.value as FitnessGoalType)}
                    className="w-full h-12 mt-1.5 px-3 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all cursor-pointer"
                  >
                    <option value="lose_weight">Lose weight (sustainable)</option>
                    <option value="maintain_weight">Maintain weight</option>
                    <option value="gain_muscle">Gain muscle</option>
                    <option value="gain_weight">Gain weight</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="register-target-weight"
                      className="block text-[13px] font-semibold text-[#3a4a43]"
                    >
                      Target weight (optional)
                    </label>
                    <input
                      id="register-target-weight"
                      type="number"
                      step="0.1"
                      placeholder="e.g. 60"
                      value={targetWeightKg}
                      onChange={(e) => setTargetWeightKg(e.target.value)}
                      className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-activity"
                      className="block text-[13px] font-semibold text-[#3a4a43]"
                    >
                      Activity level
                    </label>
                    <select
                      id="register-activity"
                      value={activityLevel}
                      onChange={(e) =>
                        setActivityLevel(e.target.value as ActivityLevelType)
                      }
                      className="w-full h-12 mt-1.5 px-3 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all cursor-pointer"
                    >
                      <option value="sedentary">Sedentary (little or no exercise)</option>
                      <option value="lightly_active">Lightly active (1-3 days/week)</option>
                      <option value="moderately_active">Moderately active (3-5 days/week)</option>
                      <option value="very_active">Very active (6-7 days/week)</option>
                      <option value="extra_active">Extra active (very hard exercise)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-7 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Calculating &amp; creating profile...</span>
                  </>
                ) : (
                  <span>Complete profile &amp; open dashboard &rarr;</span>
                )}
              </button>

              {/* Login link */}
              <p className="text-[14px] text-[#5b6b64] text-center mt-3.5">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-bold text-[#5f7d61] hover:text-[#22332d] transition-colors focus:outline-none focus:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </div>

          {/* Right Live Target Preview Card */}
          <LiveTargetPreviewCard
            preview={preview}
            calculating={false}
          />
        </div>
      </div>
    </main>
  );
}
