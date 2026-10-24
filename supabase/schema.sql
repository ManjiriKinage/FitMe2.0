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

-- ==============================================================================
-- FitMe 2.0 Migration 002: INDB Catalog, Recipes, Ingredients, & Personalization
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. UPDATE PROFILES (Add preferred timezone)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferred_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 3. INGREDIENTS TABLE (Normalized Raw & Reference Food Items)
CREATE TABLE IF NOT EXISTS public.ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_food_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    food_state TEXT NOT NULL DEFAULT 'raw',
    energy_kcal_per_100g NUMERIC(8,2),
    protein_g_per_100g NUMERIC(8,2),
    carbohydrates_g_per_100g NUMERIC(8,2),
    fat_g_per_100g NUMERIC(8,2),
    fiber_g_per_100g NUMERIC(8,2),
    source_name TEXT NOT NULL,
    source_version TEXT NOT NULL DEFAULT '1.0',
    data_quality_status TEXT NOT NULL DEFAULT 'reference',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ingredients_source_code ON public.ingredients(source_food_code);
CREATE INDEX IF NOT EXISTS idx_ingredients_norm_name ON public.ingredients(normalized_name);

-- 4. RECIPES TABLE (Prepared Indian Dishes with Reported INDB Nutrition)
CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_recipe_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    recipe_type TEXT NOT NULL DEFAULT 'indian_dish',
    reported_energy_basis TEXT NOT NULL DEFAULT 'per_100g_and_serving',
    reported_serving_size_g NUMERIC(8,2),
    reported_servings_count NUMERIC(6,2) DEFAULT 1.0,
    reported_serving_unit TEXT,
    reported_energy_kcal_per_100g NUMERIC(8,2) NOT NULL,
    reported_protein_g_per_100g NUMERIC(8,2) NOT NULL,
    reported_carbohydrates_g_per_100g NUMERIC(8,2) NOT NULL,
    reported_fat_g_per_100g NUMERIC(8,2) NOT NULL,
    reported_fiber_g_per_100g NUMERIC(8,2),
    serving_energy_kcal NUMERIC(8,2),
    serving_protein_g NUMERIC(8,2),
    serving_carbohydrates_g NUMERIC(8,2),
    serving_fat_g NUMERIC(8,2),
    source_name TEXT NOT NULL,
    source_version TEXT NOT NULL DEFAULT '1.0',
    validation_status TEXT NOT NULL DEFAULT 'verified',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_recipes_source_code ON public.recipes(source_recipe_code);
CREATE INDEX IF NOT EXISTS idx_recipes_norm_name ON public.recipes(normalized_name);
CREATE INDEX IF NOT EXISTS idx_recipes_type ON public.recipes(recipe_type);

-- 5. RECIPE INGREDIENTS TABLE (Many-to-Many Recipe to Ingredient Bill of Materials)
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE SET NULL,
    source_recipe_code TEXT NOT NULL,
    ingredient_food_code TEXT,
    source_ingredient_name TEXT NOT NULL,
    quantity NUMERIC(8,2),
    unit TEXT,
    quantity_grams NUMERIC(8,2),
    conversion_method TEXT NOT NULL DEFAULT 'direct_weight',
    conversion_status TEXT NOT NULL DEFAULT 'converted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_r_code ON public.recipe_ingredients(source_recipe_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ing_code ON public.recipe_ingredients(ingredient_food_code);

-- 6. UNIT CONVERSIONS LOOKUP TABLE
CREATE TABLE IF NOT EXISTS public.unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    gram_factor NUMERIC(8,2) NOT NULL,
    notes TEXT,
    source TEXT
);

CREATE INDEX IF NOT EXISTS idx_unit_conversions_name ON public.unit_conversions(unit_name);

-- 7. UPDATE FOOD LOGS TABLE (Preserve snapshot & reference recipe)
ALTER TABLE public.food_logs
ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS serving_unit TEXT,
ADD COLUMN IF NOT EXISTS serving_weight_g NUMERIC(8,2),
ADD COLUMN IF NOT EXISTS calories_per_100g NUMERIC(8,2),
ADD COLUMN IF NOT EXISTS estimate_source TEXT NOT NULL DEFAULT 'indb_catalog',
ADD COLUMN IF NOT EXISTS nutrition_data_version TEXT NOT NULL DEFAULT 'v1.0',
ADD COLUMN IF NOT EXISTS calculation_method TEXT NOT NULL DEFAULT 'deterministic',
ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_food_logs_recipe_id ON public.food_logs(recipe_id);

-- 8. USER FOOD PREFERENCES (Learning System)
CREATE TABLE IF NOT EXISTS public.user_food_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    food_key TEXT NOT NULL,
    preferred_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
    preferred_serving_quantity NUMERIC(6,2) NOT NULL DEFAULT 1.0,
    preferred_serving_unit TEXT NOT NULL,
    preferred_serving_weight_g NUMERIC(8,2),
    preferred_preparation TEXT,
    confirmed_observations INTEGER NOT NULL DEFAULT 1,
    last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_food_key UNIQUE(user_id, food_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_food_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON public.user_food_preferences(user_id, food_key);

-- 9. USER FOOD FEEDBACK (Corrections & Discrepancies)
CREATE TABLE IF NOT EXISTS public.user_food_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    food_log_id UUID REFERENCES public.food_logs(id) ON DELETE SET NULL,
    feedback_type TEXT NOT NULL,
    original_estimate JSONB NOT NULL,
    corrected_value JSONB NOT NULL,
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON public.user_food_feedback(user_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Catalog tables: Public read access, Admin write
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view ingredients" ON public.ingredients;
CREATE POLICY "Public can view ingredients" ON public.ingredients FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage ingredients" ON public.ingredients;
CREATE POLICY "Public can manage ingredients" ON public.ingredients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view recipes" ON public.recipes;
CREATE POLICY "Public can view recipes" ON public.recipes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage recipes" ON public.recipes;
CREATE POLICY "Public can manage recipes" ON public.recipes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Public can view recipe ingredients" ON public.recipe_ingredients FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Public can manage recipe ingredients" ON public.recipe_ingredients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view unit conversions" ON public.unit_conversions;
CREATE POLICY "Public can view unit conversions" ON public.unit_conversions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage unit conversions" ON public.unit_conversions;
CREATE POLICY "Public can manage unit conversions" ON public.unit_conversions FOR ALL USING (true) WITH CHECK (true);

-- User-specific tables: Private read and write by owner
ALTER TABLE public.user_food_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_food_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own food preferences" ON public.user_food_preferences;
CREATE POLICY "Users can view own food preferences" ON public.user_food_preferences 
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own food preferences" ON public.user_food_preferences;
CREATE POLICY "Users can manage own food preferences" ON public.user_food_preferences 
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own food feedback" ON public.user_food_feedback;
CREATE POLICY "Users can view own food feedback" ON public.user_food_feedback 
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own food feedback" ON public.user_food_feedback;
CREATE POLICY "Users can insert own food feedback" ON public.user_food_feedback 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

