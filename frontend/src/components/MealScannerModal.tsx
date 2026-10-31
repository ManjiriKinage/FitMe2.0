"use client";

import React, { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  MealType,
  DetectedFoodItem,
  MealImageAnalysisResponse,
  FoodLogItem,
  ConfirmedFoodItem,
} from "@/types";
import {
  Camera,
  Upload,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  X,
  ShieldCheck,
  Flame,
  SlidersHorizontal,
  HelpCircle,
  ChefHat,
  Scale,
} from "lucide-react";

interface MealScannerModalProps {
  initialMealType?: MealType;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem) => void;
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
  { value: "cooked", label: "Cooked / Curry / Gravy" },
  { value: "steamed", label: "Steamed (Rice / Idli)" },
  { value: "roasted", label: "Roasted (Roti / Bhakri)" },
  { value: "shallow_fried", label: "Shallow Fried (Paratha / Dosa)" },
  { value: "deep_fried", label: "Deep Fried (Puri / Snack)" },
  { value: "raw", label: "Raw / Fresh (Salad / Fruit)" },
];

const QUICK_ADD_PRESETS = [
  { name: "Chapati", qty: 1, unit: "piece", grams: 35, prep: "cooked" },
  { name: "Bajra Bhakri", qty: 1, unit: "piece", grams: 60, prep: "roasted" },
  { name: "Cooked White Rice", qty: 1, unit: "cup", grams: 150, prep: "steamed" },
  { name: "Yellow Dal", qty: 1, unit: "bowl", grams: 150, prep: "cooked" },
  { name: "Mixed Sabzi", qty: 1, unit: "bowl", grams: 150, prep: "cooked" },
  { name: "Curd / Dahi", qty: 1, unit: "bowl", grams: 150, prep: "raw" },
  { name: "Mixed Salad", qty: 1, unit: "bowl", grams: 100, prep: "raw" },
];

