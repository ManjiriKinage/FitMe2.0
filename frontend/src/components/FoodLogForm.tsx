"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MealType, AIEstimateResponse, FoodLogItem } from "@/types";
import {
  X,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  HelpCircle,
  Info,
  Flame,
  ArrowRight
} from "lucide-react";

interface FoodLogFormProps {
  initialMealType?: MealType;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem) => void;
}

export default function FoodLogForm({
  initialMealType = "breakfast",
  onClose,
  onSuccess,
}: FoodLogFormProps) {
  // Query Input State
  const [query, setQuery] = useState("");
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Review & Edit Editable State
  const [estimateData, setEstimateData] = useState<AIEstimateResponse | null>(null);
  const [editFoodName, setEditFoodName] = useState("");
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editUnit, setEditUnit] = useState("");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Examples user can click for quick testing
  const quickExamples = [
    "2 medium chapatis",
    "1 bowl of dal",
    "1 plate of poha",
    "1 cup of cooked rice",
    "1 homemade paneer bhurji",
    "2 boiled eggs with 1 slice toast"
  ];

  const handleEstimate = async (searchQuery?: string) => {
    const text = searchQuery || query;
    if (!text.trim()) return;

    setIsEstimating(true);
    setEstimateError(null);

    try {
      const res = await api.estimateFood(text.trim());
      setEstimateData(res);
      // Pre-fill editable inputs with AI estimates
      setEditFoodName(res.food_name);
      setEditQuantity(res.quantity);
      setEditUnit(res.unit);
      setEditCalories(res.estimated_calories);
      setEditProtein(res.protein_g);
      setEditCarbs(res.carbohydrates_g);
      setEditFat(res.fat_g);
    } catch (err: any) {
      setEstimateError(err.message || "Failed to estimate food calories. Please try again.");
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

    try {
      const savedItem = await api.createFoodLog({
        food_name: editFoodName.trim(),
        quantity: Number(editQuantity) || 1,
        unit: editUnit.trim() || "serving",
        estimated_calories: Number(editCalories) || 0,
        protein_g: Number(editProtein) || 0,
        carbohydrates_g: Number(editCarbs) || 0,
        fat_g: Number(editFat) || 0,
        meal_type: mealType,
        logged_at: new Date().toISOString(),
      });

      onSuccess(savedItem);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save food entry. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-xl rounded-4xl p-6 sm:p-8 shadow-2xl border border-mint max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-charcoal/5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-mint flex items-center justify-center text-sage">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-xl text-charcoal tracking-tight">AI Food Estimator</h3>
              <p className="text-xs text-charcoal/60">Type meals in everyday natural language</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-cream hover:bg-cream-soft flex items-center justify-center text-charcoal/60 hover:text-charcoal transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meal Selector */}
        <div className="mt-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/60 mb-2">
            Target Meal Category
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMealType(type)}
                className={`py-2 px-3 rounded-2xl text-xs font-bold capitalize transition border ${
                  mealType === type
                    ? "bg-charcoal text-cream border-charcoal shadow-sm"
                    : "bg-cream/60 text-charcoal/70 border-charcoal/10 hover:border-sage"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* AI Query Input */}
        <div className="mt-5">
          <label className="block text-xs font-bold uppercase tracking-wider text-charcoal/60 mb-2">
            Describe what you ate
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleEstimate();
                }
              }}
              placeholder="e.g. 2 medium chapatis with 1 bowl moong dal"
              className="flex-1 px-4 py-3 bg-cream/70 rounded-2xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-sm"
            />
            <button
              type="button"
              onClick={() => handleEstimate()}
              disabled={isEstimating || !query.trim()}
              className="px-5 py-3 bg-sage text-white font-bold rounded-2xl hover:bg-sage-600 transition shadow-soft flex items-center gap-2 text-sm disabled:opacity-60 flex-shrink-0"
            >
              {isEstimating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Estimating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Estimate</span>
                </>
              )}
            </button>
          </div>

          {/* Quick suggestions pills */}
          <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-charcoal/50 mr-1">Suggestions:</span>
            {quickExamples.slice(0, 4).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  handleEstimate(ex);
                }}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-cream hover:bg-mint text-charcoal/75 border border-charcoal/5 transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {estimateError && (
          <div className="mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{estimateError}</span>
          </div>
        )}

        {/* Review & Edit Section (Once Estimated) */}
        {estimateData && (
          <div className="mt-6 pt-5 border-t border-charcoal/10 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                <Check className="w-4 h-4 text-sage" />
                Review & Edit Before Saving
              </span>
              <span className="text-[11px] text-charcoal/50">Estimates are editable</span>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-charcoal/60 mb-1">Food Name</label>
                <input
                  type="text"
                  value={editFoodName}
                  onChange={(e) => setEditFoodName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-sm font-semibold outline-none focus:border-sage"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-charcoal/60 mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-sm font-semibold outline-none focus:border-sage"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-charcoal/60 mb-1">Serving Unit</label>
                <input
                  type="text"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="e.g. piece, bowl, katori"
                  className="w-full px-3 py-2 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-sm font-semibold outline-none focus:border-sage"
                />
              </div>
            </div>

            {/* Calories & Macros Grid */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200/50 text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Calories</span>
                <input
                  type="number"
                  step="0.5"
                  value={editCalories}
                  onChange={(e) => setEditCalories(Number(e.target.value))}
                  className="w-full text-center bg-transparent font-extrabold text-sm text-charcoal outline-none focus:bg-white rounded"
                />
                <span className="text-[10px] text-charcoal/50">kcal</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-200/50 text-center">
                <span className="text-[10px] font-bold text-sky-800 uppercase block">Carbs</span>
                <input
                  type="number"
                  step="0.1"
                  value={editCarbs}
                  onChange={(e) => setEditCarbs(Number(e.target.value))}
                  className="w-full text-center bg-transparent font-extrabold text-sm text-charcoal outline-none focus:bg-white rounded"
                />
                <span className="text-[10px] text-charcoal/50">grams</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-yellow-50 border border-yellow-200/50 text-center">
                <span className="text-[10px] font-bold text-yellow-800 uppercase block">Protein</span>
                <input
                  type="number"
                  step="0.1"
                  value={editProtein}
                  onChange={(e) => setEditProtein(Number(e.target.value))}
                  className="w-full text-center bg-transparent font-extrabold text-sm text-charcoal outline-none focus:bg-white rounded"
                />
                <span className="text-[10px] text-charcoal/50">grams</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200/50 text-center">
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Fat</span>
                <input
                  type="number"
                  step="0.1"
                  value={editFat}
                  onChange={(e) => setEditFat(Number(e.target.value))}
                  className="w-full text-center bg-transparent font-extrabold text-sm text-charcoal outline-none focus:bg-white rounded"
                />
                <span className="text-[10px] text-charcoal/50">grams</span>
              </div>
            </div>

            {/* Assumptions & Uncertainty Box */}
            <div className="p-3.5 rounded-2xl bg-cream/70 border border-charcoal/5 text-xs text-charcoal/75 space-y-1.5">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
                <p>
                  <strong className="text-charcoal">Preparation Assumption:</strong> {estimateData.assumptions}
                </p>
              </div>
              {estimateData.uncertainty_note && (
                <p className="text-[11px] text-charcoal/60 pl-6">
                  {estimateData.uncertainty_note}
                </p>
              )}
            </div>

            {saveError && (
              <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Confirm & Save Button */}
            <button
              type="button"
              onClick={handleSaveToLog}
              disabled={isSaving}
              className="w-full py-3.5 px-4 bg-charcoal text-cream font-bold rounded-2xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 disabled:opacity-75 text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving to Log...</span>
                </>
              ) : (
                <>
                  <span>Save to Today&apos;s {mealType.toUpperCase()} Log</span>
                  <Check className="w-4 h-4 text-sage" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
