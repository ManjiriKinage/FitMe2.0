"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import {
  MealType,
  AIEstimateResponse,
  FoodLogItem,
  RecipeSearchResult,
  DashboardSummary,
} from "@/types";
import { Loader2, AlertCircle, Search, Sparkles, Clock } from "lucide-react";

interface FoodLogFormProps {
  initialMealType?: MealType;
  selectedDate?: string;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem, dailySummary?: DashboardSummary | null) => void;
  onSwitchToScan?: () => void;
}

const roundOne = (val: number): number => Math.round(val * 10) / 10;

export default function FoodLogForm({
  initialMealType = "breakfast",
  selectedDate,
  onClose,
  onSuccess,
  onSwitchToScan,
}: FoodLogFormProps) {
  // Query Input State
  const [query, setQuery] = useState("");
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Live debounced search & autocomplete state
  const [suggestions, setSuggestions] = useState<RecipeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Review & Edit Editable State (only populated after user searches or estimates)
  const [estimateData, setEstimateData] = useState<AIEstimateResponse | null>(null);
  const [hasEstimated, setHasEstimated] = useState(false);
  const [editFoodName, setEditFoodName] = useState("");
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editUnit, setEditUnit] = useState("serving");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  // Base nutrition reference for zero-AI local recalculation
  const baseMacroRef = useRef<{
    qty: number;
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
  }>({
    qty: 1,
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Quick suggestions for rapid testing
  const quickExamples = ["2 medium chapatis", "1 bowl rice", "1 bowl dal"];

  // Outside click listener to dismiss search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
  };

  // Instant selection of verified food catalog item with zero AI calls
  const handleSelectSuggestion = (item: RecipeSearchResult) => {
    setShowSuggestions(false);
    setQuery(`1 ${item.reported_serving_unit} ${item.name}`);

    const cals =
      item.serving_energy_kcal != null
        ? Math.round(item.serving_energy_kcal)
        : Math.round(
            (item.reported_energy_kcal_per_100g * item.reported_serving_size_g) / 100
          );
    const p = roundOne(
      ((item.reported_protein_g_per_100g || 0) * item.reported_serving_size_g) / 100
    );
    const c = roundOne(
      ((item.reported_carbohydrates_g_per_100g || 0) *
        item.reported_serving_size_g) /
        100
    );
    const f = roundOne(
      ((item.reported_fat_g_per_100g || 0) * item.reported_serving_size_g) / 100
    );

    setEditFoodName(item.name);
    setEditQuantity(1);
    setEditUnit(item.reported_serving_unit || "serving");
    setEditCalories(cals);
    setEditProtein(p);
    setEditCarbs(c);
    setEditFat(f);
    setHasEstimated(true);

    baseMacroRef.current = { qty: 1, calories: cals, carbs: c, protein: p, fat: f };

    setEstimateData({
      food_name: item.name,
      quantity: 1,
      unit: item.reported_serving_unit || "serving",
      estimated_calories: cals,
      protein_g: p,
      carbohydrates_g: c,
      fat_g: f,
      assumptions: `Verified profile: ${item.reported_serving_size_g}g per ${item.reported_serving_unit}`,
      validation_status: "verified",
      items: [
        {
          food_name: item.name,
          quantity: 1,
          unit: item.reported_serving_unit || "serving",
          estimated_calories: cals,
          protein_g: p,
          carbohydrates_g: c,
          fat_g: f,
          serving_weight_g: item.reported_serving_size_g,
          nutrition_source: "official_catalog",
          validation_status: "verified",
        },
      ],
    });
  };

  // Local zero-AI proportional recalculation on quantity changes
  const handleQuantityChange = (val: number) => {
    setEditQuantity(val);
    if (baseMacroRef.current && baseMacroRef.current.qty > 0 && val > 0) {
      const ratio = val / baseMacroRef.current.qty;
      setEditCalories(Math.round(baseMacroRef.current.calories * ratio));
      setEditCarbs(roundOne(baseMacroRef.current.carbs * ratio));
      setEditProtein(roundOne(baseMacroRef.current.protein * ratio));
      setEditFat(roundOne(baseMacroRef.current.fat * ratio));
    }
  };

  const handleEstimate = async (searchQuery?: string) => {
    const text = searchQuery || query;
    if (!text.trim()) return;

    setShowSuggestions(false);
    setIsEstimating(true);
    setEstimateError(null);

    try {
      const res = await api.estimateFood(text.trim());
      setEstimateData(res);
      setEditFoodName(res.food_name);
      setEditQuantity(res.quantity);
      setEditUnit(res.unit);
      setEditCalories(res.estimated_calories);
      setEditProtein(res.protein_g);
      setEditCarbs(res.carbohydrates_g);
      setEditFat(res.fat_g);
      setHasEstimated(true);

      baseMacroRef.current = {
        qty: res.quantity > 0 ? res.quantity : 1,
        calories: res.estimated_calories,
        carbs: res.carbohydrates_g,
        protein: res.protein_g,
        fat: res.fat_g,
      };
    } catch (err: any) {
      setEstimateError(
        err.message || "Failed to estimate food calories. Please try again."
      );
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSaveToLog = async () => {
    if (!editFoodName.trim()) {
      setSaveError("Food name is required.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    // Compute log timestamp respecting selected past date, strictly preventing future dates
    const getLoggedAt = (): string => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (selectedDate && selectedDate < todayStr) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        const pastDate = new Date(y, m - 1, d, today.getHours(), today.getMinutes(), today.getSeconds());
        return pastDate.toISOString();
      }
      return new Date().toISOString();
    };

    const targetLoggedAt = getLoggedAt();

    try {
      if (estimateData?.items && estimateData.items.length > 1) {
        try {
          const batchRes = await api.confirmMeal({
            meal_type: mealType,
            logged_at: targetLoggedAt,
            items: estimateData.items.map((it) => ({
              food_name: (it.food_name || "Food Item").trim(),
              quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
              unit: (it.unit || "serving").trim(),
              estimated_calories:
                Number(it.estimated_calories) >= 0 ? Number(it.estimated_calories) : 0,
              protein_g: Number(it.protein_g) >= 0 ? Number(it.protein_g) : 0,
              carbohydrates_g:
                Number(it.carbohydrates_g) >= 0 ? Number(it.carbohydrates_g) : 0,
              fat_g: Number(it.fat_g) >= 0 ? Number(it.fat_g) : 0,
              meal_type: mealType,
              food_id: it.food_id || null,
              profile_id: it.profile_id || null,
            })),
          });

          if (batchRes.saved_logs && batchRes.saved_logs.length > 0) {
            onSuccess(batchRes.saved_logs[0], batchRes.daily_summary);
          } else {
            onSuccess({} as any, batchRes.daily_summary);
          }
        } catch {
          const savedFallback = await api.createFoodLog({
            food_name: editFoodName.trim(),
            quantity: Number(editQuantity) > 0 ? Number(editQuantity) : 1,
            unit: editUnit.trim() || "meal",
            estimated_calories: Number(editCalories) >= 0 ? Number(editCalories) : 0,
            protein_g: Number(editProtein) >= 0 ? Number(editProtein) : 0,
            carbohydrates_g: Number(editCarbs) >= 0 ? Number(editCarbs) : 0,
            fat_g: Number(editFat) >= 0 ? Number(editFat) : 0,
            meal_type: mealType,
            logged_at: targetLoggedAt,
          });
          onSuccess(
            savedFallback.saved_log || savedFallback.food_log,
            savedFallback.daily_summary
          );
        }
      } else {
        const res = await api.createFoodLog({
          food_name: editFoodName.trim(),
          quantity: Number(editQuantity) > 0 ? Number(editQuantity) : 1,
          unit: editUnit.trim() || "serving",
          estimated_calories: Number(editCalories) >= 0 ? Number(editCalories) : 0,
          protein_g: Number(editProtein) >= 0 ? Number(editProtein) : 0,
          carbohydrates_g: Number(editCarbs) >= 0 ? Number(editCarbs) : 0,
          fat_g: Number(editFat) >= 0 ? Number(editFat) : 0,
          meal_type: mealType,
          logged_at: targetLoggedAt,
        });
        onSuccess(res.saved_log || res.food_log, res.daily_summary);
      }

      onClose();
    } catch (err: any) {
      let errorMsg = "Failed to save food entry. Please try again.";
      if (typeof err?.message === "string" && !err.message.includes("[object Object]")) {
        errorMsg = err.message;
      } else if (typeof err?.detail === "string") {
        errorMsg = err.detail;
      }
      setSaveError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const mealOptions: { key: MealType; label: string }[] = [
    { key: "breakfast", label: "Breakfast" },
    { key: "lunch", label: "Lunch" },
    { key: "dinner", label: "Dinner" },
    { key: "snack", label: "Snack" },
  ];

  const currentMealLabel =
    mealOptions.find((m) => m.key === mealType)?.label || "Breakfast";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="estimator-title"
      className="fixed inset-0 z-50 bg-[#22332d]/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-[28px] max-w-[720px] w-full shadow-2xl overflow-hidden my-auto border border-[#dfe6e1]/40 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3.5 px-7 py-6 border-b border-[#eef1ee]">
          <div className="flex-1">
            <h2 id="estimator-title" className="text-[22px] font-bold text-[#22332d] leading-tight m-0">
              AI Food Estimator
            </h2>
            <p className="text-[14px] text-[#5b6b64] mt-0.5">
              Nutrition estimates for Indian foods
            </p>
          </div>

          {onSwitchToScan && (
            <button
              type="button"
              onClick={onSwitchToScan}
              className="rounded-full bg-[#eaf1ec] px-3.5 py-1.5 text-xs font-semibold text-[#22332d] hover:bg-[#dfe6e1] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
            >
              Scan plate
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full border border-[#dfe6e1] bg-white text-[#22332d] flex items-center justify-center hover:bg-[#faf9f6] transition-colors text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:px-7 sm:py-6 flex flex-col">
          {/* Meal Segmented Tabs */}
          <div>
            <label className="block text-[13px] font-semibold text-[#3a4a43] mb-1.5">
              Meal
            </label>
            <div className="flex gap-2" role="radiogroup" aria-label="Meal type">
              {mealOptions.map((opt) => {
                const isSelected = mealType === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setMealType(opt.key)}
                    className={`flex-1 text-center py-3 px-2 rounded-[14px] border text-[14px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] ${
                      isSelected
                        ? "bg-[#22332d] text-white border-[#22332d]"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#faf9f6]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search / Describe Input */}
          <div ref={searchContainerRef} className="relative mt-5">
            <label
              htmlFor="estimator-query-input"
              className="block text-[13px] font-semibold text-[#3a4a43] mb-1.5"
            >
              Describe what you ate
            </label>
            <div className="flex gap-2.5 items-stretch">
              <input
                id="estimator-query-input"
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEstimate();
                  }
                }}
                placeholder="e.g. 2 medium chapatis, 1 bowl dal, or search food..."
                className="w-full h-[48px] px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] placeholder:text-[#5b6b64]/50 focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
              />
              <button
                type="button"
                onClick={() => handleEstimate()}
                disabled={isEstimating || !query.trim()}
                className="w-[130px] h-[48px] rounded-full bg-[#7c9a7e] hover:bg-[#6e8a70] text-white font-semibold text-[15px] flex items-center justify-center transition-colors disabled:opacity-60 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/40"
              >
                {isEstimating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <span>Estimate</span>
                )}
              </button>
            </div>

          </div>

          {/* Quick Suggestions Chips */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {quickExamples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  handleEstimate(ex);
                }}
                className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d] hover:bg-[#dfe6e1] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>

          {estimateError && (
            <div className="mt-4 p-3 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{estimateError}</span>
            </div>
          )}

          {/* Suggested Nutrition: Only shown AFTER searching or selecting a food */}
          {hasEstimated ? (
            <>
              {/* REVIEW & EDIT Header */}
              <div className="flex justify-between items-center mt-7">
                <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase">
                  REVIEW &amp; EDIT
                </div>
                {estimateData?.validation_status === "history_cached" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5e9] border border-[#c8e6c9] px-3.5 py-1 text-xs font-semibold text-[#1b5e20]">
                    <Clock className="w-3.5 h-3.5 text-[#2e7d32]" />
                    From your past logs (0 tokens)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d]">
                    <Sparkles className="w-3.5 h-3.5 text-[#5f7d61]" />
                    AI estimate
                  </span>
                )}
              </div>

              {/* 4 Pastel Macro Stat Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5">
                <div className="rounded-[16px] p-3.5 text-center bg-[#fef9e5] border border-[#f5ebbf]">
                  <small className="block text-[#5b6b64] text-[12px] font-medium">
                    Calories
                  </small>
                  <b className="text-[22px] font-bold text-[#22332d] mt-0.5 block">
                    {editCalories}
                  </b>
                </div>

                <div className="rounded-[16px] p-3.5 text-center bg-[#eaf4fd] border border-[#cfe5f7]">
                  <small className="block text-[#5b6b64] text-[12px] font-medium">
                    Carbs
                  </small>
                  <b className="text-[22px] font-bold text-[#22332d] mt-0.5 block">
                    {editCarbs}g
                  </b>
                </div>

                <div className="rounded-[16px] p-3.5 text-center bg-[#fef9e5] border border-[#f5ebbf]">
                  <small className="block text-[#5b6b64] text-[12px] font-medium">
                    Protein
                  </small>
                  <b className="text-[22px] font-bold text-[#22332d] mt-0.5 block">
                    {editProtein}g
                  </b>
                </div>

                <div className="rounded-[16px] p-3.5 text-center bg-[#f0f9e4] border border-[#dcefc4]">
                  <small className="block text-[#5b6b64] text-[12px] font-medium">
                    Fat
                  </small>
                  <b className="text-[22px] font-bold text-[#22332d] mt-0.5 block">
                    {editFat}g
                  </b>
                </div>
              </div>

              {/* 3 Editable Inputs (Food, Quantity, Serving unit) */}
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 mt-4">
                <div>
                  <label
                    htmlFor="edit-food-name"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Food
                  </label>
                  <input
                    id="edit-food-name"
                    type="text"
                    value={editFoodName}
                    onChange={(e) => setEditFoodName(e.target.value)}
                    placeholder="Food name"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-quantity"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Quantity
                  </label>
                  <input
                    id="edit-quantity"
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={editQuantity}
                    onChange={(e) => handleQuantityChange(Number(e.target.value))}
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-serving-unit"
                    className="block text-[13px] font-semibold text-[#3a4a43]"
                  >
                    Serving unit
                  </label>
                  <input
                    id="edit-serving-unit"
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    placeholder="serving"
                    className="w-full h-12 mt-1.5 px-4 rounded-[14px] border border-[#dfe6e1] bg-white text-[15px] font-medium text-[#22332d] focus:border-[#7c9a7e] focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]/20 transition-all"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="mt-8 py-9 px-4 rounded-[18px] border border-dashed border-[#dfe6e1] text-center bg-[#fbfdfc]">
              <p className="text-[13px] text-[#5b6b64]">
                Type what you ate above or tap a quick chip to calculate calories &amp; macros.
              </p>
            </div>
          )}

          {saveError && (
            <div className="mt-4 p-3 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex gap-3 px-7 py-5 border-t border-[#eef1ee] bg-white">
          <button
            type="button"
            onClick={onClose}
            className="h-[52px] px-6 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            Cancel
          </button>
          {hasEstimated && editCalories > 0 && (
            <button
              type="button"
              onClick={handleSaveToLog}
              disabled={isSaving || !editFoodName.trim()}
              className="flex-1 h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>Saving to log...</span>
                </>
              ) : (
                <span>
                  Save to {currentMealLabel} log ({editCalories} kcal)
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
