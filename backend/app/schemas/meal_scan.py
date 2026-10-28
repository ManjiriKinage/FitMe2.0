"""Pydantic schemas for AI Plate Scanner, image caching, and supervised feedback."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.schemas.food import MealType, FoodLogResponse

class ImageAnalysisRequest(BaseModel):
    image_base64: str = Field(..., min_length=20, description="Base64-encoded image data")
    mime_type: str = Field(default="image/jpeg", pattern=r"^image\/(jpeg|png|webp)$")
    meal_type: MealType = "lunch"
    allow_training_consent: bool = Field(default=False, description="User consent to use image for model evaluation")

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
    foods: List[DetectedFoodItem] = Field(default_factory=list)
    total_calories: float = 0.0
    total_protein_g: float = 0.0
    total_carbohydrates_g: float = 0.0
    total_fat_g: float = 0.0
    model_provider: str = "google"
    model_version: str = "gemini-flash-lite-latest"
    analysis_version: str = "v1"
    processing_time_ms: Optional[float] = None

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

class MealScanConfirmResponse(BaseModel):
    success: bool
    saved_count: int
    total_calories: float
    saved_logs: List[FoodLogResponse] = Field(default_factory=list)
    feedback_saved: bool = True
    message: str

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

