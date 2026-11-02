"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, DashboardSummary, MealType, FoodLogItem } from "@/types";
import Navbar from "@/components/Navbar";
import CaloriesAndMacrosCard from "@/components/dashboard/CaloriesAndMacrosCard";
import MetabolicOverviewCard from "@/components/dashboard/MetabolicOverviewCard";
import HydrationCard from "@/components/dashboard/HydrationCard";
import FoodLogList from "@/components/FoodLogList";
import FoodLogForm from "@/components/FoodLogForm";
import MealScannerModal from "@/components/MealScannerModal";
import {
  Search,
  Bell,
  Camera,
  Plus,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function DashboardHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  // Search filter query
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [selectedMealForAdd, setSelectedMealForAdd] = useState<MealType>("breakfast");

  const [isScanMealOpen, setIsScanMealOpen] = useState(false);
  const [selectedMealForScan, setSelectedMealForScan] = useState<MealType>("lunch");

  // Date selection (defaults to today in local timezone YYYY-MM-DD)
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const todayStr = getTodayStr();

  // Future dates strictly disallowed (only today and past allowed)
  const isTodayOrFuture = selectedDate >= todayStr;

  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    const targetDate = `${year}-${month}-${day}`;

    // Disallow future dates
    if (targetDate > todayStr) {
      return;
    }
    setSelectedDate(targetDate);
  };

  // Keep profile in ref to reuse across food logging and avoid unnecessary network round trips
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  // Background dashboard refresh that never flashes the full-screen loader
  const refreshDashboard = useCallback(async () => {
    try {
      const dashboardData = await api.getDashboard(selectedDate);
      if (dashboardData) {
        setDashboard(dashboardData);
      }
    } catch (err: any) {
      console.warn("Could not refresh dashboard in background:", err);
    }
  }, [selectedDate]);

  const loadData = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      }
      setError(null);

      // Verify session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      // Always fetch fresh profile so target updates from Goals are immediately visible
      const profilePromise = api.getProfile().catch(async (err) => {
        console.warn("Could not load profile via API, trying direct Supabase:", err);
        const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        return data as UserProfile | null;
      });

      const dashboardPromise = api.getDashboard(selectedDate).catch((err) => {
        console.warn("Could not load dashboard:", err);
        return null;
      });

      const [profileData, dashboardData] = await Promise.all([
        profilePromise,
        dashboardPromise,
      ]);

      if (profileData) setProfile(profileData);
      if (dashboardData) setDashboard(dashboardData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [router, selectedDate]);

  useEffect(() => {
    loadData(!dashboard);

    const handleGoalsUpdated = () => {
      loadData(false);
    };
    window.addEventListener("fitme_goals_updated", handleGoalsUpdated);
    return () => window.removeEventListener("fitme_goals_updated", handleGoalsUpdated);
  }, [loadData, dashboard]);

  const handleOpenAddFood = (mealType: MealType = "breakfast") => {
    setSelectedMealForAdd(mealType);
    setIsAddFoodOpen(true);
  };

  const handleOpenScanMeal = (mealType: MealType = "lunch") => {
    setSelectedMealForScan(mealType);
    setIsScanMealOpen(true);
  };

  const handleFoodSaved = (_newItem?: FoodLogItem, dailySummary?: DashboardSummary | null) => {
    if (dailySummary) {
      // Direct in-memory state update using verified server aggregation
      setDashboard(dailySummary);
      return;
    }
    // Fallback: refresh in background without full-screen loading spinner
    refreshDashboard();
  };

  const handleDeleteFood = async (id: string) => {
    try {
      await api.deleteFoodLog(id);
      await refreshDashboard();
    } catch (err: any) {
      alert("Failed to delete food entry: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-[#7c9a7e]" />
          <p className="text-sm font-semibold text-[#22332d]/70">
            Loading your FitMe dashboard...
          </p>
        </div>
      </div>
    );
  }

  // User's saved profile target ALWAYS takes precedence over old/stale dashboard fallback
  const localTarget =
    typeof window !== "undefined"
      ? Number(localStorage.getItem("fitme_daily_calorie_target"))
      : 0;
  const calorieTarget =
    profile?.daily_calorie_target ||
    (localTarget > 0 ? localTarget : 0) ||
    dashboard?.daily_calorie_target ||
    0;

  const consumed = dashboard?.calories_consumed || 0;
  const remaining =
    calorieTarget > 0
      ? Math.max(0, calorieTarget - consumed)
      : dashboard?.calories_remaining !== undefined
      ? dashboard.calories_remaining
      : calorieTarget;
  const percentage =
    calorieTarget > 0
      ? Math.min(100, Math.round((consumed / calorieTarget) * 100))
      : dashboard?.percentage_consumed || 0;

  // Dynamically compute evidence-based macro targets to keep in sync with active calorie target
  const isLosing =
    (profile?.fitness_goal as string) === "lose" ||
    profile?.fitness_goal === "lose_weight";
  const userWeight = profile?.current_weight_kg || 70;
  const proteinTarget = Math.round(userWeight * (isLosing ? 1.6 : 1.2));
  const fatTarget = Math.round((calorieTarget * 0.25) / 9);
  const carbsTarget = Math.max(
    0,
    Math.round((calorieTarget * 0.75 - proteinTarget * 4) / 4)
  );

  const effectiveMacroTargets = calorieTarget > 0
    ? {
        carbohydrates_g: carbsTarget,
        protein_g: proteinTarget,
        fat_g: fatTarget,
      }
    : dashboard?.macro_targets;

  const effectiveProfile = profile || (localTarget > 0 && typeof window !== "undefined" ? {
    daily_calorie_target: localTarget,
    fitness_goal: localStorage.getItem("fitme_fitness_goal") || undefined,
    current_weight_kg: Number(localStorage.getItem("fitme_current_weight_kg")) || undefined,
    bmr: Number(localStorage.getItem("fitme_bmr")) || undefined,
    tdee: Number(localStorage.getItem("fitme_tdee")) || undefined,
  } as any : null);

  const macroTotals = dashboard?.macro_totals || {
    calories: 0,
    protein_g: 0,
    carbohydrates_g: 0,
    fat_g: 0,
  };
  const rawMeals = dashboard?.meals || {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  // Filter meals if search query is provided
  const filteredMeals = searchQuery.trim()
    ? Object.keys(rawMeals).reduce((acc, mealKey) => {
        const key = mealKey as MealType;
        acc[key] = (rawMeals[key] || []).filter((item) =>
          item.food_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return acc;
      }, { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<MealType, FoodLogItem[]>)
    : rawMeals;

  const dateLabel =
    selectedDate === getTodayStr()
      ? `Today (${selectedDate})`
      : selectedDate;

  return (
    <div className="min-h-screen bg-[#faf9f6] flex flex-col md:flex-row gap-6 p-4 sm:p-5 lg:p-6 text-[#22332d] selection:bg-[#7c9a7e]/20 selection:text-[#22332d]">
      {/* Sidebar Navigation */}
      <Navbar userFullName={profile?.full_name} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 max-w-[1100px] flex flex-col gap-6 mx-auto w-full">
        {/* Top Header Row (Search, Date Picker, Notifications, Action Buttons) */}
        <header className="flex items-center gap-3 flex-wrap">
          {/* Search bar */}
          <label className="flex-1 min-w-[260px] flex items-center gap-2.5 h-12 px-4 bg-white rounded-full border border-[#e6ebe7] focus-within:border-[#7c9a7e] transition-colors cursor-text">
            <Search className="w-[18px] h-[18px] text-[#5b6b64] flex-shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search food logs or recipes..."
              aria-label="Search food logs or recipes"
              className="w-full border-0 outline-none bg-transparent text-[14px] text-[#22332d] placeholder:text-[#5b6b64]"
            />
          </label>

          {/* Interactive Date Picker */}
          <div className="flex items-center gap-2 h-12 px-2 bg-white rounded-full border border-[#e6ebe7]">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="w-8 h-8 rounded-full border-0 hover:bg-[#f6f9f7] text-[#22332d] font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
            >
              &lsaquo;
            </button>
            <span className="text-[14px] font-semibold text-[#22332d] px-1 select-none">
              {dateLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={isTodayOrFuture}
              aria-label="Next day"
              title={isTodayOrFuture ? "Future dates are not allowed" : "Next day"}
              className={`w-8 h-8 rounded-full border-0 font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e] ${
                isTodayOrFuture
                  ? "opacity-25 cursor-not-allowed text-[#5b6b64]/50 pointer-events-none"
                  : "hover:bg-[#f6f9f7] text-[#22332d] cursor-pointer"
              }`}
            >
              &rsaquo;
            </button>
          </div>

          {/* Notifications button */}
          <button
            type="button"
            aria-label="Notifications"
            className="w-10 h-10 rounded-full border border-[#e6ebe7] bg-white hover:bg-[#f6f9f7] text-[#22332d] flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>

          {/* Scan Meal Pill Button */}
          <button
            type="button"
            onClick={() => handleOpenScanMeal("lunch")}
            className="inline-flex items-center gap-2 h-[44px] px-[18px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22332d]/40 focus:ring-offset-2"
          >
            <Camera className="w-[18px] h-[18px]" aria-hidden="true" />
            <span>Scan Meal</span>
          </button>

          {/* Add Food Pill Button */}
          <button
            type="button"
            onClick={() => handleOpenAddFood("breakfast")}
            className="inline-flex items-center gap-2 h-[44px] px-[18px] rounded-full bg-[#7c9a7e] hover:bg-[#6e8a70] text-white font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/40 focus:ring-offset-2"
          >
            <Plus className="w-[18px] h-[18px]" aria-hidden="true" />
            <span>Add Food</span>
          </button>
        </header>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Grid Row: Calories & Macros (1.6fr) + Bio-Metrics (1fr) */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
          <CaloriesAndMacrosCard
            calorieTarget={calorieTarget}
            consumed={consumed}
            remaining={remaining}
            percentage={percentage}
            macroTotals={macroTotals}
            macroTargets={effectiveMacroTargets}
          />

          <MetabolicOverviewCard profile={effectiveProfile} />
        </section>

        {/* Bottom Grid Row: Daily Calories Meals Breakdown (1.6fr) + Hydration (1fr) */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
          <FoodLogList
            meals={filteredMeals}
            remainingCalories={remaining}
            onOpenAddFood={handleOpenAddFood}
            onOpenScanMeal={handleOpenScanMeal}
            onDeleteFood={handleDeleteFood}
          />

          <HydrationCard selectedDate={selectedDate} />
        </section>
      </main>

      {/* Add Food Modal with typed AI estimation */}
      {isAddFoodOpen && (
        <FoodLogForm
          initialMealType={selectedMealForAdd}
          selectedDate={selectedDate}
          onClose={() => setIsAddFoodOpen(false)}
          onSuccess={handleFoodSaved}
          onSwitchToScan={() => {
            setIsAddFoodOpen(false);
            handleOpenScanMeal(selectedMealForAdd);
          }}
        />
      )}

      {/* AI Plate Scanner Modal with Camera & Gallery */}
      {isScanMealOpen && (
        <MealScannerModal
          initialMealType={selectedMealForScan}
          selectedDate={selectedDate}
          onClose={() => setIsScanMealOpen(false)}
          onSuccess={handleFoodSaved}
        />
      )}
    </div>
  );
}
