"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { UserProfile, DashboardSummary, MealType, FoodLogItem } from "@/types";
import Navbar from "@/components/Navbar";
import CalorieCard from "@/components/CalorieCard";
import CalorieProgress from "@/components/CalorieProgress";
import NutritionSummary from "@/components/NutritionSummary";
import FoodLogList from "@/components/FoodLogList";
import FoodLogForm from "@/components/FoodLogForm";
import {
  Search,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Droplets,
  AlertCircle
} from "lucide-react";

export default function DashboardHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  // Modal State
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [selectedMealForAdd, setSelectedMealForAdd] = useState<MealType>("breakfast");

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Verify session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      // Fetch profile and dashboard concurrently
      const [profileData, dashboardData] = await Promise.all([
        api.getProfile().catch((err) => {
          console.warn("Could not load profile:", err);
          return null;
        }),
        api.getDashboard(selectedDate).catch((err) => {
          console.warn("Could not load dashboard:", err);
          return null;
        }),
      ]);

      setProfile(profileData);
      setDashboard(dashboardData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [router, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAddFood = (mealType: MealType = "breakfast") => {
    setSelectedMealForAdd(mealType);
    setIsAddFoodOpen(true);
  };

  const handleFoodSaved = async (newItem: FoodLogItem) => {
    // Reload dashboard to keep all calculations exact
    await loadData();
  };

  const handleDeleteFood = async (id: string) => {
    try {
      await api.deleteFoodLog(id);
      await loadData();
    } catch (err: any) {
      alert("Failed to delete food entry: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-sage" />
          <p className="text-sm font-semibold text-charcoal/70">Loading your FitMe dashboard...</p>
        </div>
      </div>
    );
  }

  // Fallbacks if data empty
  const calorieTarget = dashboard?.daily_calorie_target || profile?.daily_calorie_target || 2000;
  const consumed = dashboard?.calories_consumed || 0;
  const remaining = dashboard?.calories_remaining !== undefined ? dashboard.calories_remaining : calorieTarget;
  const percentage = dashboard?.percentage_consumed || 0;
  const macroTotals = dashboard?.macro_totals || { calories: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0 };
  const meals = dashboard?.meals || { breakfast: [], lunch: [], dinner: [], snack: [] };

  return (
    <div className="min-h-screen bg-cream flex flex-col md:flex-row text-charcoal selection:bg-sage/20 selection:text-charcoal">
      {/* Sidebar Navigation */}
      <Navbar
        onOpenAddFood={() => handleOpenAddFood("breakfast")}
        userFullName={profile?.full_name}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto w-full pb-20 md:pb-6">
        {/* Top Header Row (Search, Date, Notifications, Add Food) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-charcoal/40" />
              <input
                type="text"
                placeholder="Search food logs or recipes..."
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-white border border-charcoal/10 focus:border-sage outline-none text-xs text-charcoal shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Interactive Date Navigator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-2xl bg-white border border-charcoal/10 text-xs font-semibold text-charcoal shadow-sm">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                title="Previous Day"
                className="w-6 h-6 rounded-lg hover:bg-cream flex items-center justify-center text-charcoal/70 hover:text-charcoal transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <label className="flex items-center gap-1.5 cursor-pointer px-1">
                <Calendar className="w-3.5 h-3.5 text-sage" />
                <span>{selectedDate === getTodayStr() ? `Today (${selectedDate})` : selectedDate}</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="sr-only"
                />
              </label>

              <button
                type="button"
                onClick={() => shiftDate(1)}
                title="Next Day"
                className="w-6 h-6 rounded-lg hover:bg-cream flex items-center justify-center text-charcoal/70 hover:text-charcoal transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {selectedDate !== getTodayStr() && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(getTodayStr())}
                  className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sage text-white hover:bg-sage-600 transition"
                >
                  Today
                </button>
              )}
            </div>

            {/* Notification Bell */}
            <button className="w-9 h-9 rounded-2xl bg-white border border-charcoal/10 flex items-center justify-center text-charcoal shadow-sm hover:bg-cream transition">
              <Bell className="w-4 h-4 text-charcoal" />
            </button>

            {/* Prominent Add Food Action Button */}
            <button
              onClick={() => handleOpenAddFood("breakfast")}
              className="px-3.5 py-2 rounded-2xl bg-sage text-white font-bold text-xs shadow-soft hover:bg-sage-600 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Grid Layout */}
        <div className="space-y-4">
          {/* Top Banner & Overview Card */}
          <CalorieCard
            profile={profile}
            onOpenAddFood={() => handleOpenAddFood("breakfast")}
          />

          {/* Middle Main Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column (8 cols): Nutrition Recap & Meals Breakdown */}
            <div className="lg:col-span-8 space-y-4">
              {/* Daily Recap (Carbs, Protein, Fats) */}
              <NutritionSummary
                macroTotals={macroTotals}
                macroTargets={dashboard?.macro_targets}
              />

              {/* Meals List (Breakfast, Lunch, Dinner, Snack) */}
              <FoodLogList
                meals={meals}
                remainingCalories={remaining}
                onOpenAddFood={handleOpenAddFood}
                onDeleteFood={handleDeleteFood}
              />
            </div>

            {/* Right Column (4 cols): Calorie Budget Circular Ring & Water/Habits */}
            <div className="lg:col-span-4 space-y-4">
              {/* Circular Gauge "Calories Budget" */}
              <CalorieProgress
                target={calorieTarget}
                consumed={consumed}
                remaining={remaining}
                percentage={percentage}
              />

              {/* Hydration Card (as in UI mockup) */}
              <div className="bg-charcoal text-cream rounded-3xl p-4 shadow-soft flex items-center justify-between relative overflow-hidden border border-charcoal-light">
                <div>
                  <span className="text-[10px] text-sage font-semibold uppercase tracking-wider block mb-0.5">
                    Daily Wellness
                  </span>
                  <h4 className="text-base font-extrabold text-cream leading-tight">
                    Drink 8–10 <br />Cups Water
                  </h4>
                  <span className="text-[10px] text-cream/50 mt-1 block">
                    Hydration aids digestion & energy
                  </span>
                </div>

                <div className="w-11 h-11 rounded-full bg-cream/10 border-2 border-sage flex items-center justify-center text-sage">
                  <Droplets className="w-5 h-5 text-sage" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add Food Modal with AI estimation */}
      {isAddFoodOpen && (
        <FoodLogForm
          initialMealType={selectedMealForAdd}
          onClose={() => setIsAddFoodOpen(false)}
          onSuccess={handleFoodSaved}
        />
      )}
    </div>
  );
}
