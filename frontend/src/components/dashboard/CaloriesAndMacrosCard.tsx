"use client";

import { DailyMacroTotals, MacroTargets } from "@/types";

interface CaloriesAndMacrosCardProps {
  calorieTarget: number;
  consumed: number;
  remaining: number;
  percentage: number;
  macroTotals: DailyMacroTotals;
  macroTargets?: MacroTargets;
}

export default function CaloriesAndMacrosCard({
  calorieTarget,
  consumed,
  remaining,
  percentage,
  macroTotals,
  macroTargets,
}: CaloriesAndMacrosCardProps) {
  // Default targets if not explicitly returned by API
  const defaultCarbsTarget = Math.round((calorieTarget * 0.5) / 4);
  const defaultProteinTarget = Math.round((calorieTarget * 0.2) / 4);
  const defaultFatTarget = Number(((calorieTarget * 0.3) / 9).toFixed(1));

  const carbsTarget = macroTargets?.carbohydrates_g || defaultCarbsTarget || 250;
  const proteinTarget = macroTargets?.protein_g || defaultProteinTarget || 100;
  const fatTarget = macroTargets?.fat_g || defaultFatTarget || 66.7;

  const carbsPercent = carbsTarget > 0 ? Math.min(100, Math.round((macroTotals.carbohydrates_g / carbsTarget) * 100)) : 0;
  const proteinPercent = proteinTarget > 0 ? Math.min(100, Math.round((macroTotals.protein_g / proteinTarget) * 100)) : 0;
  const fatPercent = fatTarget > 0 ? Math.min(100, Math.round((macroTotals.fat_g / fatTarget) * 100)) : 0;

  // SVG Gauge calculations (r = 80, circumference = 2 * pi * 80 ~= 502.65)
  const circumference = 502.7;
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const dashLength = (clampedPercentage / 100) * circumference;

  return (
    <article
      aria-label="Calories and Macros Summary"
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-5"
    >
      {/* Card Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-[18px] font-bold text-[#22332d] m-0">Calories &amp; Macros</h2>
        <span className="bg-[#eef3ef] rounded-full px-3 py-1 text-xs font-semibold text-[#22332d]">
          Today
        </span>
      </div>

      <div className="flex gap-8 items-center flex-wrap">
        {/* Circular SVG Gauge */}
        <div className="relative w-[190px] h-[190px] flex-none mx-auto sm:mx-0">
          <svg
            width="190"
            height="190"
            viewBox="0 0 190 190"
            aria-hidden="true"
            className="transform -rotate-90"
          >
            {/* Background ring track */}
            <circle
              cx="95"
              cy="95"
              r="80"
              fill="none"
              stroke="#e6f0e8"
              strokeWidth="14"
            />
            {/* Dynamic foreground progress arc */}
            <circle
              cx="95"
              cy="95"
              r="80"
              fill="none"
              stroke="#7c9a7e"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${dashLength} ${circumference}`}
              className="transition-all duration-500 ease-out"
            />
          </svg>

          {/* Inner Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[40px] font-bold text-[#22332d] leading-none tracking-tight">
              {Math.max(0, Math.round(remaining))}
            </div>
            <div className="text-[13px] text-[#5b6b64] mt-1 font-medium">
              kcal remaining
            </div>
          </div>
        </div>

        {/* Right Stats & Macro Bars */}
        <div className="flex-1 min-w-[260px] flex flex-col gap-3.5">
          {/* Target & Eaten Summary Tiles */}
          <div className="flex gap-3">
            <div className="flex-1 bg-[#f4f8f5] rounded-[14px] p-3 sm:px-4 sm:py-3 border border-[#eaf1ec]">
              <div className="text-[13px] text-[#5b6b64] font-semibold uppercase tracking-wider">
                Daily Goal
              </div>
              <div className="font-bold text-[20px] text-[#22332d] mt-0.5">
                {Math.round(calorieTarget)}{" "}
                <span className="text-[13px] text-[#5b6b64] font-normal">kcal</span>
              </div>
            </div>

            <div className="flex-1 bg-[#f4f8f5] rounded-[14px] p-3 sm:px-4 sm:py-3 border border-[#eaf1ec]">
              <div className="text-[13px] text-[#5b6b64] font-semibold uppercase tracking-wider">
                Eaten
              </div>
              <div className="font-bold text-[20px] text-[#22332d] mt-0.5">
                {Math.round(consumed)}{" "}
                <span className="text-[13px] text-[#5b6b64] font-normal">kcal</span>
              </div>
            </div>
          </div>

          {/* Carbohydrate Bar */}
          <div>
            <div className="flex justify-between text-[14px] mb-1.5 text-[#22332d]">
              <span>
                <b className="font-bold">Carbohydrate</b> · {Number(macroTotals.carbohydrates_g).toFixed(1)}g
              </span>
              <span className="text-[13px] text-[#5b6b64]">
                {carbsPercent}% of {carbsTarget}g
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#e9eeea] overflow-hidden">
              <div
                className="h-full bg-[#22332d] rounded-full transition-all duration-300"
                style={{ width: `${carbsPercent}%` }}
              />
            </div>
          </div>

          {/* Protein Bar */}
          <div>
            <div className="flex justify-between text-[14px] mb-1.5 text-[#22332d]">
              <span>
                <b className="font-bold">Protein</b> · {Number(macroTotals.protein_g).toFixed(1)}g
              </span>
              <span className="text-[13px] text-[#5b6b64]">
                {proteinPercent}% of {proteinTarget}g
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#e9eeea] overflow-hidden">
              <div
                className="h-full bg-[#22332d] rounded-full transition-all duration-300"
                style={{ width: `${proteinPercent}%` }}
              />
            </div>
          </div>

          {/* Fats Bar */}
          <div>
            <div className="flex justify-between text-[14px] mb-1.5 text-[#22332d]">
              <span>
                <b className="font-bold">Fats</b> · {Number(macroTotals.fat_g).toFixed(1)}g
              </span>
              <span className="text-[13px] text-[#5b6b64]">
                {fatPercent}% of {fatTarget}g
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#e9eeea] overflow-hidden">
              <div
                className="h-full bg-[#22332d] rounded-full transition-all duration-300"
                style={{ width: `${fatPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

