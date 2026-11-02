"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { MealType, FoodLogItem } from "@/types";
import { Sparkles, RotateCw, Loader2, Check, AlertCircle } from "lucide-react";

interface AISuggestionCardProps {
  onLogMealSuccess?: (newItem: FoodLogItem) => void;
}

export default function AISuggestionCard({ onLogMealSuccess }: AISuggestionCardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loggedSuccess, setLoggedSuccess] = useState(false);

  const fetchSuggestion = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);

      const res = await api.getAISuggestion(isRefresh);
      setData(res);
    } catch (err: any) {
      console.warn("Could not load AI suggestion:", err);
      setErrorMsg(err.message || "Unable to load suggestion right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSuggestion();
  }, []);

  const handleLogSuggestion = async () => {
    if (!data?.suggestion) return;
    setLogging(true);
    setErrorMsg(null);

    const s = data.suggestion;
    const mealSlot: MealType = (data.meal_slot || "dinner") as MealType;

    try {
      const res = await api.createFoodLog({
        meal_type: mealSlot,
        food_name: s.name,
        quantity: 1,
        unit: s.portion || "serving",
        estimated_calories: Number(s.calories) || 0,
        protein_g: Number(s.protein_g) || 0,
        carbohydrates_g: Number(s.carbs_g) || 0,
        fat_g: Number(s.fat_g) || 0,
        logged_at: new Date().toISOString(),
      });

      setLoggedSuccess(true);
      if (onLogMealSuccess && res.food_log) {
        onLogMealSuccess(res.food_log);
      }
      setTimeout(() => setLoggedSuccess(false), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log suggested meal.");
    } finally {
      setLogging(false);
    }
  };

  // 1. Loading Skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="w-24 h-6 rounded-full bg-[#eaf1ec]" />
          <div className="w-5 h-5 rounded-full bg-[#f4f7f5]" />
        </div>
        <div className="w-full h-12 rounded-xl bg-[#f4f7f5]" />
        <div className="w-28 h-8 rounded-full bg-[#eaf1ec]" />
      </div>
    );
  }

  // 2. Error State with Retry
  if (errorMsg && !data) {
    return (
      <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-red-100 flex flex-col gap-3">
        <div className="flex items-center justify-between text-red-700 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            AI Suggestion
          </span>
          <button
            onClick={() => fetchSuggestion(true)}
            className="text-[#22332d] hover:text-[#7c9a7e] underline cursor-pointer"
          >
            Retry
          </button>
        </div>
        <p className="text-[13px] text-[#5b6b64]">{errorMsg}</p>
      </div>
    );
  }

  // 3. Status checks
  // If user is over goal -> show no suggestion
  if (data?.status === "over") {
    return null;
  }

  // If user is within 150 kcal -> "You're close to your goal for today."
  if (data?.status === "close") {
    return (
      <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40">
        <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-[12px] font-semibold text-[#22332d]">
          AI suggestion
        </span>
        <p className="mt-3 text-[14px] text-[#5b6b64] font-medium leading-relaxed">
          You&apos;re close to your goal for today. Great job keeping your intake balanced!
        </p>
      </div>
    );
  }

  const s = data?.suggestion;
  if (!s) return null;

  return (
    <article
      aria-label="AI Meal Suggestion"
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col justify-between relative"
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf1ec] px-3.5 py-1 text-[12px] font-semibold text-[#22332d]">
            <Sparkles className="w-3.5 h-3.5 text-[#5f7d61]" />
            AI suggestion
          </span>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => fetchSuggestion(true)}
            title="Refresh suggestion"
            aria-label="Refresh AI meal suggestion"
            className="w-7 h-7 rounded-full text-[#5b6b64] hover:text-[#22332d] hover:bg-[#f4f7f5] flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e] disabled:opacity-40"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <p className="my-3 text-[15px] text-[#22332d] leading-[1.5]">
          You have <b>{data.remaining_calories} kcal</b> and{" "}
          <b>{Math.max(0, data.remaining_protein)}g protein</b> left. Try{" "}
          <span className="font-semibold text-[#22332d]">{s.name.toLowerCase()}</span>{" "}
          for {data.meal_slot || "dinner"}.
        </p>

        <div className="text-[12px] text-[#5b6b64] mb-3 flex items-center gap-2">
          <span>{s.portion}</span>
          <span>·</span>
          <span>{s.calories} kcal</span>
          <span>·</span>
          <span>P {s.protein_g}g</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f4f7f5]">
        <button
          type="button"
          disabled={logging || loggedSuccess}
          onClick={handleLogSuggestion}
          className="h-[34px] px-4 rounded-full bg-[#22332d] hover:bg-[#182420] text-white text-[13px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
        >
          {logging ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Logging...</span>
            </>
          ) : loggedSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#7c9a7e]" />
              <span>Logged to {data.meal_slot}!</span>
            </>
          ) : (
            <span>Log suggestion</span>
          )}
        </button>

        <span className="text-[11px] text-[#5b6b64]/80 italic">
          Estimates only, not medical advice.
        </span>
      </div>
    </article>
  );
}
