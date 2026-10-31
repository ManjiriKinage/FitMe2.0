import { getAuthToken } from "./supabase";
import {
  UserProfile,
  CalorieCalculationResult,
  AIEstimateResponse,
  FoodLogItem,
  DashboardSummary,
  GoalRecalculateResponse,
  RecipeSearchResult,
  RecipeDetailResponse,
  UserPreferenceItem,
  BatchFoodLogConfirmRequest,
  BatchFoodLogConfirmResponse,
  MealImageAnalysisResponse,
  MealScanConfirmRequest,
  MealScanConfirmResponse,
  RecalculateItemRequest,
  RecalculateItemResponse,
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const userTz = getUserTimezone();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(userTz ? { "X-Timezone": userTz } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "Network request failed";
    try {
      const errJson = await response.json();
      if (typeof errJson.detail === "string") {
        errorDetail = errJson.detail;
      } else if (Array.isArray(errJson.detail)) {
        errorDetail = errJson.detail
          .map((e: any) => {
            if (typeof e === "string") return e;
            if (e.msg) {
              const field = Array.isArray(e.loc) ? e.loc.slice(-1)[0] : "";
              return field ? `${field}: ${e.msg}` : e.msg;
            }
            return JSON.stringify(e);
          })
          .join("; ");
      } else if (typeof errJson.message === "string") {
        errorDetail = errJson.message;
      } else if (typeof errJson.error === "string") {
        errorDetail = errJson.error;
      } else if (errJson.detail) {
        errorDetail = typeof errJson.detail === "object" ? JSON.stringify(errJson.detail) : String(errJson.detail);
      } else {
        errorDetail = JSON.stringify(errJson);
      }
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(errorDetail || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Public calculation preview (no token required)
  calculatePreview: async (data: Record<string, any>): Promise<CalorieCalculationResult> => {
    const res = await fetch(`${API_BASE}/api/auth/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Calculation failed" }));
      throw new Error(err.detail || "Calculation failed");
    }
    return res.json();
  },

  // Profile
  getProfile: async (): Promise<UserProfile> => {
    return fetchWithAuth<UserProfile>("/api/profile");
  },

  createProfile: async (data: Record<string, any>): Promise<UserProfile> => {
    return fetchWithAuth<UserProfile>("/api/profile", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateProfile: async (data: Partial<UserProfile>): Promise<UserProfile> => {
    return fetchWithAuth<UserProfile>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // Goals
  getGoals: async (): Promise<{ profile: UserProfile; calculation_details: CalorieCalculationResult }> => {
    return fetchWithAuth<{ profile: UserProfile; calculation_details: CalorieCalculationResult }>("/api/goals");
  },

  recalculateGoals: async (data: Record<string, any>): Promise<GoalRecalculateResponse> => {
    return fetchWithAuth<GoalRecalculateResponse>("/api/goals/recalculate", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // Food & AI Estimation
  estimateFood: async (query: string): Promise<AIEstimateResponse> => {
    return fetchWithAuth<AIEstimateResponse>("/api/food/estimate", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },

  searchFoods: async (query: string, limit: number = 10): Promise<RecipeSearchResult[]> => {
    return fetchWithAuth<RecipeSearchResult[]>(`/api/food/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },

  getRecipeDetail: async (recipeCode: string): Promise<RecipeDetailResponse> => {
    return fetchWithAuth<RecipeDetailResponse>(`/api/food/recipes/${encodeURIComponent(recipeCode)}`);
  },

  getFoodLogs: async (date?: string, page: number = 1, pageSize: number = 50, tz?: string): Promise<FoodLogItem[]> => {
    const userTz = tz || getUserTimezone();
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (userTz) params.append("tz", userTz);
    if (page > 1) params.append("page", String(page));
    if (pageSize !== 50) params.append("page_size", String(pageSize));
    const queryStr = params.toString() ? `?${params.toString()}` : "";
    return fetchWithAuth<FoodLogItem[]>(`/api/food/logs${queryStr}`);
  },

  createFoodLog: async (data: Omit<FoodLogItem, "id" | "user_id">): Promise<FoodLogItem> => {
    return fetchWithAuth<FoodLogItem>("/api/food/logs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateFoodLog: async (id: string, data: Partial<FoodLogItem>): Promise<FoodLogItem> => {
    return fetchWithAuth<FoodLogItem>(`/api/food/logs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteFoodLog: async (id: string): Promise<{ message: string; id: string }> => {
    return fetchWithAuth<{ message: string; id: string }>(`/api/food/logs/${id}`, {
      method: "DELETE",
    });
  },

  confirmMeal: async (payload: BatchFoodLogConfirmRequest): Promise<BatchFoodLogConfirmResponse> => {
    return fetchWithAuth<BatchFoodLogConfirmResponse>("/api/food/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // User Preferences & Learning (Phase 7)
  getPreferences: async (): Promise<UserPreferenceItem[]> => {
    return fetchWithAuth<UserPreferenceItem[]>("/api/food/preferences");
  },

  updatePreference: async (
    prefId: string,
    data: { preferred_serving_quantity?: number; preferred_serving_unit?: string; preferred_serving_weight_g?: number }
  ): Promise<UserPreferenceItem> => {
    return fetchWithAuth<UserPreferenceItem>(`/api/food/preferences/${prefId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deletePreference: async (prefId: string): Promise<{ message: string; id: string }> => {
    return fetchWithAuth<{ message: string; id: string }>(`/api/food/preferences/${prefId}`, {
      method: "DELETE",
    });
  },

  clearPreferences: async (): Promise<{ message: string }> => {
    return fetchWithAuth<{ message: string }>("/api/food/preferences", {
      method: "DELETE",
    });
  },

  // Dashboard Aggregation
  getDashboard: async (date?: string, tz?: string): Promise<DashboardSummary> => {
    const userTz = tz || getUserTimezone();
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (userTz) params.append("tz", userTz);
    const queryStr = params.toString() ? `?${params.toString()}` : "";
    return fetchWithAuth<DashboardSummary>(`/api/dashboard${queryStr}`);
  },

  // AI Plate Scanner & Vision
  analyzeMealImage: async (payload: {
    image_base64: string;
    mime_type?: string;
    meal_type?: string;
    allow_training_consent?: boolean;
    force_refresh?: boolean;
  }): Promise<MealImageAnalysisResponse> => {
    return fetchWithAuth<MealImageAnalysisResponse>("/api/meals/analyze-image", {
      method: "POST",
      body: JSON.stringify({
        image_base64: payload.image_base64,
        mime_type: payload.mime_type || "image/jpeg",
        meal_type: payload.meal_type || "lunch",
        allow_training_consent: payload.allow_training_consent ?? false,
        force_refresh: payload.force_refresh ?? false,
      }),
    });
  },

  recalculateItem: async (payload: RecalculateItemRequest): Promise<RecalculateItemResponse> => {
    return fetchWithAuth<RecalculateItemResponse>("/api/meals/recalculate-item", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  confirmMealScan: async (payload: MealScanConfirmRequest): Promise<MealScanConfirmResponse> => {
    return fetchWithAuth<MealScanConfirmResponse>("/api/meals/confirm-scan", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  deleteScannedImage: async (imageId: string): Promise<{ message: string; image_id: string }> => {
    return fetchWithAuth<{ message: string; image_id: string }>(`/api/meals/images/${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    });
  },
};

