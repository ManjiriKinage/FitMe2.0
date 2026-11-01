"use client";

import { UserProfile } from "@/types";

interface MetabolicOverviewCardProps {
  profile: UserProfile | null;
}

export default function MetabolicOverviewCard({ profile }: MetabolicOverviewCardProps) {
  const formatGoal = (goal?: string) => {
    switch (goal) {
      case "lose_weight":
        return "Lose Weight";
      case "maintain_weight":
        return "Maintain";
      case "gain_muscle":
        return "Gain Muscle";
      case "gain_weight":
        return "Gain Weight";
      default:
        return "Maintain";
    }
  };

  const formatActivity = (level?: string) => {
    switch (level) {
      case "sedentary":
        return "Sedentary";
      case "lightly_active":
        return "Light";
      case "moderately_active":
        return "Moderate";
      case "very_active":
        return "Very Active";
      case "extra_active":
        return "Extra Active";
      default:
        return "Moderate";
    }
  };

  const bmr = profile?.bmr ? Math.round(profile.bmr) : "—";
  const tdee = profile?.tdee ? Math.round(profile.tdee) : "—";
  const weight = profile?.current_weight_kg ? Number(profile.current_weight_kg).toFixed(0) : "—";

  return (
    <article
      aria-label="Metabolic Overview Bio-Metrics"
      className="bg-[#22332d] text-white rounded-[24px] p-6 flex flex-col justify-between gap-[18px] shadow-sm"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="text-[11px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
            BIO-METRICS
          </div>
          <h2 className="text-[20px] font-bold text-white leading-tight mt-0.5">
            Metabolic Overview
          </h2>
        </div>
        <span className="bg-[#3d5247] rounded-full px-3 py-1 text-xs text-[#dfe9e2] font-medium">
          Active
        </span>
      </div>

      {/* 3 Metric Tiles Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-[#2d4238] rounded-[14px] p-3 text-center border border-[#3d5247]/40">
          <div className="text-[11px] text-[#b7cdb9] font-medium uppercase tracking-wider">
            BMR
          </div>
          <div className="font-bold text-[20px] text-white mt-0.5">{bmr}</div>
          <div className="text-[11px] text-[#b7cdb9]">kcal</div>
        </div>

        <div className="bg-[#2d4238] rounded-[14px] p-3 text-center border border-[#3d5247]/40">
          <div className="text-[11px] text-[#b7cdb9] font-medium uppercase tracking-wider">
            TDEE
          </div>
          <div className="font-bold text-[20px] text-white mt-0.5">{tdee}</div>
          <div className="text-[11px] text-[#b7cdb9]">kcal</div>
        </div>

        <div className="bg-[#2d4238] rounded-[14px] p-3 text-center border border-[#3d5247]/40">
          <div className="text-[11px] text-[#b7cdb9] font-medium uppercase tracking-wider">
            WEIGHT
          </div>
          <div className="font-bold text-[20px] text-white mt-0.5">{weight}</div>
          <div className="text-[11px] text-[#b7cdb9]">kg</div>
        </div>
      </div>

      {/* Footer Details */}
      <div className="flex justify-between items-center text-[13px] border-t border-[#3d5247] pt-3.5 text-[#b7cdb9]">
        <span>
          Goal: <b className="text-white font-semibold">{formatGoal(profile?.fitness_goal)}</b>
        </span>
        <span>
          Activity: <b className="text-white font-semibold">{formatActivity(profile?.activity_level)}</b>
        </span>
      </div>
    </article>
  );
}

