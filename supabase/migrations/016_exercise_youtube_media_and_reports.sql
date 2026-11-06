-- Migration 016: YouTube Exercise Demo Media and Media Problem Reports
-- Adds detailed YouTube embed fields to exercise_media and establishes media_reports table

-- 1. Ensure exercise_media has all required columns
DO $$
BEGIN
    -- Ensure columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'start_seconds') THEN
        ALTER TABLE public.exercise_media ADD COLUMN start_seconds INT DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'end_seconds') THEN
        ALTER TABLE public.exercise_media ADD COLUMN end_seconds INT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'channel_name') THEN
        ALTER TABLE public.exercise_media ADD COLUMN channel_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'license_note') THEN
        ALTER TABLE public.exercise_media ADD COLUMN license_note TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'reviewed_on') THEN
        ALTER TABLE public.exercise_media ADD COLUMN reviewed_on DATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'approved_by') THEN
        ALTER TABLE public.exercise_media ADD COLUMN approved_by TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'is_active') THEN
        ALTER TABLE public.exercise_media ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exercise_media' AND column_name = 'sort_order') THEN
        ALTER TABLE public.exercise_media ADD COLUMN sort_order INT DEFAULT 0;
    END IF;
END $$;

-- 2. Restrict exercise_media permissions:
-- Readable by all signed-in users. Writable only by admin / service_role (no INSERT/UPDATE/DELETE policy for authenticated users)
ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exercise media readable by authenticated users" ON public.exercise_media;
CREATE POLICY "Exercise media readable by authenticated users"
    ON public.exercise_media FOR SELECT TO authenticated
    USING (true);

-- 3. Create media_reports table:
-- Stores user reports regarding video problems. Users can only insert and view their own reports.
CREATE TABLE IF NOT EXISTS public.media_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
    media_id UUID REFERENCES public.exercise_media(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.media_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own media reports" ON public.media_reports;
CREATE POLICY "Users can view their own media reports"
    ON public.media_reports FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own media reports" ON public.media_reports;
CREATE POLICY "Users can insert their own media reports"
    ON public.media_reports FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_exercise_media_exercise_active_sort 
    ON public.exercise_media (exercise_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_media_reports_user_id 
    ON public.media_reports (user_id);