export default function MealScannerModal({
  initialMealType = "lunch",
  onClose,
  onSuccess,
}: MealScannerModalProps) {
  // Inputs & Selection State
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [compressedMime, setCompressedMime] = useState<string>("image/jpeg");
  const [imageMetadata, setImageMetadata] = useState<{ width: number; height: number; sizeKb: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Workflow Stages: 'capture' | 'analyzing' | 'review'
  const [stage, setStage] = useState<"capture" | "analyzing" | "review">("capture");
  const [analysisProgress, setAnalysisProgress] = useState<string>("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Review Stage State
  const [analysisResult, setAnalysisResult] = useState<MealImageAnalysisResponse | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [deletedItemNames, setDeletedItemNames] = useState<string[]>([]);
  const [allowTrainingConsent, setAllowTrainingConsent] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 1. Client-Side Image Resizing & WebP/JPEG Compression (Max 1280px)
  const processAndCompressImage = useCallback((file: File) => {
    setAnalysisError(null);

    // Validate type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAnalysisError("Unsupported file type. Please upload a JPEG, PNG, or WebP photo.");
      return;
    }

    // Max 15MB raw input guard
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

        // Export as WebP (or JPEG fallback) at 0.85 quality
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
    setAnalysisProgress("Uploading and inspecting plate image...");

    try {
      const timer1 = setTimeout(() => {
        setAnalysisProgress("Detecting dishes, estimating visual portions & matching nutrition...");
      }, 900);

      const res = await api.analyzeMealImage({
        image_base64: compressedBase64,
        mime_type: compressedMime,
        meal_type: mealType,
        allow_training_consent: allowTrainingConsent,
      });

      clearTimeout(timer1);
      setAnalysisResult(res);

      // Map detected items into editable state
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
      setAnalysisError(err.message || "Failed to analyze meal image. Please try again or retake the photo.");
    }
  };

  // 3. Portion & Field Modification with Zero-AI Local Recalculation
  const handleItemFieldChange = async (
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

    // Instant local proportional calculation for ultra-responsive UI
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

    const updatedItems = items.map((it) => {
      if (it.id !== id) return it;
      return {
        ...it,
        [field]: value,
        quantity: updatedQuantity,
        estimated_weight_g: updatedWeight,
        estimated_calories: updatedCalories,
        protein_g: updatedProtein,
        carbohydrates_g: updatedCarbs,
        fat_g: updatedFat,
        was_edited: true,
      };
    });
    setItems(updatedItems);

    const currentItem = updatedItems.find((it) => it.id === id);
    if (!currentItem || currentItem.quantity <= 0) return;

    // Authoritative deterministic recalculation without calling AI vision model
    setRecalculatingId(id);
    try {
      const recalculated = await api.recalculateItem({
        food_name: currentItem.food_name,
        quantity: Number(currentItem.quantity) || 1,
        unit: currentItem.unit,
        preparation: currentItem.preparation || undefined,
        weight_g: Number(currentItem.estimated_weight_g) || undefined,
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                estimated_calories: recalculated.estimated_calories,
                protein_g: recalculated.protein_g,
                carbohydrates_g: recalculated.carbohydrates_g,
                fat_g: recalculated.fat_g,
                estimated_weight_g: recalculated.weight_g,
                food_id: recalculated.food_id || it.food_id,
                profile_id: recalculated.profile_id || it.profile_id,
              }
            : it
        )
      );
    } catch (e) {
      console.warn("Local recalculation error:", e);
    } finally {
      setRecalculatingId(null);
    }
  };

  // Quick stepper increment / decrement
  const handleStepQuantity = (id: string, delta: number) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const newQty = Math.max(0.5, roundOne(item.quantity + delta));
    handleItemFieldChange(id, "quantity", newQty);
  };

  // 4. Remove Item
  const handleRemoveItem = (id: string) => {
    const itemToRemove = items.find((it) => it.id === id);
    if (itemToRemove) {
      setDeletedItemNames((prev) => [...prev, itemToRemove.food_name]);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // 5. Add Missing Food Item (Preset or Blank)
  const handleAddPreset = async (preset: { name: string; qty: number; unit: string; grams: number; prep: string }) => {
    const newItemId = `custom-${Date.now()}`;
    const placeholderItem: EditableItem = {
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

    setItems((prev) => [...prev, placeholderItem]);

    // Recalculate accurately against INDB profiles
    try {
      const rec = await api.recalculateItem({
        food_name: preset.name,
        quantity: preset.qty,
        unit: preset.unit,
        preparation: preset.prep,
        weight_g: preset.grams,
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === newItemId
            ? {
                ...it,
                estimated_calories: rec.estimated_calories,
                protein_g: rec.protein_g,
                carbohydrates_g: rec.carbohydrates_g,
                fat_g: rec.fat_g,
                food_id: rec.food_id,
                profile_id: rec.profile_id,
              }
            : it
        )
      );
    } catch {
      // Keep heuristic
    }
  };

  const handleAddCustomItem = () => {
    const newItem: EditableItem = {
      id: `custom-${Date.now()}`,
      food_name: "Extra Dish",
      quantity: 1,
      unit: "serving",
      estimated_weight_g: 100,
      estimated_calories: 120,
      protein_g: 4.0,
      carbohydrates_g: 18.0,
      fat_g: 3.5,
      preparation: "cooked",
      confidence: "medium",
      was_edited: true,
      was_added: true,
    };
    setItems((prev) => [...prev, newItem]);
  };

  // 6. Compute Aggregate Macros in Review Screen
  const totalCalories = items.reduce((acc, it) => acc + (it.estimated_calories || 0), 0);
  const totalProtein = items.reduce((acc, it) => acc + (it.protein_g || 0), 0);
  const totalCarbs = items.reduce((acc, it) => acc + (it.carbohydrates_g || 0), 0);
  const totalFat = items.reduce((acc, it) => acc + (it.fat_g || 0), 0);

  // 7. Confirm & Log Meal to Supabase (Only when user explicitly clicks Confirm)
  const handleConfirmAndSave = async () => {
    if (!analysisResult || items.length === 0) {
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

      const res = await api.confirmMealScan({
        image_id: analysisResult.image_id,
        meal_type: mealType,
        items: confirmedPayload,
        deleted_items: deletedItemNames,
        allow_training_consent: allowTrainingConsent,
        logged_at: new Date().toISOString(),
      });

      if (res.saved_logs && res.saved_logs.length > 0) {
        onSuccess(res.saved_logs[0]);
      } else {
        onSuccess({} as any);
      }
      onClose();
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to save scanned meal to log. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl sm:rounded-4xl shadow-2xl border border-mint flex flex-col max-h-[92vh] overflow-hidden">
        {/* Pinned Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-charcoal/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-mint flex items-center justify-center text-sage shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-charcoal tracking-tight">AI Plate Scanner</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sage/15 text-sage-700">
                  {stage === "review" ? "Review & Confirm" : "Vision AI"}
                </span>
              </div>
              <p className="text-[11px] text-charcoal/60">
                {stage === "review"
                  ? "Adjust dish names, preparation methods, and portion sizes before saving"
                  : "Snap or upload your meal for instant multi-dish recognition"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-cream hover:bg-cream-soft flex items-center justify-center text-charcoal/60 hover:text-charcoal transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Target Meal Type Selector */}
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
                  disabled={stage === "analyzing" || isSaving}
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

          {/* Hidden HTML Inputs for Camera & Gallery */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={galleryInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Error Banner */}
          {analysisError && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 1: CAPTURE / UPLOAD & PREVIEW SCREEN                      */}
          {/* ============================================================== */}
          {stage === "capture" && (
            <div className="space-y-4">
              {!imagePreviewUrl ? (
                // Empty state: Camera / Gallery Upload Dropzone
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`p-6 sm:p-8 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center gap-3.5 ${
                    isDragging
                      ? "border-sage bg-mint/40 scale-[1.01]"
                      : "border-charcoal/15 bg-cream/40 hover:bg-cream/70 hover:border-sage/50"
                  }`}
                >
                  <div className="w-14 h-14 rounded-3xl bg-mint flex items-center justify-center text-sage shadow-soft">
                    <ImageIcon className="w-7 h-7" />
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base text-charcoal">
                      Capture or Upload Your Plate
                    </h4>
                    <p className="text-xs text-charcoal/60 mt-0.5 max-w-sm">
                      Take a photo of your meal or select from gallery. AI will identify individual flatbreads, curries, dals, and rice.
                    </p>
                  </div>

                  {/* Dual Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 py-2.5 px-4 bg-sage text-white font-bold rounded-2xl hover:bg-sage-600 transition shadow-soft flex items-center justify-center gap-2 text-xs"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex-1 py-2.5 px-4 bg-white border border-charcoal/15 text-charcoal font-bold rounded-2xl hover:bg-cream transition shadow-xs flex items-center justify-center gap-2 text-xs"
                    >
                      <Upload className="w-4 h-4 text-charcoal/70" />
                      <span>Upload Gallery</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-charcoal/40 pt-1">
                    Supports JPEG, PNG, and WebP (up to 15MB) • Client-side compression enabled
                  </p>
                </div>
              ) : (
                // Image Loaded Preview State
                <div className="space-y-3">
                  <div className="relative rounded-3xl overflow-hidden border border-charcoal/10 bg-charcoal aspect-video max-h-[340px] flex items-center justify-center shadow-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreviewUrl}
                      alt="Plate Preview"
                      className="w-full h-full object-contain"
                    />

                    {/* Metadata badge overlay */}
                    {imageMetadata && (
                      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-xl bg-charcoal/80 backdrop-blur-md text-cream text-[10px] font-semibold flex items-center gap-2">
                        <span>{imageMetadata.width} × {imageMetadata.height}px</span>
                        <span>•</span>
                        <span>{imageMetadata.sizeKb} KB (Optimized)</span>
                      </div>
                    )}

                    {/* Floating Retake & Remove actions */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        title="Retake photo"
                        className="p-2 rounded-xl bg-charcoal/80 hover:bg-charcoal text-cream backdrop-blur-md transition shadow-md flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Retake</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        title="Remove photo"
                        className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-cream backdrop-blur-md transition shadow-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Consent & Quality note */}
                  <div className="p-3 rounded-2xl bg-cream/70 border border-charcoal/5 flex items-start gap-2 text-[11px] text-charcoal/70">
                    <ShieldCheck className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-charcoal">Privacy & Review Safeguard</p>
                      <p className="text-[10px] leading-relaxed text-charcoal/60 mt-0.5">
                        Your meal photo is analyzed securely. You can review, edit preparation methods, and adjust portion sizes before anything is saved to your daily log.
                      </p>
                    </div>
                  </div>

                  {/* Training opt-in checkbox */}
                  <label className="flex items-center gap-2 text-[11px] text-charcoal/75 cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={allowTrainingConsent}
                      onChange={(e) => setAllowTrainingConsent(e.target.checked)}
                      className="rounded text-sage focus:ring-sage"
                    />
                    <span>Allow anonymous meal photo evaluation to improve Indian food recognition models</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 2: ANALYZING STATE ANIMATION                              */}
          {/* ============================================================== */}
          {stage === "analyzing" && (
            <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-mint flex items-center justify-center text-sage animate-pulse">
                  <Sparkles className="w-10 h-10 animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-3xl border-2 border-sage animate-ping opacity-25" />
              </div>

              <div>
                <h4 className="font-black text-base text-charcoal tracking-tight">Analyzing Your Plate</h4>
                <p className="text-xs text-charcoal/60 mt-1 max-w-sm">
                  {analysisProgress || "Detecting dishes, calculating portion weights, and matching nutrition..."}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-sage font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deterministic INDB + Gemini Vision</span>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 3: PORTION CORRECTION & EDITABLE REVIEW SCREEN            */}
          {/* ============================================================== */}
          {stage === "review" && (
            <div className="space-y-4 animate-fade-in">
              {/* Detected Items List Header */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-black uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sage" />
                  Detected Dishes ({items.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(!showQuickAdd)}
                    className="px-2.5 py-1 rounded-xl bg-cream hover:bg-mint text-charcoal text-[11px] font-bold border border-charcoal/10 hover:border-sage/40 transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-sage" />
                    <span>Quick Add Dish</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomItem}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-cream text-charcoal text-[11px] font-bold border border-charcoal/10 hover:border-sage/40 transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-charcoal/70" />
                    <span>Custom Dish</span>
                  </button>
                </div>
              </div>

              {/* Quick Add Presets Row */}
              {showQuickAdd && (
                <div className="p-3 rounded-2xl bg-cream/70 border border-mint space-y-2 animate-fade-in">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-charcoal/60">
                    Quick-add common Indian dish:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ADD_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleAddPreset(preset)}
                        className="py-1 px-2.5 rounded-xl bg-white hover:bg-sage hover:text-white text-charcoal text-[11px] font-semibold border border-charcoal/10 transition shadow-xs flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>{preset.name} ({preset.grams}g)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Items Card List */}
              <div className="space-y-3">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="p-3.5 sm:p-4 rounded-3xl bg-cream/40 border border-charcoal/10 hover:border-sage/40 transition space-y-3 shadow-xs"
                  >
                    {/* Top Row: Dish Name & Quick Badges & Delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={it.food_name}
                          onChange={(e) => handleItemFieldChange(it.id, "food_name", e.target.value)}
                          placeholder="Dish name"
                          className="flex-1 font-bold text-sm text-charcoal bg-white px-3 py-1.5 rounded-xl border border-charcoal/10 focus:border-sage outline-none shadow-xs"
                        />
                      </div>

                      {/* Calorie Badge */}
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sage/15 text-sage-900 font-extrabold text-xs flex-shrink-0">
                        <Flame className="w-3.5 h-3.5 text-sage" />
                        <span>{Math.round(it.estimated_calories)} kcal</span>
                      </div>

                      {/* Remove Item Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        title="Remove dish"
                        className="w-8 h-8 rounded-xl hover:bg-red-50 text-charcoal/40 hover:text-red-600 flex items-center justify-center transition flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Portion, Weight, Preparation, and Unit Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      {/* 1. Quantity with Steppers */}
                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/60 uppercase mb-1">
                          Quantity
                        </label>
                        <div className="flex items-center rounded-xl bg-white border border-charcoal/10 overflow-hidden shadow-xs focus-within:border-sage">
                          <button
                            type="button"
                            onClick={() => handleStepQuantity(it.id, -0.5)}
                            className="px-2 py-1.5 hover:bg-cream text-charcoal/70 transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            step="0.5"
                            min="0.1"
                            value={it.quantity}
                            onChange={(e) => handleItemFieldChange(it.id, "quantity", Number(e.target.value))}
                            className="w-full text-center py-1 text-xs font-bold text-charcoal outline-none bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => handleStepQuantity(it.id, 0.5)}
                            className="px-2 py-1.5 hover:bg-cream text-charcoal/70 transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* 2. Serving Unit */}
                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/60 uppercase mb-1">
                          Serving Unit
                        </label>
                        <input
                          type="text"
                          value={it.unit}
                          onChange={(e) => handleItemFieldChange(it.id, "unit", e.target.value)}
                          placeholder="piece, bowl, cup"
                          className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-charcoal/10 text-xs font-bold text-charcoal outline-none focus:border-sage shadow-xs"
                        />
                      </div>

                      {/* 3. Estimated Weight in Grams */}
                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/60 uppercase mb-1 flex items-center justify-between">
                          <span>Portion (g)</span>
                          <span className="text-[8px] text-amber-800 lowercase">est.</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="5"
                            min="1"
                            value={it.estimated_weight_g}
                            onChange={(e) => handleItemFieldChange(it.id, "estimated_weight_g", Number(e.target.value))}
                            className="w-full bg-white pl-2.5 pr-6 py-1.5 rounded-xl border border-charcoal/10 text-xs font-bold text-charcoal outline-none focus:border-sage shadow-xs"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-charcoal/40 font-semibold pointer-events-none">
                            g
                          </span>
                        </div>
                      </div>

                      {/* 4. Preparation Method Selector */}
                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/60 uppercase mb-1">
                          Preparation Method
                        </label>
                        <select
                          value={it.preparation || "cooked"}
                          onChange={(e) => handleItemFieldChange(it.id, "preparation", e.target.value)}
                          className="w-full bg-white px-2 py-1.5 rounded-xl border border-charcoal/10 text-xs font-semibold text-charcoal outline-none focus:border-sage shadow-xs"
                        >
                          {PREPARATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Macros Ribbon & Recalculation Spinner */}
                    <div className="flex items-center justify-between pt-1 text-[11px] text-charcoal/70 bg-white/80 px-3 py-1.5 rounded-xl border border-charcoal/5">
                      <div className="flex items-center gap-3">
                        <span>Carbs: <strong className="text-charcoal font-bold">{roundOne(it.carbohydrates_g)}g</strong></span>
                        <span>•</span>
                        <span>Protein: <strong className="text-charcoal font-bold">{roundOne(it.protein_g)}g</strong></span>
                        <span>•</span>
                        <span>Fat: <strong className="text-charcoal font-bold">{roundOne(it.fat_g)}g</strong></span>
                      </div>

                      {recalculatingId === it.id && (
                        <span className="text-[10px] text-sage font-bold flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Updating nutrition...</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="p-8 text-center rounded-2xl bg-cream/40 border border-dashed border-charcoal/15 text-charcoal/60 text-xs">
                    All items removed. Use <strong>Quick Add Dish</strong> or <strong>Custom Dish</strong> to build your meal.
                  </div>
                )}
              </div>

              {/* Dynamic Macro Summary Bar */}
              <div className="p-4 rounded-3xl bg-charcoal text-cream flex items-center justify-between shadow-soft">
                <div>
                  <span className="text-[10px] font-bold text-sage uppercase tracking-wider block">
                    Total Meal Nutrition (Unconfirmed)
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-cream">{Math.round(totalCalories)}</span>
                    <span className="text-xs text-cream/70 font-semibold">kcal</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold uppercase">Carbs</span>
                    <strong className="text-cream text-sm">{roundOne(totalCarbs)}g</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold uppercase">Protein</span>
                    <strong className="text-cream text-sm">{roundOne(totalProtein)}g</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold uppercase">Fat</span>
                    <strong className="text-cream text-sm">{roundOne(totalFat)}g</strong>
                  </div>
                </div>
              </div>

              {/* Explicit Model Improvement Consent */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 text-[11px] text-charcoal/80 cursor-pointer bg-cream/70 p-2.5 rounded-xl border border-charcoal/10 hover:border-sage/40 transition">
                  <input
                    type="checkbox"
                    checked={allowTrainingConsent}
                    onChange={(e) => setAllowTrainingConsent(e.target.checked)}
                    className="mt-0.5 rounded text-sage focus:ring-sage"
                  />
                  <span>
                    <strong>Model Improvement Consent:</strong> Allow this photo and my verified corrections to be included in FitMe's periodic model fine-tuning dataset. (Uncheck to keep photo strictly private).
                  </span>
                </label>
              </div>

              <p className="text-[10px] text-charcoal/50 text-center italic">
                Entries are only added to your daily calorie budget when you click <strong>Confirm & Save Meal</strong> below.
              </p>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* PINNED ACTION FOOTER                                           */}
        {/* ============================================================== */}
        <div className="p-3 sm:p-4 bg-cream/40 border-t border-charcoal/10 flex items-center justify-between gap-3 flex-shrink-0">
          {stage === "review" ? (
            <>
              <button
                type="button"
                onClick={() => setStage("capture")}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl border border-charcoal/15 text-charcoal/70 hover:text-charcoal hover:bg-cream text-xs font-semibold transition"
              >
                Back to Photo
              </button>

              <button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={isSaving || items.length === 0}
                className="flex-1 py-2.5 px-4 bg-charcoal text-cream font-bold rounded-xl hover:bg-charcoal-light transition shadow-soft flex items-center justify-center gap-2 disabled:opacity-50 text-xs"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirming & Saving to Log...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Save Meal ({Math.round(totalCalories)} kcal)</span>
                    <Check className="w-4 h-4 text-sage" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={stage === "analyzing"}
                className="px-4 py-2.5 rounded-xl border border-charcoal/15 text-charcoal/70 hover:text-charcoal hover:bg-cream text-xs font-semibold transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleAnalyzeMeal}
                disabled={!compressedBase64 || stage === "analyzing"}
                className="flex-1 py-2.5 px-4 bg-sage text-white font-bold rounded-xl hover:bg-sage-600 transition shadow-soft flex items-center justify-center gap-2 disabled:opacity-50 text-xs"
              >
                {stage === "analyzing" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Meal Photo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analyze Meal</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}
