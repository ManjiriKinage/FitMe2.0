-- FitMe V1 Supabase Schema
-- Database schema for FitMe: AI-Powered Personalized Calorie Tracker

-- 1. Create extension for UUID generation if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Drop existing tables if re-running migration cleanly
-- DROP TABLE IF EXISTS public.food_logs;
-- DROP TABLE IF EXISTS public.profiles;

-- ==========================================
-- PROFILES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 10 AND age <= 120),
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    height_cm NUMERIC(6,2) NOT NULL CHECK (height_cm >= 50 AND height_cm <= 300),
    current_weight_kg NUMERIC(6,2) NOT NULL CHECK (current_weight_kg >= 20 AND current_weight_kg <= 500),
    activity_level TEXT NOT NULL CHECK (
        activity_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active')
    ),
    fitness_goal TEXT NOT NULL CHECK (
        fitness_goal IN ('lose_weight', 'maintain_weight', 'gain_muscle', 'gain_weight')
    ),
    target_weight_kg NUMERIC(6,2),
    daily_calorie_target INTEGER NOT NULL CHECK (daily_calorie_target > 0),
    bmr INTEGER,
    tdee INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- FOOD LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.food_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    food_name TEXT NOT NULL,
    quantity NUMERIC(6,2) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    estimated_calories NUMERIC(7,1) NOT NULL CHECK (estimated_calories >= 0),
    protein_g NUMERIC(6,1) NOT NULL DEFAULT 0.0 CHECK (protein_g >= 0),
    carbohydrates_g NUMERIC(6,1) NOT NULL DEFAULT 0.0 CHECK (carbohydrates_g >= 0),
    fat_g NUMERIC(6,1) NOT NULL DEFAULT 0.0 CHECK (fat_g >= 0),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_logged ON public.food_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_meal ON public.food_logs(user_id, meal_type);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
    ON public.profiles FOR DELETE
    USING (auth.uid() = id);

-- Food Logs Policies
DROP POLICY IF EXISTS "Users can view own food logs" ON public.food_logs;
CREATE POLICY "Users can view own food logs"
    ON public.food_logs FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own food logs" ON public.food_logs;
CREATE POLICY "Users can insert own food logs"
    ON public.food_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own food logs" ON public.food_logs;
CREATE POLICY "Users can update own food logs"
    ON public.food_logs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own food logs" ON public.food_logs;
CREATE POLICY "Users can delete own food logs"
    ON public.food_logs FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- UPDATED_AT TRIGGER
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_updated_at ON public.profiles;
CREATE TRIGGER trigger_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
