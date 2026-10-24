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

DROP POLICY IF EXISTS "Public can view recipes" ON public.recipes;
CREATE POLICY "Public can view recipes" ON public.recipes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Public can view recipe ingredients" ON public.recipe_ingredients FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view unit conversions" ON public.unit_conversions;
CREATE POLICY "Public can view unit conversions" ON public.unit_conversions FOR SELECT USING (true);

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
