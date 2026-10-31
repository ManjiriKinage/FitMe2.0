-- ==============================================================================
-- FitMe Migration 012: Feedback-Learning Pipeline, Disaggregated Corrections & Explicit Consent
-- ==============================================================================
-- Purpose:
-- 1. Disaggregate plate scan feedback into separated, auditable columns:
--    - original_prediction (what AI saw)
--    - confirmed_food_labels (what user confirmed)
--    - portion_corrections (portion delta, grams change, portion MAE)
--    - preparation_corrections (oil, cooking method changes)
--    - label_corrections (renamed, added false negatives, deleted false positives)
--    - delta_metrics (overall accuracy, portion MAE, modification counts)
-- 2. Store explicit user consent ('allow_training_consent') and review status.
-- 3. Track dataset partitions ('train', 'val', 'test', 'unassigned') for periodic model evaluation.
-- 4. Strictly preserves all existing user data and RLS policies.
-- ==============================================================================

-- 1. Enhance public.plate_scan_feedback table
ALTER TABLE public.plate_scan_feedback
    ADD COLUMN IF NOT EXISTS confirmed_food_labels JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS portion_corrections JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS preparation_corrections JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS label_corrections JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS delta_metrics JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS dataset_split TEXT DEFAULT 'unassigned',
    ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'gemini-flash-lite-latest',
    ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- 2. Performance indexes for consented dataset export and model pipeline filtering
CREATE INDEX IF NOT EXISTS idx_plate_feedback_consent_status 
    ON public.plate_scan_feedback(allow_training_consent, review_status);

CREATE INDEX IF NOT EXISTS idx_plate_feedback_split 
    ON public.plate_scan_feedback(dataset_split);

CREATE INDEX IF NOT EXISTS idx_plate_feedback_created 
    ON public.plate_scan_feedback(created_at DESC);

-- 3. Enhance public.food_images table to record fine-tuning eligibility
ALTER TABLE public.food_images
    ADD COLUMN IF NOT EXISTS training_eligible BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exported_to_dataset_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_food_images_training_eligible 
    ON public.food_images(allow_training_consent, training_eligible);

