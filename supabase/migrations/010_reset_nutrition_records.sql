-- ==============================================================================
-- FitMe Migration 010: Reset Nutrition Records (Clean Architecture Restart)
-- ==============================================================================
--
-- SAFEGUARDS:
-- 1. Strictly PRESERVES auth.users and public.profiles (user accounts, biometrics, goals intact).
-- 2. Strictly PRESERVES table schemas for food_logs, food_catalog, nutrition_profiles, food_images.
-- 3. Clears old imported nutrition rows so the new system starts with empty catalog and profiles.
-- 4. Clears historical food_logs so users start with a clean meal log history.
-- ==============================================================================

-- Step 1: Clear existing meal logs (preserving table structure)
DELETE FROM public.food_logs;

-- Step 2: Clear food images metadata
DELETE FROM public.food_images;

-- Step 3: Clear nutrition profiles
DELETE FROM public.nutrition_profiles;

-- Step 4: Clear canonical food catalog (start fresh with 0 items)
DELETE FROM public.food_catalog;

-- ==============================================================================
-- Verification queries (run to verify counts)
-- ==============================================================================
-- SELECT count(*) AS remaining_profiles FROM public.profiles;         -- Must be unchanged
-- SELECT count(*) AS remaining_food_logs FROM public.food_logs;       -- Should be 0
-- SELECT count(*) AS remaining_catalog FROM public.food_catalog;      -- Should be 0
-- SELECT count(*) AS remaining_profiles FROM public.nutrition_profiles;-- Should be 0
