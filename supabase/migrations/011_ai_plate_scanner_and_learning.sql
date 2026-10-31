-- ==============================================================================
-- FitMe Migration 011: AI Plate Scanner, Supabase Storage & Supervised Feedback
-- ==============================================================================
-- Purpose:
-- 1. Create/configure private Supabase Storage bucket 'food_images'.
-- 2. Enhance existing public.food_images table to store meal photo metadata:
--    - user_id, storage_path, image_hash (SHA-256), analysis_status,
--      detected_labels, model_version, timestamps, and model metadata.
-- 3. Configure strict Row Level Security (RLS) on food_images and storage.objects.
-- 4. Create public.plate_scan_feedback table for supervised training candidates.
-- 5. Link public.food_logs with food_image_id.
-- 6. Strictly PRESERVES all user data, profiles, and auth.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. PRIVATE STORAGE BUCKET: food_images
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'food_images',
            'food_images',
            false, -- STRICTLY PRIVATE BUCKET
            10485760, -- 10MB limit per image
            ARRAY['image/jpeg', 'image/png', 'image/webp']
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = 10485760,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
    END IF;
END $$;

-- ==============================================================================
-- 3. UPDATE/CREATE TABLE: public.food_images
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.food_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.food_images
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS food_id UUID REFERENCES public.food_catalog(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS image_hash TEXT,
    ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS detected_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS detected_foods_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS original_ai_prediction_json JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'Meal Plate Scan',
    ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT 'user_upload',
    ADD COLUMN IF NOT EXISTS license_information TEXT,
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS model_provider TEXT DEFAULT 'google',
    ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'gemini-flash-lite-latest',
    ADD COLUMN IF NOT EXISTS analysis_version TEXT DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS allow_training_consent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS token_usage_json JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS correction_details_json JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

-- Ensure food_id is nullable for meal plate images (which may contain multiple foods):
DO $$
BEGIN
    ALTER TABLE public.food_images ALTER COLUMN food_id DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Indexes for performance & quick duplicate hash lookups
CREATE INDEX IF NOT EXISTS idx_food_images_user_id ON public.food_images(user_id);
CREATE INDEX IF NOT EXISTS idx_food_images_user_hash ON public.food_images(user_id, image_hash);
CREATE INDEX IF NOT EXISTS idx_food_images_status ON public.food_images(analysis_status);
CREATE INDEX IF NOT EXISTS idx_food_images_created ON public.food_images(created_at DESC);

-- ==============================================================================
-- 4. LINK food_logs TABLE WITH food_image_id
-- ==============================================================================
ALTER TABLE public.food_logs
    ADD COLUMN IF NOT EXISTS food_image_id UUID REFERENCES public.food_images(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_food_logs_food_image_id ON public.food_logs(food_image_id);

-- ==============================================================================
-- 5. TABLE: public.plate_scan_feedback (Supervised Learning & User Corrections)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.plate_scan_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_image_id UUID REFERENCES public.food_images(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_prediction JSONB NOT NULL DEFAULT '[]'::jsonb,
    user_confirmed_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    action TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'edited', 'deleted'
    allow_training_consent BOOLEAN NOT NULL DEFAULT false,
    review_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved_for_training', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_plate_feedback_user ON public.plate_scan_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_plate_feedback_img ON public.plate_scan_feedback(food_image_id);
CREATE INDEX IF NOT EXISTS idx_plate_feedback_consent ON public.plate_scan_feedback(allow_training_consent);

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- A. food_images RLS (Strict user isolation)
ALTER TABLE public.food_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view food images" ON public.food_images;
DROP POLICY IF EXISTS "Public can manage food images" ON public.food_images;
DROP POLICY IF EXISTS "Users can view own food images" ON public.food_images;
DROP POLICY IF EXISTS "Users can insert own food images" ON public.food_images;
DROP POLICY IF EXISTS "Users can update own food images" ON public.food_images;
DROP POLICY IF EXISTS "Users can delete own food images" ON public.food_images;

CREATE POLICY "Users can view own food images"
    ON public.food_images FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food images"
    ON public.food_images FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food images"
    ON public.food_images FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own food images"
    ON public.food_images FOR DELETE
    USING (auth.uid() = user_id);

-- B. plate_scan_feedback RLS
ALTER TABLE public.plate_scan_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own plate scan feedback" ON public.plate_scan_feedback;
DROP POLICY IF EXISTS "Users can insert own plate scan feedback" ON public.plate_scan_feedback;
DROP POLICY IF EXISTS "Users can update own plate scan feedback" ON public.plate_scan_feedback;
DROP POLICY IF EXISTS "Users can delete own plate scan feedback" ON public.plate_scan_feedback;

CREATE POLICY "Users can view own plate scan feedback"
    ON public.plate_scan_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plate scan feedback"
    ON public.plate_scan_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plate scan feedback"
    ON public.plate_scan_feedback FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own plate scan feedback"
    ON public.plate_scan_feedback FOR DELETE
    USING (auth.uid() = user_id);

-- C. storage.objects RLS (Private bucket authorization)
-- Note: RLS is already enabled by default on storage.objects in Supabase.
-- DO NOT execute "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;" because storage.objects is owned by supabase_storage_admin.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        BEGIN
            -- 1. Insert/Upload: authenticated user can upload only to their user folder
            DROP POLICY IF EXISTS "Users can upload own meal photos" ON storage.objects;
            CREATE POLICY "Users can upload own meal photos"
                ON storage.objects FOR INSERT
                TO authenticated
                WITH CHECK (
                    bucket_id = 'food_images' AND (
                        (storage.foldername(name))[1] = 'user_' || auth.uid()::text OR
                        (storage.foldername(name))[1] = auth.uid()::text
                    )
                );

            -- 2. Select/Download: authenticated user can view/download only their own photos
            DROP POLICY IF EXISTS "Users can view own meal photos" ON storage.objects;
            CREATE POLICY "Users can view own meal photos"
                ON storage.objects FOR SELECT
                TO authenticated
                USING (
                    bucket_id = 'food_images' AND (
                        (storage.foldername(name))[1] = 'user_' || auth.uid()::text OR
                        (storage.foldername(name))[1] = auth.uid()::text
                    )
                );

            -- 3. Update: authenticated user can update only their own photos
            DROP POLICY IF EXISTS "Users can update own meal photos" ON storage.objects;
            CREATE POLICY "Users can update own meal photos"
                ON storage.objects FOR UPDATE
                TO authenticated
                USING (
                    bucket_id = 'food_images' AND (
                        (storage.foldername(name))[1] = 'user_' || auth.uid()::text OR
                        (storage.foldername(name))[1] = auth.uid()::text
                    )
                );

            -- 4. Delete: authenticated user can delete only their own photos
            DROP POLICY IF EXISTS "Users can delete own meal photos" ON storage.objects;
            CREATE POLICY "Users can delete own meal photos"
                ON storage.objects FOR DELETE
                TO authenticated
                USING (
                    bucket_id = 'food_images' AND (
                        (storage.foldername(name))[1] = 'user_' || auth.uid()::text OR
                        (storage.foldername(name))[1] = auth.uid()::text
                    )
                );
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Skipping direct storage.objects policy modification: %', SQLERRM;
        END;
    END IF;
END $$;

