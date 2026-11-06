-- Migration 015: Add Exercise Features, Media, Logs, and Preferences
-- Tables: exercises, exercise_media, exercise_logs, exercise_prefs

-- 1. exercises: Curated catalog of functional movements
CREATE TABLE IF NOT EXISTS public.exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('cardio', 'strength', 'mobility')),
    place TEXT NOT NULL CHECK (place IN ('outdoors', 'home', 'gym')),
    equipment TEXT NOT NULL DEFAULT 'none',
    level TEXT NOT NULL CHECK (level IN ('beginner', 'regular', 'advanced')),
    met NUMERIC NOT NULL CHECK (met > 0),
    muscles TEXT[] NOT NULL DEFAULT '{}',
    steps TEXT[] NOT NULL DEFAULT '{}',
    mistakes TEXT[] NOT NULL DEFAULT '{}',
    easier TEXT,
    harder TEXT,
    avoid_tags TEXT[] NOT NULL DEFAULT '{}',
    default_sets INTEGER NOT NULL DEFAULT 3,
    default_reps INTEGER NOT NULL DEFAULT 12,
    default_seconds INTEGER NOT NULL DEFAULT 360,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exercises are readable by signed-in users" ON public.exercises;
CREATE POLICY "Exercises are readable by signed-in users"
ON public.exercises
FOR SELECT
TO authenticated
USING (true);

-- 2. exercise_media: Optional media demonstrations, author credits, and licenses
CREATE TABLE IF NOT EXISTS public.exercise_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('video', 'image')),
    url TEXT,
    youtube_id TEXT,
    poster_url TEXT,
    author TEXT,
    license_name TEXT,
    license_url TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exercise media is readable by signed-in users" ON public.exercise_media;
CREATE POLICY "Exercise media is readable by signed-in users"
ON public.exercise_media
FOR SELECT
TO authenticated
USING (true);

-- 3. exercise_logs: User workout session records
CREATE TABLE IF NOT EXISTS public.exercise_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'cancelled')),
    name TEXT NOT NULL,
    planned_seconds INTEGER NOT NULL DEFAULT 0,
    completed_seconds INTEGER NOT NULL DEFAULT 0,
    met NUMERIC NOT NULL DEFAULT 3.0,
    weight_kg_used NUMERIC,
    calories_burned NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own exercise logs" ON public.exercise_logs;
CREATE POLICY "Users can manage their own exercise logs"
ON public.exercise_logs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. exercise_prefs: User workout constraints and calorie credit settings
CREATE TABLE IF NOT EXISTS public.exercise_prefs (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    place TEXT NOT NULL DEFAULT 'home' CHECK (place IN ('outdoors', 'home', 'gym')),
    level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'regular', 'advanced')),
    avoid_tags TEXT[] NOT NULL DEFAULT '{}',
    minutes_per_day INTEGER NOT NULL DEFAULT 30,
    addback_mode TEXT NOT NULL DEFAULT 'all' CHECK (addback_mode IN ('off', 'half', 'all')),
    daily_cap INTEGER NOT NULL DEFAULT 500 CHECK (daily_cap >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exercise_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own exercise prefs" ON public.exercise_prefs;
CREATE POLICY "Users can manage their own exercise prefs"
ON public.exercise_prefs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Helpful performance indexes
CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_place ON public.exercises(place);
CREATE INDEX IF NOT EXISTS idx_exercises_level ON public.exercises(level);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON public.exercise_logs(user_id, created_at DESC);
