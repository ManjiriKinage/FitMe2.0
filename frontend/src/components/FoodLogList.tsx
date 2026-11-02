"use client";

import { useState, useEffect, useId } from "react";
import { FoodLogItem, MealType } from "@/types";
import { api } from "@/lib/api";
import {
  Camera,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Star,
  X,
  Undo2,
  Edit2,
  Loader2,
  Check,
} from "lucide-react";

interface FoodLogListProps {
  meals: Record<MealType, FoodLogItem[]>;
  remainingCalories: number;
  selectedDate?: string;
  onOpenAddFood: (mealType?: MealType) => void;
  onOpenScanMeal?: (mealType?: MealType) => void;
  onDeleteFood: (id: string) => Promise<void>;
  onFoodLogged?: (newItem: FoodLogItem) => void;
}

interface QuickAddChip {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  isFavorite?: boolean;
}

// In-memory cache to eliminate quick-add loading flickers
let memFavorites: any[] | null = null;
let memRecents: any[] | null = null;

export default function FoodLogList({
  meals,
  remainingCalories,
  selectedDate,
  onOpenAddFood,
  onOpenScanMeal,
  onDeleteFood,
  onFoodLogged,
}: FoodLogListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Favorites & Recents state (instant render from memory cache)
  const [favorites, setFavorites] = useState<any[]>(() => memFavorites || []);
  const [recents, setRecents] = useState<any[]>(() => memRecents || []);
  const [loadingQuickAdd, setLoadingQuickAdd] = useState(!memFavorites);
  const [isAddFavoriteModalOpen, setIsAddFavoriteModalOpen] = useState(false);

  // New favorite input fields
  const [newFavName, setNewFavName] = useState("");
  const [newFavCalories, setNewFavCalories] = useState("");
  const [newFavQty, setNewFavQty] = useState("1");
  const [newFavUnit, setNewFavUnit] = useState("serving");
  const [savingFav, setSavingFav] = useState(false);

  // Quick-Add Toast notification with Undo
  const [toastInfo, setToastInfo] = useState<{
    message: string;
    loggedId?: string;
  } | null>(null);

  // Selected chip to choose meal destination
  const [selectedChipForMeal, setSelectedChipForMeal] = useState<QuickAddChip | null>(null);

  // Inline editing state for logged items
  const [editingItem, setEditingItem] = useState<{
    id: string;
    food_name: string;
    quantity: number;
    unit: string;
    calories: number;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Determine current meal slot by time of day
  // before 11 am Breakfast, before 4 pm Lunch, before 7 pm Snacks, otherwise Dinner
  const getCurrentMealByTime = (): MealType => {
    const hour = new Date().getHours();
    if (hour < 11) return "breakfast";
    if (hour < 16) return "lunch";
    if (hour < 19) return "snack";
    return "dinner";
  };

  // Open/Close state per meal, remembered for the current session only
  const [openMeals, setOpenMeals] = useState<Record<MealType, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("fitme_open_meals");
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    const current = getCurrentMealByTime();
    return {
      breakfast: current === "breakfast",
      lunch: current === "lunch",
      dinner: current === "dinner",
      snack: current === "snack",
    };
  });

  const toggleMeal = (key: MealType) => {
    setOpenMeals((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("fitme_open_meals", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // Fetch Favorites and Recents on mount (SWR: silent background update if cached)
  const loadQuickAddData = async () => {
    if (!memFavorites) {
      setLoadingQuickAdd(true);
    }
    try {
      const [favsRes, recsRes] = await Promise.all([
        api.getFavorites().catch(() => []),
        api.getRecentFoods().catch(() => []),
      ]);
      const nextFavs = favsRes || [];
      const nextRecs = recsRes || [];
      memFavorites = nextFavs;
      memRecents = nextRecs;
      setFavorites(nextFavs);
      setRecents(nextRecs);
    } catch (err) {
      console.warn("Could not load favorites or recents:", err);
    } finally {
      setLoadingQuickAdd(false);
    }
  };

  useEffect(() => {
    loadQuickAddData();
  }, []);

  // Quick Add: log to a specific selected meal
  const handleLogToSpecificMeal = async (chip: QuickAddChip, targetMeal: MealType) => {
    setSelectedChipForMeal(null);

    const mealLabel =
      targetMeal === "breakfast"
        ? "Breakfast"
        : targetMeal === "lunch"
        ? "Lunch"
        : targetMeal === "snack"
        ? "Snacks"
        : "Dinner";

    const getLoggedAt = (): string => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (selectedDate && selectedDate < todayStr) {
        const [y, m, d] = selectedDate.split("-").map(Number);
        return new Date(y, m - 1, d, today.getHours(), today.getMinutes(), today.getSeconds()).toISOString();
      }
      return new Date().toISOString();
    };

    try {
      const res = await api.createFoodLog({
        meal_type: targetMeal,
        food_name: chip.name,
        quantity: chip.quantity || 1,
        unit: chip.unit || "serving",
        estimated_calories: chip.calories,
        protein_g: chip.protein || 0,
        carbohydrates_g: chip.carbs || 0,
        fat_g: chip.fat || 0,
        logged_at: getLoggedAt(),
      });

      const loggedId = res.food_log?.id;
      if (onFoodLogged && res.food_log) {
        onFoodLogged(res.food_log);
      }

      // Ensure that meal slot is expanded so user sees the newly added food
      setOpenMeals((prev) => ({ ...prev, [targetMeal]: true }));

      // Show Undo Toast
      setToastInfo({
        message: `Added ${chip.name} to ${mealLabel}`,
        loggedId,
      });

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setToastInfo((prev) => (prev?.loggedId === loggedId ? null : prev));
      }, 5000);
    } catch (err: any) {
      alert("Failed to quick add: " + err.message);
    }
  };

  const handleUndoQuickAdd = async () => {
    if (!toastInfo?.loggedId) return;
    const idToDelete = toastInfo.loggedId;
    setToastInfo(null);
    try {
      await onDeleteFood(idToDelete);
    } catch (err: any) {
      console.error("Undo failed:", err);
    }
  };

  // Save item as favorite
  const handleSaveFavorite = async (item: {
    food_name: string;
    quantity: number;
    unit?: string;
    estimated_calories: number;
    protein_g?: number;
    carbohydrates_g?: number;
    fat_g?: number;
  }) => {
    try {
      const created = await api.addFavorite({
        name: item.food_name,
        quantity: item.quantity,
        unit: item.unit || "serving",
        calories: item.estimated_calories,
        protein: item.protein_g,
        carbs: item.carbohydrates_g,
        fat: item.fat_g,
      });
      setFavorites((prev) => {
        const next = [created, ...prev.slice(0, 9)];
        memFavorites = next;
        return next;
      });
    } catch (err: any) {
      alert("Failed to save favorite: " + err.message);
    }
  };

  const handleDeleteFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteFavorite(id);
      setFavorites((prev) => {
        const next = prev.filter((f) => f.id !== id);
        memFavorites = next;
        return next;
      });
    } catch (err: any) {
      alert("Failed to remove favorite: " + err.message);
    }
  };

  const handleCreateCustomFavorite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFavName.trim() || !newFavCalories) return;
    setSavingFav(true);
    try {
      const created = await api.addFavorite({
        name: newFavName.trim(),
        quantity: parseFloat(newFavQty) || 1,
        unit: newFavUnit.trim() || "serving",
        calories: parseFloat(newFavCalories) || 0,
      });
      setFavorites((prev) => {
        const next = [created, ...prev.slice(0, 9)];
        memFavorites = next;
        return next;
      });
      setIsAddFavoriteModalOpen(false);
      setNewFavName("");
      setNewFavCalories("");
    } catch (err: any) {
      alert("Failed to save custom favorite: " + err.message);
    } finally {
      setSavingFav(false);
    }
  };

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

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSavingEdit(true);
    try {
      await api.updateFoodLog(editingItem.id, {
        quantity: editingItem.quantity,
        unit: editingItem.unit,
        estimated_calories: editingItem.calories,
      });
      setEditingItem(null);
      if (onFoodLogged) onFoodLogged({} as any);
    } catch (err: any) {
      alert("Failed to update portion: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const mealConfigs: {
    key: MealType;
    label: string;
    bgColor: string;
    borderColor: string;
    logButtonText: string;
  }[] = [
    {
      key: "breakfast",
      label: "Breakfast",
      bgColor: "bg-[#eaf4fd]",
      borderColor: "border-[#cfe5f7]",
      logButtonText: "Log breakfast",
    },
    {
      key: "lunch",
      label: "Lunch",
      bgColor: "bg-[#f0f9e4]",
      borderColor: "border-[#dcefc4]",
      logButtonText: "Log lunch",
    },
    {
      key: "dinner",
      label: "Dinner",
      bgColor: "bg-[#fdf3ec]",
      borderColor: "border-[#f6e0d0]",
      logButtonText: "Log dinner",
    },
    {
      key: "snack",
      label: "Snacks",
      bgColor: "bg-[#fef9e5]",
      borderColor: "border-[#f5ebbf]",
      logButtonText: "Log snack",
    },
  ];

  // Prepare Quick Add items: up to 3 favorites first, then recents (excluding duplicates)
  const favoriteChips: QuickAddChip[] = (favorites || []).slice(0, 3).map((f) => ({
    id: f.id,
    name: f.name,
    quantity: f.quantity || 1,
    unit: f.unit || "serving",
    calories: Math.round(f.calories),
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    isFavorite: true,
  }));

  const favNamesLower = new Set(favoriteChips.map((f) => f.name.toLowerCase()));
  const recentChips: QuickAddChip[] = (recents || [])
    .filter((r) => !favNamesLower.has(r.name.toLowerCase()))
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      quantity: r.quantity || 1,
      unit: r.unit || "serving",
      calories: Math.round(r.calories),
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      isFavorite: false,
    }));

  const allChips = [...favoriteChips, ...recentChips];

  // Helper to check if item is favorited
  const isItemFavorited = (foodName: string) =>
    (favorites || []).some((f) => f.name.toLowerCase() === foodName.toLowerCase());

  return (
    <article
      aria-label="Daily Calories and Meals Breakdown"
      className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col gap-4 relative"
    >
      {/* Toast Notification for Quick Add with Undo */}
      {toastInfo && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 bg-[#22332d] text-white py-3 px-5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-[#3d5247]"
        >
          <span className="text-[14px] font-medium">{toastInfo.message}</span>
          <button
            type="button"
            onClick={handleUndoQuickAdd}
            className="flex items-center gap-1 bg-[#7c9a7e] hover:bg-[#6b896d] text-white px-3 py-1 rounded-full text-xs font-bold transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-0">
        <h2 className="text-[18px] font-bold text-[#22332d] m-0">Daily Calories</h2>
        <span className="bg-[#faf7f0] border border-[#eeeeee] rounded-full px-3 py-1 text-xs text-[#22332d] font-semibold">
          Meals breakdown
        </span>
      </div>

      {/* 2. QUICK ADD CARD (dashed border, horizontally scrollable on mobile) */}
      <section
        aria-label="Quick add foods"
        className="rounded-[18px] border border-dashed border-[#dfe6e1] p-3.5 sm:p-4 bg-[#fbfdfc]"
      >
        <div className="text-[11px] tracking-[0.08em] text-[#5b6b64] font-bold uppercase mb-2.5">
          QUICK ADD · favorites and recents
        </div>

        {allChips.length === 0 ? (
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-[13px] text-[#5b6b64]">
              Save foods you eat often for one-tap logging.
            </span>
            <button
              type="button"
              onClick={() => setIsAddFavoriteModalOpen(true)}
              className="text-[12px] font-semibold text-[#5f7d61] hover:text-[#22332d] underline flex-shrink-0"
            >
              + Save favorite
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {allChips.map((chip, idx) => (
              <div
                key={`${chip.name}-${idx}`}
                className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#f6f9f7] text-[#22332d] text-[13px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer shadow-sm group"
                onClick={() => setSelectedChipForMeal(chip)}
              >
                {chip.isFavorite && (
                  <Star className="w-3.5 h-3.5 fill-[#7c9a7e] text-[#7c9a7e] flex-shrink-0" />
                )}
                <span>
                  {chip.name} · {chip.calories}
                </span>

                {chip.isFavorite && chip.id && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteFavorite(chip.id!, e)}
                    aria-label={`Remove ${chip.name} from favorites`}
                    title="Remove from favorites"
                    className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setIsAddFavoriteModalOpen(true)}
              className="inline-flex items-center h-[34px] px-3 rounded-full border border-dashed border-[#7c9a7e] text-[#5f7d61] hover:bg-[#f4f7f5] text-[12px] font-semibold whitespace-nowrap transition-colors flex-shrink-0"
            >
              + Save favorite
            </button>
          </div>
        )}
      </section>

      {/* 1. COLLAPSIBLE MEAL CARDS (Breakfast, Lunch, Dinner, Snacks) */}
      <div className="flex flex-col gap-3">
        {mealConfigs.map(({ key, label, bgColor, borderColor, logButtonText }) => {
          const items = meals[key] || [];
          const mealCalories = Math.round(
            items.reduce((acc, curr) => acc + (curr.estimated_calories || 0), 0)
          );
          const hasItems = items.length > 0;
          const isOpen = openMeals[key] ?? false;

          // One-line preview summary
          let previewText = "No foods logged yet";
          if (items.length === 1) {
            previewText = `1 item · ${items[0].food_name}`;
          } else if (items.length === 2) {
            previewText = `2 items · ${items[0].food_name}, ${items[1].food_name}`;
          } else if (items.length > 2) {
            previewText = `${items.length} items · ${items[0].food_name}, ${items[1].food_name} +${items.length - 2}`;
          }

          const contentId = `meal-content-${key}`;

          return (
            <div
              key={key}
              className={`rounded-[18px] p-3.5 sm:px-4 sm:py-3.5 border ${bgColor} ${borderColor} transition-all`}
            >
              {/* Meal Header Row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <b className="text-[16px] font-bold text-[#22332d]">{label}</b>
                  <span className="text-[13px] text-[#5b6b64] truncate">
                    {previewText}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <b className="text-[15px] sm:text-[16px] font-bold text-[#22332d]">
                    {mealCalories} kcal
                  </b>

                  {/* If collapsed with no items, keep Log button visible */}
                  {!hasItems && (
                    <button
                      type="button"
                      onClick={() => onOpenAddFood(key)}
                      className="h-[34px] px-3.5 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] font-semibold text-[13px] transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
                    >
                      {logButtonText}
                    </button>
                  )}

                  {/* Expand/Collapse Chevron Button */}
                  <button
                    type="button"
                    onClick={() => toggleMeal(key)}
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${label}`}
                    className="w-[34px] h-[34px] rounded-full border border-[#dfe6e1] bg-white hover:bg-[#f6f9f7] text-[#22332d] flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-[#7c9a7e]"
                  >
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#5b6b64]" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#5b6b64]" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Content Area */}
              <div
                id={contentId}
                className={`overflow-hidden transition-all duration-200 motion-reduce:transition-none ${
                  isOpen ? "max-h-[1200px] opacity-100 mt-3 pt-2 border-t border-black/5" : "max-h-0 opacity-0"
                }`}
              >
                {/* Actions row in expanded view */}
                <div className="flex items-center justify-between pb-2">
                  <span className="text-[12px] font-semibold text-[#5b6b64] uppercase tracking-wider">
                    Logged items ({items.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {onOpenScanMeal && (
                      <button
                        type="button"
                        onClick={() => onOpenScanMeal(key)}
                        aria-label={`Scan ${label}`}
                        className="h-8 px-3 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenAddFood(key)}
                      aria-label={`Add food to ${label}`}
                      className="h-8 px-3 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add food</span>
                    </button>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="bg-white/60 rounded-xl p-3 text-center text-xs text-[#5b6b64]">
                    No foods logged yet for {label.toLowerCase()}. Tap &quot;Add food&quot; or &quot;Scan&quot; to log.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const favorited = isItemFavorited(item.food_name);
                      return (
                        <div
                          key={item.id}
                          className="bg-white rounded-[14px] px-3.5 py-2.5 flex justify-between items-center shadow-sm border border-[#e6ebe7]/60"
                        >
                          <div className="min-w-0 pr-3">
                            <b className="text-[14px] font-bold text-[#22332d] block truncate">
                              {item.food_name}
                            </b>
                            <div className="text-[12px] text-[#5b6b64] mt-0.5">
                              {item.quantity} {item.unit} · P {Number(item.protein_g).toFixed(1)}g · C{" "}
                              {Number(item.carbohydrates_g).toFixed(1)}g · F{" "}
                              {Number(item.fat_g).toFixed(1)}g
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <b className="text-[14px] font-bold text-[#22332d]">
                              {Math.round(item.estimated_calories)} kcal
                            </b>

                            {/* Save/Favorite star button */}
                            <button
                              type="button"
                              onClick={() => handleSaveFavorite(item)}
                              title={favorited ? "Favorited" : "Save as favorite"}
                              aria-label={favorited ? "Favorited" : "Save as favorite"}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                                favorited
                                  ? "text-[#7c9a7e] hover:bg-[#eaf1ec]"
                                  : "text-[#5b6b64] hover:text-[#7c9a7e] hover:bg-[#f4f7f5]"
                              }`}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${favorited ? "fill-[#7c9a7e]" : ""}`}
                              />
                            </button>

                            {/* Edit portion button */}
                            <button
                              type="button"
                              onClick={() =>
                                setEditingItem({
                                  id: item.id,
                                  food_name: item.food_name,
                                  quantity: item.quantity,
                                  unit: item.unit,
                                  calories: Math.round(item.estimated_calories),
                                })
                              }
                              title="Edit portion"
                              aria-label={`Edit ${item.food_name}`}
                              className="h-7 px-2.5 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#f6f9f7] text-[#22332d] text-xs font-semibold transition-colors flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3 text-[#5b6b64]" />
                              <span>Edit</span>
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={(e) => handleDelete(item.id, e)}
                              disabled={deletingId === item.id}
                              aria-label={`Delete ${item.food_name}`}
                              className="w-7 h-7 rounded-full text-[#5b6b64] hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Remaining Calories Footer */}
      <div className="border-t border-[#eef1ee] pt-3 flex items-center gap-2 text-[14px]">
        <span className="text-[13px] text-[#5b6b64]">Remaining:</span>
        <b className="text-[17px] font-bold text-[#22332d]">
          {Math.max(0, Math.round(remainingCalories))} kcal
        </b>
      </div>

      {/* Modal: Save New Favorite Food */}
      {isAddFavoriteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-2xl border border-[#dfe6e1]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#22332d]">Save Favorite Food</h3>
              <button
                type="button"
                onClick={() => setIsAddFavoriteModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#5b6b64] hover:bg-[#f4f7f5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomFavorite} className="flex flex-col gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#3a4a43]">Food Name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice + dal"
                  value={newFavName}
                  onChange={(e) => setNewFavName(e.target.value)}
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#3a4a43]">Calories (kcal)</span>
                  <input
                    type="number"
                    required
                    placeholder="506"
                    value={newFavCalories}
                    onChange={(e) => setNewFavCalories(e.target.value)}
                    className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#3a4a43]">Portion / Unit</span>
                  <input
                    type="text"
                    value={newFavUnit}
                    onChange={(e) => setNewFavUnit(e.target.value)}
                    placeholder="bowl / serving"
                    className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                  />
                </label>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddFavoriteModalOpen(false)}
                  className="flex-1 h-10 rounded-full border border-[#dfe6e1] text-sm font-semibold text-[#22332d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFav}
                  className="flex-1 h-10 rounded-full bg-[#22332d] hover:bg-[#182420] text-white text-sm font-semibold flex items-center justify-center"
                >
                  {savingFav ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Favorite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Logged Food Portion */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-2xl border border-[#dfe6e1]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-[#22332d]">
                Edit {editingItem.food_name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#5b6b64] hover:bg-[#f4f7f5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#3a4a43]">Quantity</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={editingItem.quantity}
                  onChange={(e) =>
                    setEditingItem((prev) =>
                      prev ? { ...prev, quantity: parseFloat(e.target.value) || 1 } : null
                    )
                  }
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3a4a43]">Unit</span>
                <input
                  type="text"
                  value={editingItem.unit}
                  onChange={(e) =>
                    setEditingItem((prev) =>
                      prev ? { ...prev, unit: e.target.value } : null
                    )
                  }
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3a4a43]">Calories (kcal)</span>
                <input
                  type="number"
                  value={editingItem.calories}
                  onChange={(e) =>
                    setEditingItem((prev) =>
                      prev ? { ...prev, calories: parseInt(e.target.value, 10) || 0 } : null
                    )
                  }
                  className="w-full h-10 mt-1 px-3 rounded-xl border border-[#dfe6e1] text-sm"
                />
              </label>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 h-10 rounded-full border border-[#dfe6e1] text-sm font-semibold text-[#22332d]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={handleSaveEdit}
                  className="flex-1 h-10 rounded-full bg-[#22332d] hover:bg-[#182420] text-white text-sm font-semibold flex items-center justify-center"
                >
                  {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Choose which meal to add favorite/recent item into */}
      {selectedChipForMeal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-2xl border border-[#dfe6e1]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-bold text-[#22332d]">
                Add to which meal?
              </h3>
              <button
                type="button"
                onClick={() => setSelectedChipForMeal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#5b6b64] hover:bg-[#f4f7f5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-[#5b6b64] mb-4">
              Select where to log <b className="text-[#22332d]">{selectedChipForMeal.name}</b> ({selectedChipForMeal.calories} kcal):
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { key: "breakfast", label: "Breakfast" },
                { key: "lunch", label: "Lunch" },
                { key: "dinner", label: "Dinner" },
                { key: "snack", label: "Snack" },
              ].map((m) => {
                const isCurrentTime = m.key === getCurrentMealByTime();
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() =>
                      handleLogToSpecificMeal(
                        selectedChipForMeal,
                        m.key as MealType
                      )
                    }
                    className={`py-3 px-3 rounded-[14px] text-center font-semibold text-[14px] transition-all border ${
                      isCurrentTime
                        ? "bg-[#22332d] text-white border-[#22332d] shadow-sm"
                        : "bg-white text-[#22332d] border-[#dfe6e1] hover:bg-[#f6f9f7]"
                    }`}
                  >
                    {m.label}
                    {isCurrentTime && (
                      <small className="block text-[10px] font-normal text-white/80 mt-0.5">
                        Current time
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
