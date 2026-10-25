-- ==============================================================================
-- FitMe Migration 009: Retire Obsolete Nutrition Tables
-- WARNING: Destructive migration. Run ONLY after Migration 008 and data migration have succeeded.
-- ==============================================================================

-- Drop old tables in strict reverse-dependency order:

-- 1. Recipe Ingredients (references recipes & ingredients)
DROP TABLE IF EXISTS public.recipe_ingredients CASCADE;

-- 2. Raw Ingredients (deprecated ingredient-decomposition)
DROP TABLE IF EXISTS public.ingredients CASCADE;

-- 3. User Food Preferences & Feedback (deprecated learning tables)
DROP TABLE IF EXISTS public.user_food_preferences CASCADE;
DROP TABLE IF EXISTS public.user_food_feedback CASCADE;

-- 4. Temporary Review Table (deprecated review audit table)
DROP TABLE IF EXISTS public.nutrition_correction_reviews CASCADE;

-- 5. Unit Conversions (migrated into nutrition_profiles default_portion_weight_g)
DROP TABLE IF EXISTS public.unit_conversions CASCADE;

-- 6. Recipes (canonical foods migrated to food_catalog & nutrition_profiles)
DROP TABLE IF EXISTS public.recipes CASCADE;
