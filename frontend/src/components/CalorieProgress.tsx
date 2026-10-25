"use client";

import { Flame, CheckCircle, AlertTriangle } from "lucide-react";

interface CalorieProgressProps {
  target: number;
  consumed: number;
  remaining: number;
  percentage: number;
}

export default function CalorieProgress({
  target,
  consumed,
  remaining,
  percentage,
}: CalorieProgressProps) {
  // SVG Ring calculations
  const size = 164;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Clamp percentage between 0 and 100 for SVG stroke dasharray
  const visualPct = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset = circumference - (visualPct / 100) * circumference;

  const isExceeded = consumed > target && target > 0;

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 border border-mint shadow-soft flex flex-col items-center justify-between text-center">
      <div className="w-full flex items-center justify-between mb-2">
        <h3 className="font-extrabold text-base text-charcoal tracking-tight">Calories Budget</h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-mint text-charcoal">
          Today
        </span>
      </div>

      {/* Circular Progress Gauge */}
      <div className="relative flex items-center justify-center my-1">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E5F2E7"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
          />

          {/* Active Progress Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={isExceeded ? "#F59E0B" : "#789879"}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Content */}
        <div className="absolute flex flex-col items-center justify-center text-center px-4">
          <div className="w-7 h-7 rounded-full bg-mint flex items-center justify-center mb-0.5 text-sage">
            <Flame className="w-3.5 h-3.5 fill-current text-sage" />
          </div>
          <span className="text-xl font-black text-charcoal tracking-tight">
            {Math.round(consumed)}
          </span>
          <span className="text-[10px] font-semibold text-charcoal/60 uppercase tracking-wider">
            kcal eaten
          </span>
        </div>
      </div>

      {/* Target Breakdown Stats */}
      <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-charcoal/5">
        <div className="text-left bg-cream/70 rounded-xl p-2.5">
          <span className="text-[10px] font-semibold text-charcoal/50 block uppercase">
            Daily Goal
          </span>
          <span className="text-sm font-extrabold text-charcoal">
            {target} <span className="text-[10px] font-normal text-charcoal/60">kcal</span>
          </span>
        </div>

        <div className="text-left bg-mint/50 rounded-xl p-2.5">
          <span className="text-[10px] font-semibold text-charcoal/50 block uppercase">
            {isExceeded ? "Surplus" : "Remaining"}
          </span>
          <span className={`text-sm font-extrabold ${isExceeded ? "text-amber-700" : "text-sage-700"}`}>
            {isExceeded ? Math.round(consumed - target) : Math.round(remaining)}{" "}
            <span className="text-[10px] font-normal text-charcoal/60">kcal</span>
          </span>
        </div>
      </div>

      {/* Status note */}
      <div className="mt-3 text-xs text-charcoal/60 flex items-center gap-1.5">
        {isExceeded ? (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Target reached for today</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-sage" />
            <span>{Math.round(100 - percentage)}% of daily allowance remaining</span>
          </>
        )}
      </div>
    </div>
  );
}
