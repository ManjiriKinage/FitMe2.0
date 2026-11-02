"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, GenderType } from "@/types";
import Navbar from "@/components/Navbar";
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  // Editable Profile fields
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<GenderType>("female");
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

        setUserEmail(session.user.email || "");
        const profileData = await api.getProfile();
        setProfile(profileData);
        setFullName(profileData.full_name || "");
        setGender(profileData.gender || "female");
      } catch (err: any) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const updated = await api.updateProfile({
        full_name: fullName.trim(),
        gender: gender,
      });
      setProfile(updated);
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

  // Calculate BMI and Category
  const heightM = (profile?.height_cm || 170) / 100;
  const bmiNum =
    profile?.current_weight_kg && heightM > 0
      ? profile.current_weight_kg / (heightM * heightM)
      : 24.2;
  const bmiVal = bmiNum.toFixed(1);

  const getBmiCategory = (bmi: number) => {
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Healthy";
    if (bmi < 30) return "Overweight";
    return "Obese";
  };
  const bmiCategory = getBmiCategory(bmiNum);

  const initialLetter = fullName.trim()
    ? fullName.trim()[0].toUpperCase()
    : userEmail
    ? userEmail[0].toUpperCase()
    : "M";

  const displayName = fullName.trim() || "Add your name";
  const dailyGoal = profile?.daily_calorie_target ? Math.round(profile.daily_calorie_target) : "—";
  const bmr = profile?.bmr ? Math.round(profile.bmr) : "—";
  const tdee = profile?.tdee ? Math.round(profile.tdee) : "—";

  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col md:flex-row gap-6 p-4 sm:p-5 lg:p-6 text-[#22332d] selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      {/* Sidebar Navigation */}
      <Navbar userFullName={profile?.full_name} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1100px] flex flex-col p-0 sm:py-2 mx-auto w-full">
        <h1 className="text-[34px] sm:text-[36px] font-bold text-[#22332d] tracking-tight">
          Your profile
        </h1>
        <p className="text-[14px] text-[#5b6b64] mt-2">
          Manage your details and see your calculated baseline.
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
            className="mt-4 p-3.5 rounded-[14px] bg-[#eaf4fd] border border-[#cfe5f7] text-[#22332d] text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-[#7c9a7e] flex-shrink-0" />
            <span>{successMsg}</span>
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

        {/* Bottom Form Card (.c) */}
        <section
          aria-label="Account Details Edit Form"
          className="bg-white rounded-[28px] p-6 sm:p-8 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 mt-6 flex flex-col"
        >
          <h2 className="text-[20px] font-bold text-[#22332d] mb-5">
            Account details
          </h2>

          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <p className="text-[14px] text-[#5b6b64] mt-1">
              To change weight, activity or goal, go to{" "}
              <Link
                href="/goals"
                className="font-bold text-[#5f7d61] hover:text-[#22332d] transition-colors focus:outline-none focus:underline"
              >
                Set up goals &rarr;
              </Link>
            </p>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 mt-6 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
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
      </main>
    </div>
  );
}
