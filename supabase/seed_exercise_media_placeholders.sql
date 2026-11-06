-- Seed: YouTube Media Placeholders for FitMe Exercises
-- Generates ONE placeholder row per exercise with youtube_id = 'REPLACE_ME' and is_active = false.
-- You can replace 'REPLACE_ME' with real 11-character YouTube video IDs and set is_active = true.

INSERT INTO public.exercise_media (
    exercise_id,
    type,
    youtube_id,
    start_seconds,
    end_seconds,
    channel_name,
    license_note,
    reviewed_on,
    approved_by,
    is_active,
    sort_order
)
SELECT 
    e.id AS exercise_id,
    'youtube' AS type,
    'REPLACE_ME' AS youtube_id,
    0 AS start_seconds,
    NULL::INT AS end_seconds,
    'Placeholder Channel' AS channel_name,
    'Standard YouTube License' AS license_note,
    CURRENT_DATE AS reviewed_on,
    'Admin' AS approved_by,
    false AS is_active,
    1 AS sort_order
FROM public.exercises e
WHERE e.slug IN (
    'brisk-walk',
    'jogging',
    'home-circuit',
    'bodyweight-squat',
    'step-jacks',
    'knee-push-up',
    'forearm-plank',
    'glute-bridge',
    'wall-sit',
    'cycling',
    'yoga-flow',
    'stair-climbing'
);
