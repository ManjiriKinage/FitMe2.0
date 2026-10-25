-- ==============================================================================
-- FitMe Migration 008: Minimal 3-Table Nutrition Architecture
-- Tables: food_catalog, nutrition_profiles, food_images
-- Scope: Additive migration. Preserves user profiles, food_logs, and auth.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE A: food_catalog
-- Canonical food identities and aliases
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.food_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    category TEXT NOT NULL DEFAULT 'general',
    food_state TEXT NOT NULL DEFAULT 'cooked', -- 'raw', 'cooked', 'prepared'
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_food_catalog_norm_name ON public.food_catalog(normalized_name);
CREATE INDEX IF NOT EXISTS idx_food_catalog_category ON public.food_catalog(category);
CREATE INDEX IF NOT EXISTS idx_food_catalog_aliases ON public.food_catalog USING GIN (aliases);

-- ==============================================================================
-- 3. TABLE B: nutrition_profiles
-- Reusable nutrition data for canonical foods across preparation variants
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nutrition_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.food_catalog(id) ON DELETE CASCADE,
    preparation_method TEXT NOT NULL DEFAULT 'standard',
    nutrition_basis TEXT NOT NULL DEFAULT 'per_100g', -- 'per_100g', 'per_serving'
    basis_weight_g NUMERIC(8,2) NOT NULL DEFAULT 100.0,
    energy_kcal NUMERIC(8,2) NOT NULL,
    energy_kj NUMERIC(8,2),
    protein_g NUMERIC(8,2) NOT NULL DEFAULT 0.0,
    carb_g NUMERIC(8,2) NOT NULL DEFAULT 0.0,
    fat_g NUMERIC(8,2) NOT NULL DEFAULT 0.0,
    fiber_g NUMERIC(8,2),
    default_portion_description TEXT,                  -- e.g. '1 piece', '1 bowl (katori)'
    default_portion_weight_g NUMERIC(8,2),              -- e.g. 35.0, 150.0
    source_type TEXT NOT NULL,                         -- 'reference_dataset', 'ai_estimation', 'clinical_heuristic'
    source_name TEXT NOT NULL,                         -- 'INDB', 'Gemini_1.5_Flash', 'IFCT_2017'
    source_record_id TEXT,                             -- e.g. 'ASC279'
    assumptions TEXT,
    confidence NUMERIC(4,3) DEFAULT 1.0,
    validation_status TEXT NOT NULL DEFAULT 'unverified', -- 'verified', 'unverified', 'needs_review'
    model_provider TEXT,                               -- 'google', 'openai', null
    model_version TEXT,                                -- 'gemini-1.5-flash', null
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    
    CONSTRAINT uq_food_prep_basis UNIQUE (food_id, preparation_method, nutrition_basis)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_food_id ON public.nutrition_profiles(food_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_source ON public.nutrition_profiles(source_type, source_name);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_status ON public.nutrition_profiles(validation_status);

-- ==============================================================================
-- 4. TABLE C: food_images
-- Labeled food images referencing Supabase Storage paths for future recognition
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.food_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.food_catalog(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,                        -- e.g. 'food_images/chapati_01.jpg'
    label TEXT NOT NULL,
    image_source TEXT,                                 -- 'user_upload', 'open_source', 'licensed'
    license_information TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending',     -- 'approved', 'pending', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_food_images_food_id ON public.food_images(food_id);

-- ==============================================================================
-- 5. UPDATE food_logs TABLE (Decouple old FK & add references to new catalog)
-- ==============================================================================
-- Drop old foreign key constraint to recipes if present
ALTER TABLE public.food_logs 
DROP CONSTRAINT IF EXISTS food_logs_recipe_id_fkey;

-- Add references to new 3-table architecture
ALTER TABLE public.food_logs
ADD COLUMN IF NOT EXISTS food_id UUID REFERENCES public.food_catalog(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.nutrition_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_food_logs_food_id ON public.food_logs(food_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_profile_id ON public.food_logs(profile_id);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.food_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_images ENABLE ROW LEVEL SECURITY;

-- food_catalog RLS
DROP POLICY IF EXISTS "Public can view food catalog" ON public.food_catalog;
CREATE POLICY "Public can view food catalog" ON public.food_catalog FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage food catalog" ON public.food_catalog;
CREATE POLICY "Public can manage food catalog" ON public.food_catalog FOR ALL USING (true) WITH CHECK (true);

-- nutrition_profiles RLS
DROP POLICY IF EXISTS "Public can view nutrition profiles" ON public.nutrition_profiles;
CREATE POLICY "Public can view nutrition profiles" ON public.nutrition_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage nutrition profiles" ON public.nutrition_profiles;
CREATE POLICY "Public can manage nutrition profiles" ON public.nutrition_profiles FOR ALL USING (true) WITH CHECK (true);

-- food_images RLS
DROP POLICY IF EXISTS "Public can view food images" ON public.food_images;
CREATE POLICY "Public can view food images" ON public.food_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can manage food images" ON public.food_images;
CREATE POLICY "Public can manage food images" ON public.food_images FOR ALL USING (true) WITH CHECK (true);
