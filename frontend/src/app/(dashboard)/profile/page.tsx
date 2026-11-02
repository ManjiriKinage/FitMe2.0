"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, GenderType } from "@/types";
import Navbar from "@/components/Navbar";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Target,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Activity,
  Flame,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  // Editable Profile fields
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<GenderType>("female");
  const [weightStr, setWeightStr] = useState<string>("70");
  const [heightStr, setHeightStr] = useState<string>("170");
  const [ageStr, setAgeStr] = useState<string>("25");

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        const email = session.user.email || "";
        setUserEmail(email);

        let p: UserProfile | null = null;
        try {
          p = await api.getProfile();
        } catch (apiErr) {
          console.warn("api.getProfile failed, querying direct Supabase:", apiErr);
          const { data: directProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          if (directProfile) {
            p = directProfile as UserProfile;
          }
        }

        if (p) {
          setProfile(p);
          setFullName(p.full_name || "");
          setGender(p.gender || "female");
          if (p.current_weight_kg) setWeightStr(String(p.current_weight_kg));
          if (p.height_cm) setHeightStr(String(p.height_cm));
          if (p.age) setAgeStr(String(p.age));
        } else {
          // Initialize fallback name from email or session metadata
          const fallbackName =
            session.user.user_metadata?.full_name ||
            email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
            "FitMe User";
          setFullName(fallbackName);
        }
      } catch (err: any) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  // Numeric parsers & live BMI calculation
  const weightNum = parseFloat(weightStr) || profile?.current_weight_kg || 70;
  const heightNum = parseFloat(heightStr) || profile?.height_cm || 170;
  const ageNum = parseInt(ageStr, 10) || profile?.age || 25;
  const heightM = heightNum / 100;
  const bmiNum = heightM > 0 ? weightNum / (heightM * heightM) : 24.2;
  const bmiVal = bmiNum.toFixed(1);

  const getBmiCategory = (bmi: number) => {
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Healthy";
    if (bmi < 30) return "Overweight";
    return "Obese";
  };
  const bmiCategory = getBmiCategory(bmiNum);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const payload: Partial<UserProfile> = {
      full_name: fullName.trim() || "FitMe User",
      gender: gender,
      current_weight_kg: weightNum,
      height_cm: heightNum,
      age: ageNum,
    };

    try {
      let updated: UserProfile | null = null;
      try {
        updated = await api.updateProfile(payload);
      } catch (apiErr: any) {
        console.warn("api.updateProfile failed, falling back to direct Supabase upsert:", apiErr);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const directUpsert: Record<string, any> = {
            id: session.user.id,
            ...payload,
            updated_at: new Date().toISOString(),
          };
          const { data: upsertedData } = await supabase
            .from("profiles")
            .upsert(directUpsert)
            .select()
            .single();
          if (upsertedData) {
            updated = upsertedData as UserProfile;
          }
        }
        if (!updated) {
          throw apiErr;
        }
      }

      if (updated) {
        setProfile(updated);
        setFullName(updated.full_name || "");
        if (updated.current_weight_kg) setWeightStr(String(updated.current_weight_kg));
        if (updated.height_cm) setHeightStr(String(updated.height_cm));
        if (updated.age) setAgeStr(String(updated.age));
      }

      // Sync across localStorage and notify Dashboard / Navbar
      if (typeof window !== "undefined") {
        if (fullName.trim()) localStorage.setItem("fitme_user_name", fullName.trim());
        localStorage.setItem("fitme_current_weight_kg", String(weightNum));
        if (updated?.daily_calorie_target) {
          localStorage.setItem("fitme_daily_calorie_target", String(Math.round(updated.daily_calorie_target)));
        }
        if (updated?.bmr) localStorage.setItem("fitme_bmr", String(Math.round(updated.bmr)));
        if (updated?.tdee) localStorage.setItem("fitme_tdee", String(Math.round(updated.tdee)));
        window.dispatchEvent(new Event("fitme_goals_updated"));
      }

      setSuccessMsg("Profile information updated successfully.");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile.");
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
            Loading profile...
          </p>
        </div>
      </div>
    );
  }

  const initialLetter = fullName.trim()
    ? fullName.trim()[0].toUpperCase()
    : userEmail
    ? userEmail[0].toUpperCase()
    : "M";

  const displayName = fullName.trim() || "Add your name";
  const dailyGoal = profile?.daily_calorie_target ? Math.round(profile.daily_calorie_target) : "—";
  const bmr = profile?.bmr ? Math.round(profile.bmr) : "—";
  const tdee = profile?.tdee ? Math.round(profile.tdee) : "—";

  // Goal helpers
  const formatGoalType = (g?: string) => {
    if (!g) return "Lose weight";
    if (g === "gain_weight" || g === "gain_muscle" || g === "gain") return "Gain weight";
    if (g === "maintain_weight" || g === "maintain") return "Maintain weight";
    return "Lose weight";
  };

  const formatPace = (p?: string) => {
    if (p === "slow") return "Slow · 0.25 kg/wk";
    if (p === "faster") return "Faster · 0.75 kg/wk";
    return "Steady · 0.5 kg/wk";
  };

  const formatActivity = (act?: string) => {
    if (act === "sedentary") return "Sedentary";
    if (act === "light" || act === "lightly_active") return "Light · 1–3 days";
    if (act === "very_active" || act === "extra_active") return "Very active · 6–7 days";
    return "Moderate · 3–5 days";
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col md:flex-row gap-6 p-4 sm:p-5 lg:p-6 text-[#22332d] selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      {/* Sidebar Navigation */}
      <Navbar userFullName={profile?.full_name || fullName} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1100px] flex flex-col p-0 sm:py-2 mx-auto w-full">
        <h1 className="text-[34px] sm:text-[36px] font-bold text-[#22332d] tracking-tight">
          Your profile
        </h1>
        <p className="text-[14px] text-[#5b6b64] mt-2">
          Manage your details, physical metrics, and review your calculated baseline.
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
            <Link
              href="/home"
              className="font-semibold text-[#22332d] underline hover:text-[#7c9a7e] flex-shrink-0 ml-2"
            >
              Go to Dashboard &rarr;
            </Link>
          </div>
        )}

        {/* Top Dark Baseline Card (.dk) */}
        <section
          aria-label="Profile Baseline Summary"
          className="bg-[#22332d] text-white rounded-[28px] p-7 mt-7 shadow-soft flex flex-col"
        >
          {/* User Avatar & Name Header */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full bg-[#7c9a7e] text-white flex items-center justify-center text-[22px] font-bold select-none flex-shrink-0"
              aria-hidden="true"
            >
              {initialLetter}
            </div>
            <div>
              <h2 className="font-bold text-[20px] text-white leading-tight m-0">
                {displayName}
              </h2>
              <div className="text-[13px] text-[#b7cdb9] mt-0.5 font-normal">
                Personalised plan · Active
              </div>
            </div>
          </div>

          {/* 4-Grid Metric Baseline Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
              <small className="block text-[#b7cdb9] text-[12px] font-medium">
                Daily goal
              </small>
              <b className="text-[22px] font-bold text-white mt-0.5 block">
                {dailyGoal}
              </b>
              <small className="block text-[#b7cdb9] text-[12px]">kcal/day</small>
            </div>

            <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
              <small className="block text-[#b7cdb9] text-[12px] font-medium">
                BMR
              </small>
              <b className="text-[22px] font-bold text-white mt-0.5 block">
                {bmr}
              </b>
              <small className="block text-[#b7cdb9] text-[12px]">kcal</small>
            </div>

            <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
              <small className="block text-[#b7cdb9] text-[12px] font-medium">
                TDEE
              </small>
              <b className="text-[22px] font-bold text-white mt-0.5 block">
                {tdee}
              </b>
              <small className="block text-[#b7cdb9] text-[12px]">kcal</small>
            </div>

            <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
              <small className="block text-[#b7cdb9] text-[12px] font-medium">
                BMI
              </small>
              <b className="text-[22px] font-bold text-white mt-0.5 block">
                {bmiVal}
              </b>
              <small className="block text-[#b7cdb9] text-[12px]">
                {bmiCategory}
              </small>
            </div>
          </div>
        </section>

        {/* 2-Column Responsive Section: My Goals Overview (Left) + Account & Physical Details Form (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 mt-6 items-start">
          {/* MY GOALS CARD */}
          <section
            aria-label="My Fitness Goals"
            className="bg-white rounded-[28px] p-6 sm:p-7 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#dfe6e1]/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#f4f7f5] flex items-center justify-center text-[#22332d]">
                    <Target className="w-5 h-5 text-[#5f7d61]" />
                  </div>
                  <h2 className="text-[18px] font-bold text-[#22332d]">
                    My Goals
                  </h2>
                </div>
                <Link
                  href="/goals"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#5f7d61] hover:text-[#22332d] transition-colors"
                >
                  <span>Edit goals</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="flex flex-col gap-3.5 mt-5">
                {/* Primary Goal */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-[#f8faf9] border border-[#dfe6e1]/50">
                  <div className="flex items-center gap-2.5">
                    {formatGoalType(profile?.fitness_goal).includes("Lose") ? (
                      <TrendingDown className="w-4 h-4 text-[#5f7d61]" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-[#5f7d61]" />
                    )}
                    <span className="text-[13px] font-medium text-[#5b6b64]">
                      Primary goal
                    </span>
                  </div>
                  <span className="text-[14px] font-bold text-[#22332d] bg-white px-3 py-1 rounded-full border border-[#dfe6e1]/60">
                    {formatGoalType(profile?.fitness_goal)}
                  </span>
                </div>

                {/* Target Weight */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-[#f8faf9] border border-[#dfe6e1]/50">
                  <div className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-[#5f7d61]" />
                    <span className="text-[13px] font-medium text-[#5b6b64]">
                      Target weight
                    </span>
                  </div>
                  <span className="text-[14px] font-bold text-[#22332d]">
                    {profile?.target_weight_kg ? `${profile.target_weight_kg} kg` : "—"}
                  </span>
                </div>

                {/* Pace */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-[#f8faf9] border border-[#dfe6e1]/50">
                  <span className="text-[13px] font-medium text-[#5b6b64]">
                    Target pace
                  </span>
                  <span className="text-[14px] font-semibold text-[#22332d]">
                    {formatPace(profile?.pace)}
                  </span>
                </div>

                {/* Activity level */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-[#f8faf9] border border-[#dfe6e1]/50">
                  <span className="text-[13px] font-medium text-[#5b6b64]">
                    Activity level
                  </span>
                  <span className="text-[14px] font-semibold text-[#22332d]">
                    {formatActivity(profile?.activity_level)}
                  </span>
                </div>

                {/* Calorie Target */}
                <div className="flex items-center justify-between p-3.5 rounded-[16px] bg-[#22332d] text-white">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#b7cdb9]" />
                    <span className="text-[13px] font-medium text-[#b7cdb9]">
                      Daily calorie target
                    </span>
                  </div>
                  <span className="text-[15px] font-bold text-white">
                    {dailyGoal} kcal
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#dfe6e1]/40">
              <Link
                href="/goals"
                className="w-full h-11 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Customize goals &amp; pace</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#5b6b64]" />
              </Link>
            </div>
          </section>

          {/* PHYSICAL METRICS & ACCOUNT DETAILS FORM CARD */}
          <section
            aria-label="Account Details Edit Form"
            className="bg-white rounded-[28px] p-6 sm:p-7 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold text-[#22332d]">
                Account &amp; Physical Details
              </h2>
              <span className="text-[12px] font-semibold text-[#5f7d61] bg-[#f4f7f5] px-2.5 py-1 rounded-full border border-[#dfe6e1]">
                BMI: {bmiVal} ({bmiCategory})
              </span>
            </div>

            <form onSubmit={handleUpdate} className="flex flex-col gap-4">
              {/* Full name */}
              <div>
                <label
                  htmlFor="profile-fullname"
                  className="block text-[13px] font-semibold text-[#3a4a43]"
                >
                  Full name
                </label>
                <input
                  id="profile-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                />
              </div>

              {/* Physical Metrics Row: Current weight & Height */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-weight"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Current weight (kg)
                  </label>
                  <input
                    id="profile-weight"
                    type="number"
                    step="0.5"
                    min="20"
                    max="300"
                    value={weightStr}
                    onChange={(e) => setWeightStr(e.target.value)}
                    placeholder="70"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-height"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Height (cm)
                  </label>
                  <input
                    id="profile-height"
                    type="number"
                    step="1"
                    min="50"
                    max="260"
                    value={heightStr}
                    onChange={(e) => setHeightStr(e.target.value)}
                    placeholder="170"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>
              </div>

              {/* Age & Gender Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-age"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Age (years)
                  </label>
                  <input
                    id="profile-age"
                    type="number"
                    min="10"
                    max="120"
                    value={ageStr}
                    onChange={(e) => setAgeStr(e.target.value)}
                    placeholder="25"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-gender"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Gender
                  </label>
                  <select
                    id="profile-gender"
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
              </div>

              {/* Email (Read-only) */}
              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-[13px] font-semibold text-[#3a4a43]"
                >
                  Email
                </label>
                <div
                  id="profile-email"
                  aria-readonly="true"
                  className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-[#f4f7f5] text-[15px] font-medium text-[#5b6b64] flex items-center gap-2.5 select-none"
                >
                  <Lock className="w-4 h-4 text-[#5b6b64] flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{userEmail || "you@example.com"}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-4 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Saving profile...</span>
                  </>
                ) : (
                  <span>Save profile</span>
                )}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
