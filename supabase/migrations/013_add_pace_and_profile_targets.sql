-- Migration 013: Add pace column to profiles and ensure bmr, tdee, daily_calorie_target are present
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pace TEXT NOT NULL DEFAULT 'steady'
CHECK (pace IN ('slow', 'steady', 'faster'));

-- Ensure bmr and tdee columns are present
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bmr INTEGER,
ADD COLUMN IF NOT EXISTS tdee INTEGER;

COMMENT ON COLUMN public.profiles.pace IS 'Weight loss/gain pace: slow (0.25 kg/wk), steady (0.5 kg/wk), faster (0.75 kg/wk)';

