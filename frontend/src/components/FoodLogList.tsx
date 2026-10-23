"use client";

import { useState } from "react";
import { FoodLogItem, MealType } from "@/types";
import { ChevronDown, ChevronUp, Trash2, Plus, Coffee, Sun, Sunset, Cookie } from "lucide-react";

interface FoodLogListProps {
  meals: Record<MealType, FoodLogItem[]>;
  remainingCalories: number;
  onOpenAddFood: (mealType?: MealType) => void;
  onDeleteFood: (id: string) => Promise<void>;
}

export default function FoodLogList({
  meals,
  remainingCalories,
  onOpenAddFood,
  onDeleteFood,
}: FoodLogListProps) {
  const [expandedMeal, setExpandedMeal] = useState<MealType | null>("lunch");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mealConfigs: {
    key: MealType;
    label: string;
    icon: any;
    bgColor: string;
    borderColor: string;
    badgeColor: string;
  }[] = [
    {
      key: "breakfast",
      label: "Breakfast",
      icon: Coffee,
      bgColor: "bg-sky-50/80 hover:bg-sky-50",
      borderColor: "border-sky-200/60",
      badgeColor: "text-sky-800 bg-sky-100",
    },
    {
      key: "lunch",
      label: "Lunch",
      icon: Sun,
      bgColor: "bg-lime-50/80 hover:bg-lime-50",
      borderColor: "border-lime-200/60",
      badgeColor: "text-lime-900 bg-lime-100",
    },
    {
      key: "dinner",
      label: "Dinner",
      icon: Sunset,
      bgColor: "bg-orange-50/70 hover:bg-orange-50",
      borderColor: "border-orange-200/60",
      badgeColor: "text-orange-900 bg-orange-100",
    },
    {
      key: "snack",
      label: "Snacks",
      icon: Cookie,
      bgColor: "bg-amber-50/70 hover:bg-amber-50",
      borderColor: "border-amber-200/60",
      badgeColor: "text-amber-900 bg-amber-100",
    },
  ];

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this food item?")) return;
    setDeletingId(id);
    try {
      await onDeleteFood(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-4xl p-6 sm:p-7 border border-mint shadow-soft flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-extrabold text-lg text-charcoal tracking-tight">Daily Calories</h3>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cream text-charcoal/70 border border-charcoal/5">
            Meals Breakdown
          </span>
        </div>

        {/* Meal cards stack */}
        <div className="space-y-3.5">
          {mealConfigs.map(({ key, label, icon: Icon, bgColor, borderColor, badgeColor }) => {
            const items = meals[key] || [];
            const mealCalories = Math.round(items.reduce((acc, curr) => acc + curr.estimated_calories, 0));
            const isExpanded = expandedMeal === key;

            const summaryDescription =
              items.length > 0
                ? items.map((i) => i.food_name).join(", ")
                : "No foods logged yet";

            return (
              <div
                key={key}
                className={`rounded-3xl border transition-all overflow-hidden ${bgColor} ${borderColor}`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedMeal(isExpanded ? null : key)}
                  className="p-4 sm:p-4.5 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/90 flex items-center justify-center text-charcoal shadow-sm flex-shrink-0">
                      <Icon className="w-5 h-5 text-charcoal" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm sm:text-base text-charcoal flex items-center gap-2">
                        {label}
                        {items.length > 0 && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                            {items.length} {items.length === 1 ? "item" : "items"}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-charcoal/60 truncate max-w-xs sm:max-w-md">
                        {summaryDescription}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-extrabold text-sm sm:text-base text-charcoal">
                      {mealCalories} <span className="text-xs font-medium text-charcoal/60">Kcal</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAddFood(key);
                      }}
                      title={`Add to ${label}`}
                      className="w-8 h-8 rounded-xl bg-white/90 hover:bg-white text-charcoal flex items-center justify-center shadow-sm transition hover:scale-105"
                    >
                      <Plus className="w-4 h-4 text-sage-700" />
                    </button>
                    <div className="text-charcoal/40">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Food Item List */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-2 border-t border-charcoal/5">
                    {items.length === 0 ? (
                      <div className="text-center py-4 text-xs text-charcoal/50 flex flex-col items-center gap-2">
                        <p>No food logged for {label.toLowerCase()}.</p>
                        <button
                          onClick={() => onOpenAddFood(key)}
                          className="px-3 py-1.5 rounded-xl bg-white text-charcoal text-xs font-bold border border-charcoal/10 hover:border-sage transition shadow-sm inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 text-sage" />
                          Log {label}
                        </button>
                      </div>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white/95 rounded-2xl p-3 flex items-center justify-between shadow-sm text-xs border border-charcoal/5"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-charcoal block truncate">
                              {item.food_name}
                            </span>
                            <span className="text-[11px] text-charcoal/60">
                              {item.quantity} {item.unit} • P: {item.protein_g}g • C: {item.carbohydrates_g}g • F: {item.fat_g}g
                            </span>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="font-extrabold text-charcoal text-xs">
                              {Math.round(item.estimated_calories)} kcal
                            </span>
                            <button
                              onClick={(e) => handleDelete(item.id, e)}
                              disabled={deletingId === item.id}
                              title="Delete food item"
                              className="p-1.5 text-charcoal/40 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer bar with Remaining Calories and prominent + button */}
      <div className="mt-6 pt-5 border-t border-charcoal/5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-charcoal/70">
          <span>Remaining:</span>
          <div className="flex gap-1 items-center">
            <span className="w-5 h-1.5 rounded-full bg-amber-400" />
            <span className="w-5 h-1.5 rounded-full bg-sky-400" />
            <span className="w-5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="font-extrabold text-charcoal text-sm ml-1">
            {Math.round(remainingCalories)} Kcal
          </span>
        </div>

        <button
          onClick={() => onOpenAddFood()}
          title="Add Food Entry"
          className="w-11 h-11 rounded-2xl bg-charcoal text-cream hover:bg-charcoal-light flex items-center justify-center transition shadow-soft hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6 text-cream" />
        </button>
      </div>
    </div>
  );
}
