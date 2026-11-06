-- Migration 015: FitMe Exercise System Architecture
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Exercises Catalog Table
CREATE TABLE IF NOT EXISTS public.exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('cardio', 'strength', 'mobility')),
    place TEXT NOT NULL CHECK (place IN ('outdoors', 'home', 'gym')),
    equipment TEXT NOT NULL DEFAULT 'none',
    level TEXT NOT NULL CHECK (level IN ('beginner', 'regular', 'advanced')),
    met NUMERIC(4, 2) NOT NULL DEFAULT 3.0,
    muscles TEXT[] NOT NULL DEFAULT '{}',
    steps TEXT[] NOT NULL DEFAULT '{}',
    mistakes TEXT[] NOT NULL DEFAULT '{}',
    easier TEXT,
    harder TEXT,
    avoid_tags TEXT[] NOT NULL DEFAULT '{}',
    default_sets INT NOT NULL DEFAULT 3,
    default_reps INT NOT NULL DEFAULT 10,
    default_seconds INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Exercise Media Table (Base)
CREATE TABLE IF NOT EXISTS public.exercise_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'youtube',
    youtube_id TEXT,
    poster_url TEXT,
    author TEXT,
    license_name TEXT,
    license_url TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Exercise Logs Table
CREATE TABLE IF NOT EXISTS public.exercise_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'cancelled')),
    name TEXT NOT NULL,
    planned_seconds INT NOT NULL DEFAULT 0,
    completed_seconds INT NOT NULL DEFAULT 0,
    met NUMERIC(4, 2) NOT NULL DEFAULT 3.0,
    weight_kg_used NUMERIC(5, 2) NOT NULL DEFAULT 70.0,
    calories_burned NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Exercise Preferences Table
CREATE TABLE IF NOT EXISTS public.exercise_prefs (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    place TEXT NOT NULL DEFAULT 'home',
    level TEXT NOT NULL DEFAULT 'beginner',
    avoid_tags TEXT[] NOT NULL DEFAULT '{}',
    minutes_per_day INT NOT NULL DEFAULT 30,
    addback_mode TEXT NOT NULL DEFAULT 'all' CHECK (addback_mode IN ('off', 'half', 'all')),
    daily_cap INT NOT NULL DEFAULT 500,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_prefs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Exercises readable by authenticated users') THEN
        CREATE POLICY "Exercises readable by authenticated users"
            ON public.exercises FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Exercise media readable by authenticated users') THEN
        CREATE POLICY "Exercise media readable by authenticated users"
            ON public.exercise_media FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access only their own exercise logs') THEN
        CREATE POLICY "Users access only their own exercise logs"
            ON public.exercise_logs FOR ALL TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access only their own exercise prefs') THEN
        CREATE POLICY "Users access only their own exercise prefs"
            ON public.exercise_prefs FOR ALL TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON public.exercise_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercises_slug ON public.exercises (slug);
