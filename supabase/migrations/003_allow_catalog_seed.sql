-- Migration 003: Allow Catalog Seed & Public Upsert for Reference Nutrition Data
-- Enables public/anon insertion and updates for catalog reference tables:
-- ingredients, recipes, recipe_ingredients, and unit_conversions.

DROP POLICY IF EXISTS "Public can manage ingredients" ON public.ingredients;
CREATE POLICY "Public can manage ingredients" ON public.ingredients 
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can manage recipes" ON public.recipes;
CREATE POLICY "Public can manage recipes" ON public.recipes 
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can manage recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Public can manage recipe ingredients" ON public.recipe_ingredients 
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can manage unit conversions" ON public.unit_conversions;
CREATE POLICY "Public can manage unit conversions" ON public.unit_conversions 
    FOR ALL USING (true) WITH CHECK (true);
