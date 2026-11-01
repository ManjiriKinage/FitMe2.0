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

  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    setSelectedDate(`${year}-${month}-${day}`);
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

      // Reuse already-loaded profile to avoid unnecessary requests; fetch only if not yet loaded
      const profilePromise = profileRef.current
        ? Promise.resolve(profileRef.current)
        : api.getProfile().catch((err) => {
            console.warn("Could not load profile:", err);
            return null;
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
  }, [loadData]);

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

  // Values calculation
  const calorieTarget =
    dashboard?.daily_calorie_target || profile?.daily_calorie_target || 2000;
  const consumed = dashboard?.calories_consumed || 0;
  const remaining =
    dashboard?.calories_remaining !== undefined
      ? dashboard.calories_remaining
      : calorieTarget;
  const percentage = dashboard?.percentage_consumed || 0;
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
              aria-label="Next day"
              className="w-8 h-8 rounded-full border-0 hover:bg-[#f6f9f7] text-[#22332d] font-bold text-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
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
            macroTargets={dashboard?.macro_targets}
          />

          <MetabolicOverviewCard profile={profile} />
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
          onClose={() => setIsScanMealOpen(false)}
          onSuccess={handleFoodSaved}
        />
      )}
    </div>
  );
}
