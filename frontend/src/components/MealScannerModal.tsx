"use client";

import React, { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  MealType,
  MealImageAnalysisResponse,
  FoodLogItem,
  ConfirmedFoodItem,
  DashboardSummary,
} from "@/types";
import {
  Camera,
  Upload,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  ImageIcon,
} from "lucide-react";

interface MealScannerModalProps {
  initialMealType?: MealType;
  selectedDate?: string;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem, dailySummary?: DashboardSummary | null) => void;
}

interface EditableItem {
  id: string;
  food_name: string;
  canonical_name?: string | null;
  aliases?: string[];
  category?: string;
  quantity: number;
  unit: string;
  estimated_weight_g: number;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  fiber_g?: number | null;
  preparation: string;
  food_id?: string | null;
  profile_id?: string | null;
  confidence?: string;
  assumptions?: string[];
  uncertainty?: string | null;
  clarification_needed?: string | null;
  serving_description?: string | null;
  was_edited?: boolean;
  was_added?: boolean;
}

const PREPARATION_OPTIONS = [
  { value: "cooked", label: "Cooked / Curry" },
  { value: "steamed", label: "Steamed" },
  { value: "roasted", label: "Roasted" },
  { value: "shallow_fried", label: "Shallow Fried" },
  { value: "deep_fried", label: "Deep Fried" },
  { value: "raw", label: "Raw / Fresh" },
];

const QUICK_ADD_PRESETS = [
  { name: "Butter Naan", qty: 2, unit: "piece", grams: 120, prep: "Roasted" },
  { name: "Paneer Butter Masala", qty: 1, unit: "bowl", grams: 250, prep: "Curry" },
  { name: "Onion and Lime Salad", qty: 1, unit: "serving", grams: 30, prep: "Raw" },
  { name: "Cooked White Rice", qty: 1, unit: "bowl", grams: 150, prep: "Steamed" },
  { name: "Dal Tadka", qty: 1, unit: "bowl", grams: 150, prep: "Cooked" },
];

const roundOne = (val: number): number => Math.round(val * 10) / 10;

