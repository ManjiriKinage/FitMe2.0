"use client";

import { useState } from "react";
import { FoodLogItem, MealType } from "@/types";
import { Camera, Plus, Trash2 } from "lucide-react";

interface FoodLogListProps {
  meals: Record<MealType, FoodLogItem[]>;
  remainingCalories: number;
  onOpenAddFood: (mealType?: MealType) => void;
  onOpenScanMeal?: (mealType?: MealType) => void;
  onDeleteFood: (id: string) => Promise<void>;
}

export default function FoodLogList({
  meals,
  remainingCalories,
  onOpenAddFood,
  onOpenScanMeal,
  onDeleteFood,
}: FoodLogListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mealConfigs: {
    key: MealType;
    label: string;
    bgColor: string;
    borderColor: string;
    badgeBg: string;
    logButtonText: string;
  }[] = [
    {
      key: "breakfast",
      label: "Breakfast",
      bgColor: "bg-[#eaf4fd]",
      borderColor: "border-[#cfe5f7]",
      badgeBg: "bg-[#d2e8f9]",
      logButtonText: "Log breakfast",
    },
    {
      key: "lunch",
      label: "Lunch",
      bgColor: "bg-[#f0f9e4]",
      borderColor: "border-[#dcefc4]",
      badgeBg: "bg-[#dcefc4]",
      logButtonText: "Log lunch",
    },
    {
      key: "dinner",
      label: "Dinner",
      bgColor: "bg-[#fdf3ec]",
      borderColor: "border-[#f6e0d0]",
      badgeBg: "bg-[#f6e0d0]",
      logButtonText: "Log dinner",
    },
    {
      key: "snack",
      label: "Snacks",
      bgColor: "bg-[#fef9e5]",
      borderColor: "border-[#f5ebbf]",
      badgeBg: "bg-[#f5ebbf]",
      logButtonText: "Log snack",
    },
  ];

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this food entry?")) return;
    setDeletingId(id);
    try {
      await onDeleteFood(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <article
      aria-label="Daily Calories and Meals Breakdown"
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-[18px] font-bold text-[#22332d] m-0">Daily Calories</h2>
        <span className="bg-[#faf7f0] border border-[#eeeeee] rounded-full px-3 py-1 text-xs text-[#22332d] font-semibold">
          Meals Breakdown
        </span>
      </div>

      {/* 4 Meal Cards */}
      <div className="flex flex-col gap-3">
        {mealConfigs.map(({ key, label, bgColor, borderColor, badgeBg, logButtonText }) => {
          const items = meals[key] || [];
          const mealCalories = Math.round(
            items.reduce((acc, curr) => acc + (curr.estimated_calories || 0), 0)
          );
          const hasItems = items.length > 0;
          const summaryDescription = hasItems
            ? items.map((i) => i.food_name).join(", ")
            : "No foods logged yet";

          return (
            <div
              key={key}
              className={`rounded-[18px] p-4 sm:px-5 sm:py-4 border ${bgColor} ${borderColor} transition-all`}
            >
              {/* Meal Header Row */}
              <div className="flex items-center gap-3 sm:gap-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b className="text-[17px] font-bold text-[#22332d]">{label}</b>
                    {hasItems && (
                      <span
                        className={`${badgeBg} rounded-full px-2.5 py-0.5 text-xs font-semibold text-[#22332d]`}
                      >
                        {items.length} {items.length === 1 ? "item" : "items"}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[#5b6b64] truncate mt-0.5">
                    {summaryDescription}
                  </div>
                </div>

                <b className="text-[20px] font-bold text-[#22332d] flex-shrink-0">
                  {mealCalories} <span className="text-[13px] text-[#5b6b64] font-normal">Kcal</span>
                </b>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!hasItems ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenAddFood(key)}
                        className="h-10 px-4 rounded-full border border-[#e6ebe7] bg-white hover:bg-[#f6f9f7] text-[#22332d] font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                      >
                        {logButtonText}
                      </button>
                      {onOpenScanMeal && (
                        <button
                          type="button"
                          onClick={() => onOpenScanMeal(key)}
                          aria-label={`Scan ${label}`}
                          className="w-10 h-10 rounded-full border border-[#e6ebe7] bg-white hover:bg-[#f6f9f7] text-[#22332d] flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                        >
                          <Camera className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {onOpenScanMeal && (
                        <button
                          type="button"
                          onClick={() => onOpenScanMeal(key)}
                          aria-label={`Scan ${label}`}
                          className="w-10 h-10 rounded-full border border-[#e6ebe7] bg-white hover:bg-[#f6f9f7] text-[#22332d] flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                        >
                          <Camera className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenAddFood(key)}
                        aria-label={`Add food to ${label}`}
                        className="w-10 h-10 rounded-full border border-[#e6ebe7] bg-white hover:bg-[#f6f9f7] text-[#22332d] flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                      >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Nested Food Items */}
              {hasItems && (
                <div className="mt-2.5 flex flex-col gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-[14px] px-4 py-3 flex justify-between items-center shadow-sm border border-[#e6ebe7]/60"
                    >
                      <div className="min-w-0 pr-3">
                        <b className="text-[15px] font-bold text-[#22332d] block truncate">
                          {item.food_name}
                        </b>
                        <div className="text-[13px] text-[#5b6b64] mt-0.5">
                          {item.quantity} {item.unit} · P: {Number(item.protein_g).toFixed(1)}g · C:{" "}
                          {Number(item.carbohydrates_g).toFixed(1)}g · F:{" "}
                          {Number(item.fat_g).toFixed(1)}g
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <b className="text-[15px] font-bold text-[#22332d]">
                          {Math.round(item.estimated_calories)} kcal
                        </b>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(item.id, e)}
                          disabled={deletingId === item.id}
                          aria-label={`Delete ${item.food_name}`}
                          className="w-8 h-8 rounded-full border-0 text-[#5b6b64] hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-red-400"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Remaining Calories Footer */}
      <div className="border-t border-[#eef1ee] pt-3.5 flex items-center gap-2.5 text-[14px]">
        <span className="text-[13px] text-[#5b6b64]">Remaining:</span>
        <b className="text-[18px] font-bold text-[#22332d]">
          {Math.max(0, Math.round(remainingCalories))} Kcal
        </b>
      </div>
    </article>
  );
}
