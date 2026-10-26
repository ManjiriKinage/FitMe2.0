"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MealType, AIEstimateResponse, FoodLogItem, ParsedFoodItem } from "@/types";
import {
  X,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  HelpCircle,
  Info,
  Flame,
  ArrowRight,
  Layers,
  AlertTriangle
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

  // Quick suggestions for rapid testing
  const quickExamples = [
    "2 medium chapatis",
    "2 big bajra bhakri",
    "1 bowl rice",
    "1 bowl dal",
    "1 plate poha",
    "2 medium chapatis and 1 bowl dal"
  ];

  const handleEstimate = async (searchQuery?: string) => {
    const text = searchQuery || query;
    if (!text.trim()) return;

    setIsEstimating(true);
    setEstimateError(null);

    try {
      const res = await api.estimateFood(text.trim());
      setEstimateData(res);
      // Pre-fill editable inputs with estimates
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
      // If we have a multi-item compound meal breakdown, use the batch confirmation endpoint
      if (estimateData?.items && estimateData.items.length > 1) {
        const batchRes = await api.confirmMeal({
          meal_type: mealType,
          items: estimateData.items.map((it) => ({
            food_name: it.food_name,
            quantity: it.quantity,
            unit: it.unit,
            estimated_calories: it.estimated_calories,
            protein_g: it.protein_g,
            carbohydrates_g: it.carbohydrates_g,
            fat_g: it.fat_g,
            meal_type: mealType,
            food_id: it.food_id || null,
            profile_id: it.profile_id || null,
          })),
        });

        if (batchRes.saved_logs.length > 0) {
          onSuccess(batchRes.saved_logs[0]);
        }
      } else {
        // Single item save
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
      }

      onClose();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save food entry. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const hasMultipleItems = Boolean(estimateData?.items && estimateData.items.length > 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-xl rounded-3xl sm:rounded-4xl shadow-2xl border border-mint flex flex-col max-h-[88vh] overflow-hidden">
        {/* Pinned Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-charcoal/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-mint flex items-center justify-center text-sage">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-charcoal tracking-tight">AI Food Estimator</h3>
              <p className="text-[11px] text-charcoal/60">Deterministic INDB Nutrition + AI Fallback</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-cream hover:bg-cream-soft flex items-center justify-center text-charcoal/60 hover:text-charcoal transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* Target Meal Category */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal/60 mb-1.5">
              Meal Category
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-bold capitalize transition border ${
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
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-charcoal/60 mb-1.5">
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
                placeholder="e.g. 2 medium chapatis, 2 big bajra bhakri, or 1 bowl rice"
                className="flex-1 px-3.5 py-2.5 bg-cream/70 rounded-xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-xs"
              />
              <button
                type="button"
                onClick={() => handleEstimate()}
                disabled={isEstimating || !query.trim()}
                className="px-4 py-2.5 bg-sage text-white font-bold rounded-xl hover:bg-sage-600 transition shadow-soft flex items-center gap-1.5 text-xs disabled:opacity-60 flex-shrink-0"
              >
                {isEstimating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Estimating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Estimate</span>
                  </>
                )}
              </button>
            </div>

            {/* User guidance tip */}
            <p className="text-[10px] text-charcoal/60 mt-1.5 flex items-center gap-1">
              <span className="font-bold text-sage">💡 Tip:</span>
              <span>Include portion & size (e.g. <em>medium chapati</em>, <em>big bajra bhakri</em>, <em>1 bowl rice</em>) for precise nutrition.</span>
            </p>

            {/* Quick suggestions pills */}
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-charcoal/50 mr-0.5 font-medium">Quick examples:</span>
              {quickExamples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    handleEstimate(ex);
                  }}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cream hover:bg-mint text-charcoal/80 border border-charcoal/10 hover:border-sage/40 transition shadow-xs"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {estimateError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{estimateError}</span>
            </div>
          )}

          {/* Clarification prompt if ambiguous */}
          {estimateData?.clarification_question && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Quick Clarification:</strong>
                <span>{estimateData.clarification_question}</span>
              </div>
            </div>
          )}

          {/* Multi-Item Breakdown Display */}
          {hasMultipleItems && estimateData?.items && (
            <div className="space-y-2 pt-2 border-t border-charcoal/10">
              <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sage" />
                Individual Dish Breakdown ({estimateData.items.length} items)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {estimateData.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-cream/50 border border-charcoal/5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-charcoal">{item.food_name}</p>
                      <p className="text-[10px] text-charcoal/50">
                        {item.quantity} {item.unit}
                        {item.serving_weight_g ? ` (${item.serving_weight_g}g)` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-black text-sage">
                      {Math.round(item.estimated_calories)} kcal
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review & Edit Section */}
          {estimateData && (
            <div className="pt-3 border-t border-charcoal/10 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-sage" />
                  {hasMultipleItems ? "Total Summary" : "Review & Edit Before Saving"}
                </span>
                <div className="flex items-center gap-2">
                  {estimateData.validation_status === "needs_review" ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-700" /> Needs Review
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ✓ Verified
                    </span>
                  )}
                  <span className="text-[10px] text-charcoal/50">Inputs are editable</span>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-charcoal/60 mb-0.5">Food Title</label>
                  <input
                    type="text"
                    value={editFoodName}
                    onChange={(e) => setEditFoodName(e.target.value)}
                    className="w-full px-3 py-2 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-xs font-semibold outline-none focus:border-sage"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-charcoal/60 mb-0.5">Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-xs font-semibold outline-none focus:border-sage"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-charcoal/60 mb-0.5">Serving Unit</label>
                  <input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    placeholder="e.g. piece, bowl, katori"
                    className="w-full px-3 py-1.5 bg-cream/50 rounded-xl border border-charcoal/10 text-charcoal text-xs font-semibold outline-none focus:border-sage"
                  />
                </div>
              </div>

              {/* Calories & Macros Grid */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200/50 text-center">
                  <span className="text-[9px] font-bold text-amber-800 uppercase block">Calories</span>
                  <input
                    type="number"
                    step="0.5"
                    value={editCalories}
                    onChange={(e) => setEditCalories(Number(e.target.value))}
                    className="w-full text-center bg-transparent font-extrabold text-xs text-charcoal outline-none focus:bg-white rounded"
                  />
                  <span className="text-[9px] text-charcoal/50">kcal</span>
                </div>

                <div className="p-2 rounded-xl bg-sky-50 border border-sky-200/50 text-center">
                  <span className="text-[9px] font-bold text-sky-800 uppercase block">Carbs</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editCarbs}
                    onChange={(e) => setEditCarbs(Number(e.target.value))}
                    className="w-full text-center bg-transparent font-extrabold text-xs text-charcoal outline-none focus:bg-white rounded"
                  />
                  <span className="text-[9px] text-charcoal/50">grams</span>
                </div>

                <div className="p-2 rounded-xl bg-yellow-50 border border-yellow-200/50 text-center">
                  <span className="text-[9px] font-bold text-yellow-800 uppercase block">Protein</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editProtein}
                    onChange={(e) => setEditProtein(Number(e.target.value))}
                    className="w-full text-center bg-transparent font-extrabold text-xs text-charcoal outline-none focus:bg-white rounded"
                  />
                  <span className="text-[9px] text-charcoal/50">grams</span>
                </div>

                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200/50 text-center">
                  <span className="text-[9px] font-bold text-emerald-800 uppercase block">Fat</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editFat}
                    onChange={(e) => setEditFat(Number(e.target.value))}
                    className="w-full text-center bg-transparent font-extrabold text-xs text-charcoal outline-none focus:bg-white rounded"
                  />
                  <span className="text-[9px] text-charcoal/50">grams</span>
                </div>
              </div>

              {/* Assumptions & Uncertainty Box */}
              {estimateData.validation_status === "needs_review" || estimateData.uncertainty_note?.includes("NEEDS REVIEW") || estimateData.uncertainty_note?.includes("FLAGGED") ? (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                    <span>⚠️ Uncalibrated Dish (Pending Culinary Review)</span>
                  </div>
                  <p className="text-[10px] text-amber-800 leading-relaxed pl-5">
                    {estimateData.uncertainty_note || "This recipe contains an unverified frying-oil medium or uncalibrated macronutrients. Nutrition values are pending culinary review and should be adjusted manually if needed."}
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-cream/70 border border-charcoal/5 text-[11px] text-charcoal/75 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-sage flex-shrink-0 mt-0.5" />
                    <p>
                      <strong className="text-charcoal">Preparation Assumption:</strong> {estimateData.assumptions}
                    </p>
                  </div>
                  {estimateData.uncertainty_note && (
                    <p className="text-[10px] text-charcoal/60 pl-5">
                      {estimateData.uncertainty_note}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div className="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Pinned Modal Action Footer - ALWAYS VISIBLE WITHOUT SCROLLING! */}
        <div className="p-3 sm:p-4 bg-cream/40 border-t border-charcoal/10 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-charcoal/15 text-charcoal/70 hover:text-charcoal hover:bg-cream text-xs font-semibold transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSaveToLog}
            disabled={isSaving || !estimateData}
            className="flex-1 py-2.5 px-4 bg-charcoal text-cream font-bold rounded-xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 disabled:opacity-50 text-xs"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving to Log...</span>
              </>
            ) : (
              <>
                <span>
                  {hasMultipleItems
                    ? `Confirm & Save All Items (${Math.round(editCalories)} kcal)`
                    : `Save to ${mealType.toUpperCase()} Log (${Math.round(editCalories)} kcal)`}
                </span>
                <Check className="w-3.5 h-3.5 text-sage" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
