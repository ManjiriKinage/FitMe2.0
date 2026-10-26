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
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
          .map((e: any) => (typeof e === "string" ? e : (e.msg || JSON.stringify(e))))
          .join("; ");
      } else if (errJson.detail) {
        errorDetail = JSON.stringify(errJson.detail);
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

  getFoodLogs: async (date?: string, page: number = 1, pageSize: number = 50): Promise<FoodLogItem[]> => {
    const params = new URLSearchParams();
    if (date) params.append("date", date);
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
  getDashboard: async (date?: string): Promise<DashboardSummary> => {
    const queryStr = date ? `?date=${encodeURIComponent(date)}` : "";
    return fetchWithAuth<DashboardSummary>(`/api/dashboard${queryStr}`);
  },
};

