"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { MealType, AIEstimateResponse, FoodLogItem, ParsedFoodItem, RecipeSearchResult, DashboardSummary } from "@/types";
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
  AlertTriangle,
  Camera,
  Search,
} from "lucide-react";

interface FoodLogFormProps {
  initialMealType?: MealType;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem, dailySummary?: DashboardSummary | null) => void;
  onSwitchToScan?: () => void;
}

const roundOne = (val: number): number => Math.round(val * 10) / 10;

export default function FoodLogForm({
  initialMealType = "breakfast",
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
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Review & Edit Editable State
  const [estimateData, setEstimateData] = useState<AIEstimateResponse | null>(null);
  const [editFoodName, setEditFoodName] = useState("");
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editUnit, setEditUnit] = useState("");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  // Base nutrition reference for zero-AI local recalculation
  const baseMacroRef = useRef<{ qty: number; calories: number; carbs: number; protein: number; fat: number } | null>(null);

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

  // Outside click listener to dismiss search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
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

  // Debounced live search with request aborting and query caching
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setHighlightIndex(-1);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const results = await api.searchFoods(trimmed, 6, abortControllerRef.current.signal);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  // Instant selection of verified food catalog item with zero AI calls
  const handleSelectSuggestion = (item: RecipeSearchResult) => {
    setShowSuggestions(false);
    setQuery(`1 ${item.reported_serving_unit} ${item.name}`);

    const cals = item.serving_energy_kcal != null
      ? Math.round(item.serving_energy_kcal)
      : Math.round((item.reported_energy_kcal_per_100g * item.reported_serving_size_g) / 100);
    const p = roundOne(((item.reported_protein_g_per_100g || 0) * item.reported_serving_size_g) / 100);
    const c = roundOne(((item.reported_carbohydrates_g_per_100g || 0) * item.reported_serving_size_g) / 100);
    const f = roundOne(((item.reported_fat_g_per_100g || 0) * item.reported_serving_size_g) / 100);

    setEditFoodName(item.name);
    setEditQuantity(1);
    setEditUnit(item.reported_serving_unit || "serving");
    setEditCalories(cals);
    setEditProtein(p);
    setEditCarbs(c);
    setEditFat(f);

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
        }
      ]
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
      // Pre-fill editable inputs with estimates
      setEditFoodName(res.food_name);
      setEditQuantity(res.quantity);
      setEditUnit(res.unit);
      setEditCalories(res.estimated_calories);
      setEditProtein(res.protein_g);
      setEditCarbs(res.carbohydrates_g);
      setEditFat(res.fat_g);

      baseMacroRef.current = {
        qty: res.quantity > 0 ? res.quantity : 1,
        calories: res.estimated_calories,
        carbs: res.carbohydrates_g,
        protein: res.protein_g,
        fat: res.fat_g,
      };
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
        try {
          const batchRes = await api.confirmMeal({
            meal_type: mealType,
            logged_at: new Date().toISOString(),
            items: estimateData.items.map((it) => ({
              food_name: (it.food_name || "Food Item").trim(),
              quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
              unit: (it.unit || "serving").trim(),
              estimated_calories: Number(it.estimated_calories) >= 0 ? Number(it.estimated_calories) : 0,
              protein_g: Number(it.protein_g) >= 0 ? Number(it.protein_g) : 0,
              carbohydrates_g: Number(it.carbohydrates_g) >= 0 ? Number(it.carbohydrates_g) : 0,
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
        } catch (batchErr) {
          console.warn("Batch confirmation failed, falling back to consolidated single entry:", batchErr);
          // Fallback: Save as a consolidated meal entry so user data is never lost
          const savedFallback = await api.createFoodLog({
            food_name: editFoodName.trim(),
            quantity: Number(editQuantity) > 0 ? Number(editQuantity) : 1,
            unit: editUnit.trim() || "meal",
            estimated_calories: Number(editCalories) >= 0 ? Number(editCalories) : 0,
            protein_g: Number(editProtein) >= 0 ? Number(editProtein) : 0,
            carbohydrates_g: Number(editCarbs) >= 0 ? Number(editCarbs) : 0,
            fat_g: Number(editFat) >= 0 ? Number(editFat) : 0,
            meal_type: mealType,
            logged_at: new Date().toISOString(),
          });
          onSuccess(savedFallback.saved_log || savedFallback.food_log, savedFallback.daily_summary);
        }
      } else {
        // Single item save with server-calculated daily summary
        const res = await api.createFoodLog({
          food_name: editFoodName.trim(),
          quantity: Number(editQuantity) > 0 ? Number(editQuantity) : 1,
          unit: editUnit.trim() || "serving",
          estimated_calories: Number(editCalories) >= 0 ? Number(editCalories) : 0,
          protein_g: Number(editProtein) >= 0 ? Number(editProtein) : 0,
          carbohydrates_g: Number(editCarbs) >= 0 ? Number(editCarbs) : 0,
          fat_g: Number(editFat) >= 0 ? Number(editFat) : 0,
          meal_type: mealType,
          logged_at: new Date().toISOString(),
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
      } else if (Array.isArray(err?.detail)) {
        errorMsg = err.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join("; ");
      } else if (typeof err === "string") {
        errorMsg = err;
      }
      setSaveError(errorMsg);
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

          <div className="flex items-center gap-2">
            {onSwitchToScan && (
              <button
                type="button"
                onClick={onSwitchToScan}
                className="px-2.5 py-1.5 rounded-xl bg-mint hover:bg-mint/70 text-sage text-xs font-bold transition flex items-center gap-1.5"
                title="Switch to Camera Plate Scanner"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Scan Plate</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-cream hover:bg-cream-soft flex items-center justify-center text-charcoal/60 hover:text-charcoal transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
            <div ref={searchContainerRef} className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (showSuggestions && suggestions.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
                          return;
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
                          return;
                        } else if (e.key === "Enter" && highlightIndex >= 0) {
                          e.preventDefault();
                          handleSelectSuggestion(suggestions[highlightIndex]);
                          return;
                        } else if (e.key === "Escape") {
                          setShowSuggestions(false);
                          return;
                        }
                      }

                      if (e.key === "Enter") {
                        e.preventDefault();
                        setShowSuggestions(false);
                        handleEstimate();
                      }
                    }}
                    placeholder="e.g. roti, dal, rice, or 2 medium chapatis"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-cream/70 rounded-xl border border-charcoal/10 focus:border-sage focus:ring-2 focus:ring-sage/20 outline-none text-charcoal text-xs shadow-xs"
                  />
                  <Search className="w-4 h-4 text-charcoal/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {isSearching && (
                    <Loader2 className="w-3.5 h-3.5 text-sage animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowSuggestions(false);
                    handleEstimate();
                  }}
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

              {/* Live Search Autocomplete Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-mint overflow-hidden z-30 animate-fade-in divide-y divide-charcoal/5">
                  <div className="px-3 py-1.5 bg-cream/60 flex items-center justify-between text-[10px] text-charcoal/60 font-semibold uppercase tracking-wider">
                    <span>Verified Catalog Matches ({suggestions.length})</span>
                    <span>Instant • Zero AI</span>
                  </div>
                  {suggestions.map((item, idx) => (
                    <button
                      key={item.source_recipe_code || idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between transition ${
                        highlightIndex === idx ? "bg-mint/60 text-charcoal" : "hover:bg-cream/50 text-charcoal"
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-xs font-bold text-charcoal truncate">{item.name}</p>
                        <p className="text-[10px] text-charcoal/60 truncate">
                          {item.reported_serving_size_g}g per {item.reported_serving_unit} • {roundOne(item.reported_energy_kcal_per_100g)} kcal/100g
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[11px] font-black text-sage bg-sage/10 px-2 py-0.5 rounded-lg">
                          {item.serving_energy_kcal != null
                            ? Math.round(item.serving_energy_kcal)
                            : Math.round((item.reported_energy_kcal_per_100g * item.reported_serving_size_g) / 100)}{" "}
                          kcal
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
                    onChange={(e) => handleQuantityChange(Number(e.target.value))}
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
