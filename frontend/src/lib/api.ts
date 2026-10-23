import { getAuthToken } from "./supabase";
import {
  UserProfile,
  CalorieCalculationResult,
  AIEstimateResponse,
  FoodLogItem,
  DashboardSummary,
  GoalRecalculateResponse
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
      errorDetail = errJson.detail || JSON.stringify(errJson);
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

  getFoodLogs: async (date?: string): Promise<FoodLogItem[]> => {
    const queryStr = date ? `?date=${encodeURIComponent(date)}` : "";
    return fetchWithAuth<FoodLogItem[]>(`/api/food/logs${queryStr}`);
  },

  createFoodLog: async (data: Omit<FoodLogItem, "id" | "user_id">): Promise<FoodLogItem> => {
    return fetchWithAuth<FoodLogItem>("/api/food/logs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  deleteFoodLog: async (id: string): Promise<{ message: string; id: string }> => {
    return fetchWithAuth<{ message: string; id: string }>(`/api/food/logs/${id}`, {
      method: "DELETE",
    });
  },

  // Dashboard Aggregation
  getDashboard: async (date?: string): Promise<DashboardSummary> => {
    const queryStr = date ? `?date=${encodeURIComponent(date)}` : "";
    return fetchWithAuth<DashboardSummary>(`/api/dashboard${queryStr}`);
  },
};
