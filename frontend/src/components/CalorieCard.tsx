"use client";

import { Sparkles, ArrowRight, Flame, Trophy, TrendingUp } from "lucide-react";
import { UserProfile } from "@/types";

interface CalorieCardProps {
  profile: UserProfile | null;
  onOpenAddFood: () => void;
}

export default function CalorieCard({ profile, onOpenAddFood }: CalorieCardProps) {
  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "Friend";

  const goalDescriptions: Record<string, string> = {
    lose_weight: "Targeting healthy, sustainable fat loss with mindful calorie deficit.",
    maintain_weight: "Targeting steady weight maintenance and consistent vitality.",
    gain_muscle: "High-protein resistance fueling for lean muscle development.",
    gain_weight: "Steady, nutritious energy surplus for healthy weight gain.",
  };

  const currentGoalDesc = profile?.fitness_goal
    ? goalDescriptions[profile.fitness_goal] || "Living healthy from now on."
    : "Let's start living healthy from now on.";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* Mint Hero Card (7 cols) */}
      <div className="lg:col-span-7 bg-gradient-to-br from-mint via-mint-light to-cream rounded-3xl p-4 sm:p-5 border border-mint-dark/30 shadow-soft flex flex-col justify-between relative overflow-hidden">
        {/* Decorative background shape */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-sage/10 blur-2xl pointer-events-none" />

        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/80 border border-sage/20 text-[11px] font-semibold text-charcoal mb-2">
            <Sparkles className="w-3 h-3 text-sage" />
            <span>Mifflin-St Jeor Engine</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-charcoal tracking-tight">
            Hello {firstName}, 🌱
          </h2>
          <p className="text-xs text-charcoal/70 mt-0.5 max-w-md">
            {currentGoalDesc}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-charcoal/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-sage shadow-sm">
              <Flame className="w-4 h-4 text-sage fill-current" />
            </div>
            <div>
              <span className="text-[11px] text-charcoal/60 block font-medium">Daily Calorie Target</span>
              <span className="text-base font-black text-charcoal">
                {profile?.daily_calorie_target || 2000} <span className="text-[10px] font-normal">kcal/day</span>
              </span>
            </div>
          </div>

          <button
            onClick={onOpenAddFood}
            className="px-4 py-2 rounded-xl bg-charcoal text-cream hover:bg-charcoal-light font-bold text-xs shadow-soft transition flex items-center gap-1.5"
          >
            <span>Log a Meal</span>
            <ArrowRight className="w-3.5 h-3.5 text-sage" />
          </button>
        </div>
      </div>

      {/* Charcoal Stats Card (5 cols) */}
      <div className="lg:col-span-5 bg-charcoal text-cream rounded-3xl p-4 sm:p-5 shadow-soft flex flex-col justify-between border border-charcoal-light">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-cream/60 uppercase tracking-wider block">
              Bio-Metrics
            </span>
            <h4 className="text-base font-extrabold text-cream">Metabolic Overview</h4>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-cream/10 text-[10px] font-semibold text-sage border border-sage/30">
            Active
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 my-2.5">
          <div className="bg-cream/5 rounded-xl p-2.5 border border-cream/5 text-center">
            <span className="text-[9px] text-cream/50 uppercase block font-semibold">BMR</span>
            <span className="font-bold text-xs text-cream">{profile?.bmr || 1550}</span>
            <span className="text-[9px] text-cream/40 block">kcal</span>
          </div>

          <div className="bg-cream/5 rounded-xl p-2.5 border border-cream/5 text-center">
            <span className="text-[9px] text-cream/50 uppercase block font-semibold">TDEE</span>
            <span className="font-bold text-xs text-cream">{profile?.tdee || 2100}</span>
            <span className="text-[9px] text-cream/40 block">kcal</span>
          </div>

          <div className="bg-cream/5 rounded-xl p-2.5 border border-cream/5 text-center">
            <span className="text-[9px] text-cream/50 uppercase block font-semibold">Weight</span>
            <span className="font-bold text-xs text-cream">{profile?.current_weight_kg || 70}</span>
            <span className="text-[9px] text-cream/40 block">kg</span>
          </div>
        </div>

        <div className="text-[10px] text-cream/60 flex items-center justify-between border-t border-cream/10 pt-2">
          <span>Goal: <strong className="text-cream capitalize">{profile?.fitness_goal?.replace("_", " ") || "Maintain"}</strong></span>
          <span>Activity: <strong className="text-cream capitalize">{profile?.activity_level?.replace("_", " ") || "Moderate"}</strong></span>
        </div>
      </div>
    </div>
  );
}