export default function MealScannerModal({
  initialMealType = "lunch",
  selectedDate,
  onClose,
  onSuccess,
}: MealScannerModalProps) {
  // Inputs & Selection State
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [compressedMime, setCompressedMime] = useState<string>("image/jpeg");
  const [imageMetadata, setImageMetadata] = useState<{
    width: number;
    height: number;
    sizeKb: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Workflow Stages: 'capture' | 'analyzing' | 'review'
  const [stage, setStage] = useState<"capture" | "analyzing" | "review">("capture");
  const [analysisProgress, setAnalysisProgress] = useState<string>("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Review Stage State
  const [analysisResult, setAnalysisResult] =
    useState<MealImageAnalysisResponse | null>(null);
  const [items, setItems] = useState<EditableItem[]>([
    {
      id: "item-1",
      food_name: "Butter Naan",
      quantity: 2,
      unit: "piece",
      estimated_weight_g: 120,
      estimated_calories: 372,
      protein_g: 10.2,
      carbohydrates_g: 57.6,
      fat_g: 10.8,
      preparation: "Roasted",
    },
    {
      id: "item-2",
      food_name: "Paneer Butter Masala",
      quantity: 1,
      unit: "bowl",
      estimated_weight_g: 250,
      estimated_calories: 525,
      protein_g: 15.8,
      carbohydrates_g: 17.0,
      fat_g: 43.8,
      preparation: "Curry",
    },
    {
      id: "item-3",
      food_name: "Onion and Lime Salad",
      quantity: 1,
      unit: "serving",
      estimated_weight_g: 30,
      estimated_calories: 13,
      protein_g: 0.3,
      carbohydrates_g: 2.8,
      fat_g: 0,
      preparation: "Raw",
    },
  ]);
  const [deletedItemNames, setDeletedItemNames] = useState<string[]>([]);
  const [allowTrainingConsent, setAllowTrainingConsent] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 1. Client-Side Image Resizing & WebP/JPEG Compression (Max 1280px)
  const processAndCompressImage = useCallback((file: File) => {
    setAnalysisError(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAnalysisError("Unsupported file type. Please upload a JPEG, PNG, or WebP photo.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setAnalysisError("Image file is too large (max 15MB). Please choose a smaller photo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1280;
        let { width, height } = img;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          setAnalysisError("Could not initialize image processing context.");
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let mime = "image/webp";
        let dataUrl = canvas.toDataURL(mime, 0.85);
        if (!dataUrl.startsWith("data:image/webp")) {
          mime = "image/jpeg";
          dataUrl = canvas.toDataURL(mime, 0.85);
        }

        const base64Data = dataUrl.split(",")[1];
        const approxSizeKb = Math.round((base64Data.length * 3) / 4 / 1024);

        setImageFile(file);
        setImagePreviewUrl(dataUrl);
        setCompressedBase64(base64Data);
        setCompressedMime(mime);
        setImageMetadata({ width, height, sizeKb: approxSizeKb });
        setStage("capture");
      };
      img.onerror = () => {
        setAnalysisError("Failed to decode image. Please try a different photo.");
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAndCompressImage(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processAndCompressImage(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    setCompressedBase64(null);
    setImageMetadata(null);
    setAnalysisError(null);
    setStage("capture");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  // 2. Submit Image for AI Plate Analysis
  const handleAnalyzeMeal = async () => {
    if (!compressedBase64) {
      setAnalysisError("Please select or capture a meal photo first.");
      return;
    }

    setStage("analyzing");
    setAnalysisError(null);
    setAnalysisProgress("Detecting dishes, estimating visual portions & matching nutrition...");

    try {
      const res = await api.analyzeMealImage({
        image_base64: compressedBase64,
        mime_type: compressedMime,
        meal_type: mealType,
        allow_training_consent: allowTrainingConsent,
      });

      setAnalysisResult(res);

      const initialItems: EditableItem[] = (res.foods || []).map((f, idx) => ({
        id: f.id || `item-${idx}-${Date.now()}`,
        food_name: f.name,
        canonical_name: f.canonical_name || f.name,
        aliases: f.aliases || [],
        category: f.category || "general",
        quantity: f.serving_quantity || 1.0,
        unit: f.serving_unit || "serving",
        estimated_weight_g: f.estimated_weight_g || 100,
        estimated_calories: f.estimated_calories || 0,
        protein_g: f.protein_g || 0,
        carbohydrates_g: f.carbohydrates_g || 0,
        fat_g: f.fat_g || 0,
        fiber_g: f.fiber_g || null,
        preparation: f.preparation || "cooked",
        food_id: f.food_id || null,
        profile_id: f.profile_id || null,
        confidence: f.confidence || "medium",
        assumptions: f.assumptions || [],
        uncertainty: f.uncertainty || null,
        clarification_needed: f.clarification_needed || null,
        serving_description: f.serving_description || null,
        was_edited: false,
        was_added: false,
      }));

      setItems(initialItems);
      setDeletedItemNames([]);
      setStage("review");
    } catch (err: any) {
      setStage("capture");
      setAnalysisError(
        err.message || "Failed to analyze meal image. Please try again or retake the photo."
      );
    }
  };

  // 3. Portion & Field Modification with Zero-AI Local Recalculation
  const handleItemFieldChange = (
    id: string,
    field: "food_name" | "quantity" | "unit" | "estimated_weight_g" | "preparation",
    value: string | number
  ) => {
    const targetItem = items.find((it) => it.id === id);
    if (!targetItem) return;

    let updatedQuantity = targetItem.quantity;
    let updatedWeight = targetItem.estimated_weight_g;
    let updatedCalories = targetItem.estimated_calories;
    let updatedProtein = targetItem.protein_g;
    let updatedCarbs = targetItem.carbohydrates_g;
    let updatedFat = targetItem.fat_g;

    if (field === "quantity") {
      const newQty = Math.max(0.1, Number(value) || 0.1);
      const ratio = targetItem.quantity > 0 ? newQty / targetItem.quantity : 1;
      updatedQuantity = newQty;
      updatedWeight = Math.round(targetItem.estimated_weight_g * ratio);
      updatedCalories = roundOne(targetItem.estimated_calories * ratio);
      updatedProtein = roundOne(targetItem.protein_g * ratio);
      updatedCarbs = roundOne(targetItem.carbohydrates_g * ratio);
      updatedFat = roundOne(targetItem.fat_g * ratio);
    } else if (field === "estimated_weight_g") {
      const newGrams = Math.max(1, Number(value) || 1);
      const ratio = targetItem.estimated_weight_g > 0 ? newGrams / targetItem.estimated_weight_g : 1;
      updatedWeight = newGrams;
      updatedCalories = roundOne(targetItem.estimated_calories * ratio);
      updatedProtein = roundOne(targetItem.protein_g * ratio);
      updatedCarbs = roundOne(targetItem.carbohydrates_g * ratio);
      updatedFat = roundOne(targetItem.fat_g * ratio);
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              [field]: value,
              quantity: updatedQuantity,
              estimated_weight_g: updatedWeight,
              estimated_calories: updatedCalories,
              protein_g: updatedProtein,
              carbohydrates_g: updatedCarbs,
              fat_g: updatedFat,
              was_edited: true,
            }
          : it
      )
    );
  };

  const handleRemoveItem = (id: string) => {
    const itemToRemove = items.find((it) => it.id === id);
    if (itemToRemove) {
      setDeletedItemNames((prev) => [...prev, itemToRemove.food_name]);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddPreset = (preset: {
    name: string;
    qty: number;
    unit: string;
    grams: number;
    prep: string;
  }) => {
    const newItemId = `custom-${Date.now()}`;
    const newItem: EditableItem = {
      id: newItemId,
      food_name: preset.name,
      quantity: preset.qty,
      unit: preset.unit,
      estimated_weight_g: preset.grams,
      estimated_calories: Math.round(preset.grams * 2.0),
      protein_g: roundOne(preset.grams * 0.08),
      carbohydrates_g: roundOne(preset.grams * 0.35),
      fat_g: roundOne(preset.grams * 0.04),
      preparation: preset.prep,
      confidence: "high",
      was_edited: true,
      was_added: true,
    };
    setItems((prev) => [...prev, newItem]);
    setShowQuickAdd(false);
  };

  const handleAddCustomDish = () => {
    const newItemId = `custom-${Date.now()}`;
    const newItem: EditableItem = {
      id: newItemId,
      food_name: "New Dish",
      quantity: 1,
      unit: "serving",
      estimated_weight_g: 100,
      estimated_calories: 150,
      protein_g: 5,
      carbohydrates_g: 20,
      fat_g: 5,
      preparation: "Cooked",
      confidence: "high",
      was_edited: true,
      was_added: true,
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Compute aggregate macros
  const totalCalories = items.reduce(
    (acc, it) => acc + (it.estimated_calories || 0),
    0
  );
  const totalProtein = items.reduce((acc, it) => acc + (it.protein_g || 0), 0);
  const totalCarbs = items.reduce((acc, it) => acc + (it.carbohydrates_g || 0), 0);
  const totalFat = items.reduce((acc, it) => acc + (it.fat_g || 0), 0);

  // Confirm & Save
  const handleConfirmAndSave = async () => {
    if (items.length === 0) {
      setAnalysisError("No food items to confirm. Please add at least one item.");
      return;
    }

    setIsSaving(true);
    setAnalysisError(null);

    try {
      const confirmedPayload: ConfirmedFoodItem[] = items.map((it) => ({
        food_name: it.food_name.trim(),
        quantity: Number(it.quantity) || 1,
        unit: it.unit.trim() || "serving",
        estimated_calories: Number(it.estimated_calories) || 0,
        protein_g: Number(it.protein_g) || 0,
        carbohydrates_g: Number(it.carbohydrates_g) || 0,
        fat_g: Number(it.fat_g) || 0,
        preparation: it.preparation || null,
        estimated_weight_g: Number(it.estimated_weight_g) || null,
        food_id: it.food_id || null,
        profile_id: it.profile_id || null,
        was_edited: it.was_edited || false,
        was_added: it.was_added || false,
      }));

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

      const res = await api.confirmMealScan({
        image_id: analysisResult?.image_id || "",
        meal_type: mealType,
        items: confirmedPayload,
        deleted_items: deletedItemNames,
        allow_training_consent: allowTrainingConsent,
        logged_at: getLoggedAt(),
      });

      if (res.saved_logs && res.saved_logs.length > 0) {
        onSuccess(res.saved_logs[0], res.daily_summary);
      } else {
        onSuccess({} as any, res.daily_summary);
      }
      onClose();
    } catch (err: any) {
      setAnalysisError(
        err.message || "Failed to save scanned meal to log. Please try again."
      );
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#22332d]/40 backdrop-blur-sm overflow-y-auto animate-fade-in"
    >
      <div className="bg-white w-full max-w-[840px] rounded-[28px] shadow-2xl border border-[#dfe6e1]/40 flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center gap-3.5 px-7 py-5 border-b border-[#eef1ee] flex-shrink-0">
          <div className="flex-1">
            <h2
              id="scanner-modal-title"
              className="text-[22px] font-bold text-[#22332d] leading-tight flex items-center gap-2 m-0"
            >
              AI Plate Scanner
              {stage === "review" && (
                <span className="rounded-full bg-[#eaf1ec] px-3 py-0.5 text-xs font-semibold text-[#22332d]">
                  Review &amp; confirm
                </span>
              )}
            </h2>
            <p className="text-[14px] text-[#5b6b64] mt-0.5">
              {stage === "review"
                ? "Adjust dishes and portions before saving."
                : "Snap or upload a photo of your meal plate."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-full border border-[#dfe6e1] bg-white text-[#22332d] flex items-center justify-center hover:bg-[#faf9f6] transition-colors text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
          >
            &times;
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:px-7 sm:py-5 flex flex-col gap-4">
          {analysisError && (
            <div
              role="alert"
              className="p-3.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {/* STAGE 1: CAPTURE & UPLOAD */}
          {stage === "capture" && (
            <div className="flex flex-col gap-5">
              {/* Meal Selector */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3a4a43] mb-1.5">
                  Meal category
                </label>
                <div className="flex gap-2" role="radiogroup" aria-label="Meal category">
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

              {/* Upload Dropzone */}
              {!imagePreviewUrl ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-[24px] p-8 text-center transition-all bg-[#faf9f6] flex flex-col items-center justify-center min-h-[260px] ${
                    isDragging
                      ? "border-[#7c9a7e] bg-[#eaf1ec]/40"
                      : "border-[#dfe6e1] hover:border-[#7c9a7e]"
                  }`}
                >
                  <div className="w-14 h-14 rounded-full bg-white border border-[#dfe6e1] flex items-center justify-center text-[#7c9a7e] shadow-sm mb-3">
                    <Camera className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-[17px] text-[#22332d]">
                    Capture or Upload Plate Photo
                  </h3>
                  <p className="text-[13px] text-[#5b6b64] max-w-sm mt-1">
                    Take a clear photo from above for highest portion estimation accuracy.
                  </p>

                  <div className="flex flex-wrap gap-3 justify-center mt-5">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="h-11 px-5 rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[14px] inline-flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#22332d]/40"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="h-11 px-5 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] font-semibold text-[14px] inline-flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
                    >
                      <Upload className="w-4 h-4 text-[#5b6b64]" />
                      <span>Choose from Gallery</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-[#dfe6e1] overflow-hidden bg-white p-4 flex flex-col items-center">
                  <div className="relative w-full max-h-[340px] rounded-[18px] overflow-hidden bg-[#22332d]/5 flex items-center justify-center">
                    <img
                      src={imagePreviewUrl}
                      alt="Plate preview"
                      className="max-h-[340px] w-auto object-contain rounded-[18px]"
                    />
                  </div>

                  {imageMetadata && (
                    <div className="flex items-center justify-between w-full mt-3 px-2 text-[12px] text-[#5b6b64]">
                      <span>
                        {imageMetadata.width} × {imageMetadata.height} px
                      </span>
                      <span>~{imageMetadata.sizeKb} KB (optimized)</span>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-red-600 hover:underline font-semibold"
                      >
                        Remove photo
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAnalyzeMeal}
                    className="w-full h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors mt-4 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Analyze Plate with AI</span>
                  </button>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* STAGE 2: ANALYZING SPINNER */}
          {stage === "analyzing" && (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-[#7c9a7e]" />
              <h3 className="font-bold text-[18px] text-[#22332d]">
                Analyzing your plate...
              </h3>
              <p className="text-[14px] text-[#5b6b64] max-w-sm">
                {analysisProgress || "Detecting dishes, estimating visual portions & matching nutrition..."}
              </p>
            </div>
          )}

          {/* STAGE 3: REVIEW & CONFIRM */}
          {stage === "review" && (
            <div className="flex flex-col gap-3">
              {/* Meal Selector Tabs */}
              <div className="flex gap-2" role="radiogroup" aria-label="Meal category">
                {mealOptions.map((opt) => {
                  const isSelected = mealType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setMealType(opt.key)}
                      className={`flex-1 text-center py-2.5 px-2 rounded-[14px] border text-[14px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#7c9a7e] ${
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

              {/* Detected Dishes Header & Actions */}
              <div className="flex justify-between items-center mt-3">
                <div className="text-[12px] font-bold tracking-[0.08em] text-[#5b6b64] uppercase">
                  DETECTED DISHES ({items.length})
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(!showQuickAdd)}
                    className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d] hover:bg-[#dfe6e1] transition-colors"
                  >
                    + Quick add
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomDish}
                    className="rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d] hover:bg-[#dfe6e1] transition-colors"
                  >
                    + Custom dish
                  </button>
                </div>
              </div>

              {/* Quick Add Presets Bar (when opened) */}
              {showQuickAdd && (
                <div className="flex flex-wrap gap-2 p-3 rounded-[16px] bg-[#faf9f6] border border-[#dfe6e1]">
                  {QUICK_ADD_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleAddPreset(preset)}
                      className="px-3 py-1 rounded-full bg-white border border-[#dfe6e1] text-xs font-semibold text-[#22332d] hover:bg-[#eaf1ec]"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              )}

              {/* List of Detected Dishes */}
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border border-[#e3e9e5] rounded-[20px] p-4 bg-white flex flex-col gap-3 shadow-xs"
                  >
                    {/* Top Row: Name, Calories pill, Trash */}
                    <div className="flex items-center gap-2.5">
                      <input
                        type="text"
                        value={item.food_name}
                        onChange={(e) =>
                          handleItemFieldChange(item.id, "food_name", e.target.value)
                        }
                        className="flex-1 h-10 px-3.5 rounded-[12px] border border-[#dfe6e1] bg-white text-[15px] font-semibold text-[#22332d] focus:border-[#7c9a7e] outline-none"
                      />
                      <span className="rounded-full bg-[#eaf1ec] px-3 py-1.5 text-xs font-semibold text-[#22332d] flex-shrink-0">
                        {Math.round(item.estimated_calories)} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        aria-label={`Delete ${item.food_name}`}
                        className="w-9 h-9 rounded-full text-[#5b6b64] hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    {/* Middle Row: Qty, Unit, Portion (g), Method */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[12px] font-medium text-[#5b6b64] mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={0.1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemFieldChange(item.id, "quantity", e.target.value)
                          }
                          className="w-full h-10 px-3 rounded-[12px] border border-[#dfe6e1] bg-white text-[14px] text-[#22332d] focus:border-[#7c9a7e] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#5b6b64] mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            handleItemFieldChange(item.id, "unit", e.target.value)
                          }
                          className="w-full h-10 px-3 rounded-[12px] border border-[#dfe6e1] bg-white text-[14px] text-[#22332d] focus:border-[#7c9a7e] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#5b6b64] mb-1">
                          Portion (g)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={item.estimated_weight_g}
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "estimated_weight_g",
                              e.target.value
                            )
                          }
                          className="w-full h-10 px-3 rounded-[12px] border border-[#dfe6e1] bg-white text-[14px] text-[#22332d] focus:border-[#7c9a7e] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#5b6b64] mb-1">
                          Method
                        </label>
                        <input
                          type="text"
                          value={item.preparation}
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "preparation",
                              e.target.value
                            )
                          }
                          placeholder="Cooked"
                          className="w-full h-10 px-3 rounded-[12px] border border-[#dfe6e1] bg-white text-[14px] text-[#22332d] focus:border-[#7c9a7e] outline-none"
                        />
                      </div>
                    </div>

                    {/* Bottom Macro Breakdown Line */}
                    <p className="text-[13px] text-[#5b6b64] m-0">
                      Carbs {roundOne(item.carbohydrates_g)}g &middot; Protein{" "}
                      {roundOne(item.protein_g)}g &middot; Fat {roundOne(item.fat_g)}g
                    </p>
                  </div>
                ))}
              </div>

              {/* Total Meal Summary Banner (.dk) */}
              <div className="bg-[#22332d] text-white rounded-[22px] p-5 sm:px-6 sm:py-5 flex justify-between items-center mt-3 shadow-sm">
                <div>
                  <div className="text-[12px] tracking-[0.08em] text-[#b7cdb9] font-semibold uppercase">
                    TOTAL MEAL (UNCONFIRMED)
                  </div>
                  <div className="text-[32px] sm:text-[36px] font-bold leading-tight mt-0.5">
                    {Math.round(totalCalories)}{" "}
                    <span className="text-[16px] font-medium text-[#b7cdb9]">
                      kcal
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-6 text-center">
                  <div>
                    <small className="block text-[#b7cdb9] text-[12px]">Carbs</small>
                    <b className="text-[18px] font-bold text-white">
                      {roundOne(totalCarbs)}g
                    </b>
                  </div>
                  <div>
                    <small className="block text-[#b7cdb9] text-[12px]">Protein</small>
                    <b className="text-[18px] font-bold text-white">
                      {roundOne(totalProtein)}g
                    </b>
                  </div>
                  <div>
                    <small className="block text-[#b7cdb9] text-[12px]">Fat</small>
                    <b className="text-[18px] font-bold text-white">
                      {roundOne(totalFat)}g
                    </b>
                  </div>
                </div>
              </div>

              {/* Model Improvement Consent Checkbox */}
              <label className="flex items-start gap-2.5 text-[13px] text-[#5b6b64] mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowTrainingConsent}
                  onChange={(e) => setAllowTrainingConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#7c9a7e] accent-[#22332d]"
                />
                <span>
                  Help improve FitMe by sharing this photo and your corrections. Uncheck to keep it private.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Modal Pinned Footer */}
        {stage === "review" && (
          <div className="flex gap-3 px-7 py-4 border-t border-[#eef1ee] bg-white flex-shrink-0">
            <button
              type="button"
              onClick={() => setStage("capture")}
              className="h-[52px] px-6 rounded-full border border-[#dfe6e1] bg-white hover:bg-[#faf9f6] text-[#22332d] font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c9a7e]"
            >
              Back to photo
            </button>
            <button
              type="button"
              onClick={handleConfirmAndSave}
              disabled={isSaving || items.length === 0}
              className="flex-1 h-[52px] rounded-full bg-[#22332d] hover:bg-[#182420] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-[#22332d]/40"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>Saving meal...</span>
                </>
              ) : (
                <span>
                  Confirm &amp; save meal ({Math.round(totalCalories)} kcal)
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
