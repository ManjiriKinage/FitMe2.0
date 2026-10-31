"""Pydantic schemas for AI Plate Scanner, image caching, and supervised feedback."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.schemas.food import MealType, FoodLogResponse, DashboardSummaryResponse

class ImageAnalysisRequest(BaseModel):
    image_base64: str = Field(..., min_length=20, description="Base64-encoded image data")
    mime_type: str = Field(default="image/jpeg", pattern=r"^image\/(jpeg|png|webp)$")
    meal_type: MealType = "lunch"
    allow_training_consent: bool = Field(default=False, description="User consent to use image for model evaluation")
    force_refresh: bool = Field(default=False, description="Set true to bypass cache and force fresh analysis")

class GeminiDetectedFood(BaseModel):
    """Pydantic validator for raw food item detected by Gemini Vision API."""
    name: str = Field(..., min_length=1, description="Detected or canonical food name")
    aliases: List[str] = Field(default_factory=list, description="Common food aliases")
    category: str = Field(default="general", description="flatbread, grain, lentil, curry, protein, dairy, salad, snack, beverage")
    preparation: Optional[str] = Field(default="cooked", description="cooked, steamed, roasted, shallow_fried, deep_fried, raw")
    estimated_weight_g: float = Field(default=100.0, gt=0, description="Estimated portion weight in grams")
    serving_description: Optional[str] = Field(default=None, description="e.g. '2 medium chapatis (~70g)'")
    serving_quantity: float = Field(default=1.0, gt=0)
    serving_unit: str = Field(default="serving")
    confidence: str = Field(default="medium", description="'high', 'medium', or 'low'")
    assumptions: List[str] = Field(default_factory=list, description="Cooking and preparation assumptions")
    uncertainty: Optional[str] = Field(default=None, description="Visual ambiguity or uncertainty notes")

class GeminiVisionAnalysisResult(BaseModel):
    """Pydantic validator for complete Gemini Vision structured response."""
    foods: List[GeminiDetectedFood] = Field(default_factory=list)
    overall_uncertainty: Optional[str] = Field(default=None, description="Overall plate uncertainty notes")

class DetectedFoodItem(BaseModel):
    id: str = Field(default="", description="Unique item identifier for frontend management")
    name: str = Field(..., min_length=1, description="Detected food name")
    canonical_name: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    category: str = "general"
    preparation: Optional[str] = "cooked"
    estimated_weight_g: float = Field(..., gt=0, description="Estimated food weight in grams")
    serving_description: Optional[str] = None
    serving_quantity: float = Field(default=1.0, gt=0)
    serving_unit: str = Field(default="serving")
    confidence: str = Field(default="medium", description="high, medium, or low")
    assumptions: List[str] = Field(default_factory=list)
    uncertainty: Optional[str] = None
    clarification_needed: Optional[str] = None
    estimated_calories: float = Field(..., ge=0)
    protein_g: float = Field(default=0.0, ge=0)
    carbohydrates_g: float = Field(default=0.0, ge=0)
    fat_g: float = Field(default=0.0, ge=0)
    fiber_g: Optional[float] = Field(default=None, ge=0)
    nutrition_source: str = "nutrition_profile"
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

class MealImageAnalysisResponse(BaseModel):
    image_id: str
    image_hash: str
    storage_path: Optional[str] = None
    signed_image_url: Optional[str] = None
    is_cached_analysis: bool = False
    requires_confirmation: bool = True
    uncertainty_notice: str = (
        "Visual estimates are approximate and do not account for hidden ingredients or exact oils. "
        "Please review and adjust portion sizes before confirming."
    )
    overall_uncertainty: Optional[str] = None
    foods: List[DetectedFoodItem] = Field(default_factory=list)
    detected_labels: List[str] = Field(default_factory=list, description="List of recognized food labels/names")
    original_ai_prediction: Optional[List[Dict[str, Any]]] = None
    total_calories: float = 0.0
    total_protein_g: float = 0.0
    total_carbohydrates_g: float = 0.0
    total_fat_g: float = 0.0
    model_provider: str = "google"
    model_version: str = "gemini-flash-lite-latest"
    analysis_version: str = "v1"
    processing_time_ms: Optional[float] = None
    token_usage: Optional[Dict[str, Any]] = None
    cache_hit_savings: Optional[str] = None

class ConfirmedFoodItem(BaseModel):
    food_name: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1)
    estimated_calories: float = Field(..., ge=0)
    protein_g: float = Field(default=0.0, ge=0)
    carbohydrates_g: float = Field(default=0.0, ge=0)
    fat_g: float = Field(default=0.0, ge=0)
    preparation: Optional[str] = None
    estimated_weight_g: Optional[float] = None
    food_id: Optional[str] = None
    profile_id: Optional[str] = None
    was_edited: bool = False
    was_added: bool = False

class MealScanConfirmRequest(BaseModel):
    image_id: str = Field(..., min_length=1)
    meal_type: MealType = "lunch"
    items: List[ConfirmedFoodItem] = Field(..., min_length=1)
    deleted_items: List[str] = Field(default_factory=list)
    allow_training_consent: bool = False
    logged_at: Optional[datetime] = None
    idempotency_key: Optional[str] = None

class MealScanConfirmResponse(BaseModel):
    success: bool
    saved_count: int
    total_calories: float
    saved_logs: List[FoodLogResponse] = Field(default_factory=list)
    feedback_saved: bool = True
    message: str
    daily_summary: Optional[DashboardSummaryResponse] = None

class RecalculateItemRequest(BaseModel):
    food_name: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1)
    preparation: Optional[str] = None
    weight_g: Optional[float] = None

class RecalculateItemResponse(BaseModel):
    food_name: str
    quantity: float
    unit: str
    weight_g: float
    estimated_calories: float
    protein_g: float
    carbohydrates_g: float
    fat_g: float
    fiber_g: Optional[float] = None
    nutrition_source: str
    food_id: Optional[str] = None
    profile_id: Optional[str] = None

class CacheInvalidationRequest(BaseModel):
    image_hash: Optional[str] = Field(default=None, description="SHA-256 hash of image to invalidate")
    all_cached: bool = Field(default=False, description="Set true to invalidate all cached scans for user")

class CacheInvalidationResponse(BaseModel):
    success: bool
    invalidated_count: int
    message: str

class VisionUsageStatsResponse(BaseModel):
    user_id: str
    total_scans: int
    cache_hits: int
    cache_misses: int
    cache_hit_rate_pct: float
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens_consumed: int
    estimated_tokens_saved: int
    estimated_calls_saved: int
    last_scan_at: Optional[datetime] = None

class DatasetStatsResponse(BaseModel):
    total_consented_samples: int
    approved_for_training: int
    pending_review: int
    consent_denied_samples: int
    training_ready: bool
    minimum_samples_required: int

class DatasetExportRequest(BaseModel):
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    version: str = "v1"

class DatasetExportResponse(BaseModel):
    success: bool
    manifest_version: str
    total_samples: int
    train_count: int
    val_count: int
    test_count: int
    filepath: Optional[str] = None
    created_at: str

class ModelEvaluationResponse(BaseModel):
    evaluation_timestamp: str
    total_evaluated_items: int
    top1_accuracy_percent: float
    top3_accuracy_percent: float
    portion_mae_grams: float
    average_latency_ms: float
    evaluation_duration_seconds: float
    status: str

class PeriodicFineTuningRequest(BaseModel):
    epochs: int = Field(default=2, ge=1, le=20)
    batch_size: int = Field(default=4, ge=1, le=64)
    force_run: bool = Field(default=False, description="Set True to bypass minimum sample threshold guard")

class PeriodicFineTuningResponse(BaseModel):
    success: bool
    status: str
    checkpoint_path: Optional[str] = None
    epochs_trained: Optional[int] = None
    final_training_loss: Optional[float] = None
    training_samples_used: Optional[int] = None
    validation_metrics: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[float] = None
    message: Optional[str] = None
    completed_at: Optional[str] = None


