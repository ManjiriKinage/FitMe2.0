"use client";

import { CalorieCalculationResult } from "@/types";

interface LiveTargetPreviewCardProps {
  preview: CalorieCalculationResult | null;
  calculating?: boolean;
}

export default function LiveTargetPreviewCard({
  preview,
  calculating = false,
}: LiveTargetPreviewCardProps) {
  const dailyGoal = preview?.daily_calorie_target ?? 1730;
  const bmr = preview?.bmr ?? 1395;
  const tdee = preview?.tdee ?? 2163;
  const bmi = preview?.bmi ? Number(preview.bmi).toFixed(1) : "23.9";
  const bmiCategory = preview?.bmi_category || "Normal weight";

  const carbs = preview?.macro_targets?.carbohydrates_g
    ? Math.round(preview.macro_targets.carbohydrates_g)
    : 195;
  const protein = preview?.macro_targets?.protein_g
    ? Math.round(preview.macro_targets.protein_g)
    : 121;
  const fats = preview?.macro_targets?.fat_g
    ? Math.round(preview.macro_targets.fat_g)
    : 52;

  return (
    <aside
      aria-label="Live Target Preview"
      className="bg-[#22332d] text-white rounded-[28px] p-7 flex flex-col justify-between shadow-soft self-start w-full transition-all"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[18px] text-white m-0">Live target preview</h2>
        {calculating && (
          <span className="text-[11px] text-[#b7cdb9] animate-pulse">
            Calculating...
          </span>
        )}
      </div>

      {/* Recommended Daily Goal Tile */}
      <div className="text-center my-6 p-6 border border-[#3d5247] rounded-[20px] bg-[#22332d]">
        <div className="text-[12px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
          RECOMMENDED DAILY GOAL
        </div>
        <div className="text-[48px] sm:text-[56px] font-bold leading-tight mt-1">
          {dailyGoal}{" "}
          <span className="text-[18px] font-medium text-[#dfe9e2]">
            kcal/day
          </span>
        </div>
      </div>

      {/* BMR and TDEE Tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            Est. BMR
          </small>
          <b className="text-[22px] font-bold text-white mt-0.5 block">{bmr}</b>
        </div>
        <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            Est. TDEE
          </small>
          <b className="text-[22px] font-bold text-white mt-0.5 block">{tdee}</b>
        </div>
      </div>

      {/* BMI Tile with Badge */}
      <div className="bg-[#2d4238] rounded-[16px] p-3.5 mt-3 flex justify-between items-center text-left border border-[#3d5247]/30">
        <span>
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            BMI
          </small>
          <b className="text-[22px] font-bold text-white leading-tight">{bmi}</b>
        </span>
        <span className="rounded-full bg-[#7c9a7e] text-white px-3.5 py-1 text-xs font-semibold">
          {bmiCategory}
        </span>
      </div>

      {/* Target Macros Header */}
      <div className="text-[12px] font-bold tracking-[0.08em] text-[#b7cdb9] uppercase mt-6 mb-3">
        TARGET MACROS
      </div>

      {/* Target Macros 3-Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            Carbs
          </small>
          <b className="text-[22px] font-bold text-white mt-0.5 block">{carbs}g</b>
        </div>
        <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            Protein
          </small>
          <b className="text-[22px] font-bold text-white mt-0.5 block">{protein}g</b>
        </div>
        <div className="bg-[#2d4238] rounded-[16px] p-3.5 text-center border border-[#3d5247]/30">
          <small className="block text-[#b7cdb9] text-[12px] font-medium">
            Fats
          </small>
          <b className="text-[22px] font-bold text-white mt-0.5 block">{fats}g</b>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[12px] text-[#b7cdb9] mt-5 leading-normal">
        Estimates for guidance only, not medical advice.
      </p>
    </aside>
  );
}

