"use client";

import { DailyMacroTotals, MacroTargets } from "@/types";

interface NutritionSummaryProps {
  macroTotals: DailyMacroTotals;
  macroTargets?: MacroTargets;
}

export default function NutritionSummary({
  macroTotals,
  macroTargets,
}: NutritionSummaryProps) {
  // Targets fallback if not specified
  const carbTarget = macroTargets?.carbohydrates_g || 250;
  const proteinTarget = macroTargets?.protein_g || 120;
  const fatTarget = macroTargets?.fat_g || 65;

  const carbPct = Math.min(100, Math.round((macroTotals.carbohydrates_g / carbTarget) * 100));
  const proteinPct = Math.min(100, Math.round((macroTotals.protein_g / proteinTarget) * 100));
  const fatPct = Math.min(100, Math.round((macroTotals.fat_g / fatTarget) * 100));

  const items = [
    {
      label: "Carbohydrate",
      current: macroTotals.carbohydrates_g,
      target: carbTarget,
      pct: carbPct,
      badgeBg: "bg-sky-100 text-sky-800",
    },
    {
      label: "Protein",
      current: macroTotals.protein_g,
      target: proteinTarget,
      pct: proteinPct,
      badgeBg: "bg-amber-100 text-amber-900",
    },
    {
      label: "Fats",
      current: macroTotals.fat_g,
      target: fatTarget,
      pct: fatPct,
      badgeBg: "bg-emerald-100 text-emerald-900",
    },
  ];

  return (
    <div className="bg-white rounded-4xl p-6 sm:p-7 border border-mint shadow-soft flex flex-col justify-between">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-extrabold text-lg text-charcoal tracking-tight">Daily Recap</h3>
        <span className="text-xs text-charcoal/50 font-medium">Macronutrients</span>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="p-3.5 rounded-3xl bg-cream/50 border border-charcoal/5 flex items-center justify-between gap-4 card-hover"
          >
            {/* Pill Value Badge */}
            <div className={`px-4 py-2 rounded-2xl font-bold text-sm tracking-tight flex-shrink-0 ${item.badgeBg}`}>
              {item.current}g
            </div>

            {/* Label and Progress Bar */}
            <div className="flex-1">
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-bold text-charcoal">{item.label}</span>
                <span className="font-semibold text-charcoal/50">
                  {item.pct}% <span className="text-[10px]">/ {item.target}g</span>
                </span>
              </div>
              <div className="w-full h-2 bg-charcoal/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-charcoal rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
