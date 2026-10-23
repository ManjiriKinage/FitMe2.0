"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, GenderType } from "@/types";
import Navbar from "@/components/Navbar";
import {
  User,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Flame,
  Scale,
  Ruler,
  Calendar,
  Save
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        setUserEmail(session.user.email || "");
        const profileData = await api.getProfile();
        setProfile(profileData);
        setFullName(profileData.full_name);
        setGender(profileData.gender);
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
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-sage" />
          <p className="text-sm font-semibold text-charcoal/70">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Calculate BMI
  const heightM = (profile?.height_cm || 170) / 100;
  const bmiVal = ((profile?.current_weight_kg || 70) / (heightM * heightM)).toFixed(1);

  return (
    <div className="min-h-screen bg-cream flex flex-col md:flex-row text-charcoal selection:bg-sage/20 selection:text-charcoal">
      <Navbar userFullName={profile?.full_name} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full pb-24 md:pb-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mint text-charcoal text-xs font-bold mb-2">
            <User className="w-4 h-4 text-sage" />
            <span>Personal Account & Biological Data</span>
          </div>
          <h1 className="text-3xl font-extrabold text-charcoal tracking-tight">Your Profile</h1>
          <p className="text-sm text-charcoal/60 mt-1">
            Manage your personal credentials, identity details, and view your calculated metabolic baseline.
          </p>
        </div>

        {successMsg && (
          <div className="mb-6 p-4 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-3xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Metabolic Summary Banner */}
        <div className="bg-charcoal text-cream rounded-4xl p-6 sm:p-8 shadow-soft-lg mb-8 border border-charcoal-light">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-cream/10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-3xl bg-sage flex items-center justify-center text-charcoal font-black text-2xl shadow-glow">
                {profile?.full_name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <h3 className="font-extrabold text-xl text-cream">{profile?.full_name}</h3>
                <span className="text-xs text-cream/60 flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-sage" />
                  {userEmail}
                </span>
              </div>
            </div>

            <div className="px-4 py-2 rounded-2xl bg-cream/10 border border-cream/10 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sage" />
              <span className="text-xs font-semibold text-cream">RLS Protected</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-center">
            <div className="p-3 bg-cream/5 rounded-2xl border border-cream/5">
              <span className="text-[10px] text-cream/50 uppercase block font-semibold">Daily Calorie Goal</span>
              <span className="font-extrabold text-lg text-sage">{profile?.daily_calorie_target}</span>
              <span className="text-[10px] text-cream/40 block">kcal/day</span>
            </div>

            <div className="p-3 bg-cream/5 rounded-2xl border border-cream/5">
              <span className="text-[10px] text-cream/50 uppercase block font-semibold">Calculated BMR</span>
              <span className="font-extrabold text-lg text-cream">{profile?.bmr}</span>
              <span className="text-[10px] text-cream/40 block">kcal</span>
            </div>

            <div className="p-3 bg-cream/5 rounded-2xl border border-cream/5">
              <span className="text-[10px] text-cream/50 uppercase block font-semibold">Estimated TDEE</span>
              <span className="font-extrabold text-lg text-cream">{profile?.tdee}</span>
              <span className="text-[10px] text-cream/40 block">kcal</span>
            </div>

            <div className="p-3 bg-cream/5 rounded-2xl border border-cream/5">
              <span className="text-[10px] text-cream/50 uppercase block font-semibold">BMI Screening</span>
              <span className="font-extrabold text-lg text-cream">{bmiVal}</span>
              <span className="text-[10px] text-cream/40 block">kg/m²</span>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white rounded-4xl p-6 sm:p-8 border border-mint shadow-soft">
          <form onSubmit={handleUpdate} className="space-y-6">
            <h3 className="font-extrabold text-lg text-charcoal">Account Details</h3>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                  Email (Authentication ID)
                </label>
                <input
                  type="email"
                  disabled
                  value={userEmail}
                  className="w-full px-4 py-3 bg-cream/40 rounded-2xl border border-charcoal/10 text-charcoal/60 text-sm font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/70 mb-2">
                  Gender Identifier
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderType)}
                  className="w-full px-4 py-3 bg-cream/60 rounded-2xl border border-charcoal/10 focus:border-sage outline-none text-charcoal text-sm font-semibold"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-cream/60 border border-charcoal/5 text-xs text-charcoal/70 flex items-start gap-2">
              <Scale className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
              <span>
                To adjust your weight, target weight, activity level, or fitness goal, visit{" "}
                <button
                  type="button"
                  onClick={() => router.push("/goals")}
                  className="font-bold text-sage underline decoration-sage/40 hover:text-sage-700"
                >
                  Set Up Goals
                </button>{" "}
                which recalculates your Mifflin-St Jeor daily calories safely.
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 px-6 bg-charcoal text-cream font-bold rounded-2xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 text-sm disabled:opacity-75"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-sage" />
                  <span>Saving Updates...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-sage" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
