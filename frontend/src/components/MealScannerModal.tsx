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
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  X,
  Info,
  ShieldCheck,
  Flame,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";

interface MealScannerModalProps {
  initialMealType?: MealType;
  onClose: () => void;
  onSuccess: (newItem: FoodLogItem) => void;
}

interface EditableItem {
  id: string;
  food_name: string;
  quantity: number;
  unit: string;
  estimated_weight_g: number;
  estimated_calories: number;
  protein_g: number;
  carbohydrates_g: number;
  fat_g: number;
  preparation?: string | null;
  food_id?: string | null;
  profile_id?: string | null;
  confidence?: string;
  was_edited?: boolean;
  was_added?: boolean;
}

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
        setAnalysisProgress("Detecting Indian dishes & estimating visual portions...");
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
        quantity: f.serving_quantity || 1.0,
        unit: f.serving_unit || "serving",
        estimated_weight_g: f.estimated_weight_g || 100,
        estimated_calories: f.estimated_calories || 0,
        protein_g: f.protein_g || 0,
        carbohydrates_g: f.carbohydrates_g || 0,
        fat_g: f.fat_g || 0,
        preparation: f.preparation || "standard",
        food_id: f.food_id || null,
        profile_id: f.profile_id || null,
        confidence: f.confidence || "medium",
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

  // 3. Portion Recalculation without calling AI vision
  const handleItemFieldChange = async (
    id: string,
    field: "food_name" | "quantity" | "unit" | "estimated_weight_g",
    value: string | number
  ) => {
    const updatedItems = items.map((it) => {
      if (it.id !== id) return it;
      const copy = { ...it, [field]: value, was_edited: true };
      return copy;
    });
    setItems(updatedItems);

    // Call instant local recalculation
    const currentItem = updatedItems.find((it) => it.id === id);
    if (!currentItem || currentItem.quantity <= 0) return;

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
              }
            : it
        )
      );
    } catch (e) {
      // Fallback ratio scaling
      console.warn("Local recalculation error:", e);
    } finally {
      setRecalculatingId(null);
    }
  };

  // 4. Remove Item
  const handleRemoveItem = (id: string) => {
    const itemToRemove = items.find((it) => it.id === id);
    if (itemToRemove) {
      setDeletedItemNames((prev) => [...prev, itemToRemove.food_name]);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // 5. Add Missing Food Item
  const handleAddMissingItem = () => {
    const newItem: EditableItem = {
      id: `custom-${Date.now()}`,
      food_name: "Extra Chapati / Dish",
      quantity: 1,
      unit: "piece",
      estimated_weight_g: 35,
      estimated_calories: 85,
      protein_g: 2.6,
      carbohydrates_g: 17.5,
      fat_g: 0.4,
      confidence: "high",
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

  // 7. Confirm & Log Meal to Supabase
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
      <div className="bg-white w-full max-w-2xl rounded-3xl sm:rounded-4xl shadow-2xl border border-mint flex flex-col max-h-[90vh] overflow-hidden">
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
                  Vision AI
                </span>
              </div>
              <p className="text-[11px] text-charcoal/60">
                Snap or upload your meal for instant multi-dish recognition
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
                  disabled={stage === "analyzing"}
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
                      Take a photo of your meal or select from gallery. AI will identify individual rotis, curries, dals, and rice.
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
                      <p className="font-semibold text-charcoal">Privacy & Learning Safeguard</p>
                      <p className="text-[10px] leading-relaxed text-charcoal/60 mt-0.5">
                        Your photo is analyzed securely. You can review, edit, or adjust all dish names and portions before anything is saved to your daily calorie log.
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
              {/* Top Banner Notice */}
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Visual Estimation Notice:</strong>
                  <span className="text-[11px] text-amber-800 leading-relaxed">
                    {analysisResult?.uncertainty_notice ||
                      "Visual estimates are approximate. Please verify dish quantities and grams before confirming."}
                  </span>
                </div>
              </div>

              {/* Duplicate Cache Hit Badge */}
              {analysisResult?.is_cached_analysis && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Exact photo match detected — reused instant cached analysis.</span>
                </div>
              )}

              {/* Detected Items List Header */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-black uppercase tracking-wider text-charcoal flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-sage" />
                  Detected Dishes ({items.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddMissingItem}
                  className="px-2.5 py-1 rounded-xl bg-cream hover:bg-mint text-charcoal text-[11px] font-bold border border-charcoal/10 hover:border-sage/40 transition flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-sage" />
                  <span>Add Missing Dish</span>
                </button>
              </div>

              {/* Items Card List */}
              <div className="space-y-2.5">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="p-3.5 rounded-2xl bg-cream/50 border border-charcoal/10 hover:border-sage/30 transition space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Dish Name Input */}
                      <input
                        type="text"
                        value={it.food_name}
                        onChange={(e) => handleItemFieldChange(it.id, "food_name", e.target.value)}
                        placeholder="Dish name"
                        className="flex-1 font-bold text-xs text-charcoal bg-white/70 px-2.5 py-1.5 rounded-xl border border-charcoal/10 focus:border-sage outline-none"
                      />

                      {/* Calorie Pill */}
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sage/15 text-sage-800 font-extrabold text-xs flex-shrink-0">
                        <Flame className="w-3.5 h-3.5 text-sage" />
                        <span>{Math.round(it.estimated_calories)} kcal</span>
                      </div>

                      {/* Remove Item Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        title="Remove dish"
                        className="w-7 h-7 rounded-xl hover:bg-red-50 text-charcoal/40 hover:text-red-600 flex items-center justify-center transition flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Portion & Macros Controls */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/50 uppercase mb-0.5">Quantity</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.1"
                          value={it.quantity}
                          onChange={(e) => handleItemFieldChange(it.id, "quantity", Number(e.target.value))}
                          className="w-full text-center bg-white px-2 py-1 rounded-xl border border-charcoal/10 text-xs font-bold text-charcoal outline-none focus:border-sage"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/50 uppercase mb-0.5">Serving Unit</label>
                        <input
                          type="text"
                          value={it.unit}
                          onChange={(e) => handleItemFieldChange(it.id, "unit", e.target.value)}
                          placeholder="e.g. piece, bowl"
                          className="w-full text-center bg-white px-2 py-1 rounded-xl border border-charcoal/10 text-xs font-bold text-charcoal outline-none focus:border-sage"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-charcoal/50 uppercase mb-0.5">Estimated Grams</label>
                        <input
                          type="number"
                          step="5"
                          min="1"
                          value={it.estimated_weight_g}
                          onChange={(e) => handleItemFieldChange(it.id, "estimated_weight_g", Number(e.target.value))}
                          className="w-full text-center bg-white px-2 py-1 rounded-xl border border-charcoal/10 text-xs font-bold text-charcoal outline-none focus:border-sage"
                        />
                      </div>

                      <div className="flex items-center justify-center gap-1 bg-white/60 rounded-xl border border-charcoal/5 p-1 text-[10px] text-charcoal/70">
                        <span>P: <strong>{it.protein_g}g</strong></span>
                        <span>•</span>
                        <span>C: <strong>{it.carbohydrates_g}g</strong></span>
                        <span>•</span>
                        <span>F: <strong>{it.fat_g}g</strong></span>
                      </div>
                    </div>

                    {recalculatingId === it.id && (
                      <p className="text-[10px] text-sage font-semibold animate-pulse flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Updating macros locally...</span>
                      </p>
                    )}
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="p-8 text-center rounded-2xl bg-cream/40 border border-dashed border-charcoal/15 text-charcoal/60 text-xs">
                    All items removed. Click <strong>Add Missing Dish</strong> to log your plate manually.
                  </div>
                )}
              </div>

              {/* Dynamic Macro Summary Bar */}
              <div className="p-3.5 rounded-2xl bg-charcoal text-cream flex items-center justify-between shadow-soft">
                <div>
                  <span className="text-[10px] font-bold text-sage uppercase tracking-wider block">
                    Total Estimated Nutrition
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black text-cream">{Math.round(totalCalories)}</span>
                    <span className="text-xs text-cream/70 font-semibold">kcal</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right text-xs">
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold">Carbs</span>
                    <strong className="text-cream text-xs">{roundOne(totalCarbs)}g</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold">Protein</span>
                    <strong className="text-cream text-xs">{roundOne(totalProtein)}g</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-cream/50 block font-semibold">Fat</span>
                    <strong className="text-cream text-xs">{roundOne(totalFat)}g</strong>
                  </div>
                </div>
              </div>
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
                    <Check className="w-3.5 h-3.5 text-sage" />
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

