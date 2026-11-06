-- Seed: 12 Foundational Exercises for FitMe Exercise Plan
-- Realistic MET values, detailed steps, common mistakes, and progression adjustments

INSERT INTO public.exercises (
    slug,
    name,
    category,
    place,
    equipment,
    level,
    met,
    muscles,
    steps,
    mistakes,
    easier,
    harder,
    avoid_tags,
    default_sets,
    default_reps,
    default_seconds
) VALUES
(
    'brisk-walk',
    'Brisk Walk',
    'cardio',
    'outdoors',
    'none',
    'beginner',
    3.8,
    ARRAY['legs', 'glutes', 'calves', 'cardiovascular'],
    ARRAY[
        'Maintain an upright posture with shoulders relaxed and eyes looking forward.',
        'Bend elbows slightly at 90 degrees and swing arms rhythmically with each stride.',
        'Walk briskly at a pace where your breathing is elevated but you can still hold a conversation.',
        'Land gently on your heel and roll through to push off smoothly from your toes.'
    ],
    ARRAY[
        'Slouching forward or looking down at your feet.',
        'Overstriding, which causes unnecessary joint stress on shins and knees.'
    ],
    'Slow down to an easy strolling pace or take seated marching breaks every 5 minutes.',
    'Increase your walking pace to a power walk, pump your arms vigorously, or walk on an uphill incline.',
    ARRAY[]::text[],
    1,
    1,
    1800
),
(
    'jogging',
    'Jogging',
    'cardio',
    'outdoors',
    'none',
    'regular',
    7.0,
    ARRAY['quads', 'hamstrings', 'glutes', 'calves', 'cardiovascular'],
    ARRAY[
        'Keep your head up, spine neutral, and shoulders relaxed away from ears.',
        'Land midfoot with knees slightly soft on impact to naturally absorb ground force.',
        'Maintain a steady, rhythmic cadence with arms swinging forward and back (not across torso).',
        'Breathe deeply and rhythmically in synchrony with your strides.'
    ],
    ARRAY[
        'Heel striking forcefully on stiff, locked knees.',
        'Crossing arms tightly across your chest, wasting rotational energy and restricting breath.'
    ],
    'Alternate 1 minute of easy jogging with 2 minutes of brisk walking (run-walk intervals).',
    'Increase stride cadence, add short sprint intervals, or jog on undulating hill terrain.',
    ARRAY['knee', 'back', 'heart', 'joint'],
    1,
    1,
    1200
),
(
    'home-circuit',
    'Home Circuit',
    'strength',
    'home',
    'none',
    'regular',
    5.0,
    ARRAY['full_body', 'core', 'legs', 'chest'],
    ARRAY[
        'Cycle through functional bodyweight movements (squats, knee push-ups, planks, and step jacks).',
        'Perform each exercise with controlled tempo for 40-45 seconds.',
        'Take 15-20 seconds of active recovery between movements.',
        'Complete 3 total rounds of the sequence with good posture.'
    ],
    ARRAY[
        'Rushing through reps with compromised form just to beat the clock.',
        'Holding your breath during difficult contractions.'
    ],
    'Perform movements with incline support and double the rest intervals between exercises.',
    'Reduce rest periods to 10 seconds or add explosive tempo on concentric phases.',
    ARRAY['heart'],
    3,
    10,
    900
),
(
    'bodyweight-squat',
    'Bodyweight Squats',
    'strength',
    'home',
    'none',
    'beginner',
    4.5,
    ARRAY['thighs', 'glutes', 'core'],
    ARRAY[
        'Stand with feet shoulder-width apart, toes turned out slightly.',
        'Tighten your belly and keep your chest upright.',
        'Push your hips back and bend your knees, lowering as far as is comfortable.',
        'Keep your knees tracking over your toes and your heels flat on the floor.',
        'Press through your heels to stand up tall.'
    ],
    ARRAY[
        'Knees collapsing inward.',
        'Heels lifting off the floor.',
        'Rounding the lower back.'
    ],
    'Sit down and stand up from a sturdy chair (box squat).',
    'Add a jump squat at the top or pause for 2 seconds at the bottom of the squat.',
    ARRAY['knee'],
    3,
    12,
    360
),
(
    'step-jacks',
    'Step Jacks',
    'cardio',
    'home',
    'none',
    'beginner',
    4.0,
    ARRAY['shoulders', 'calves', 'cardiovascular'],
    ARRAY[
        'Stand tall with feet together and arms resting comfortably at your sides.',
        'Step your right foot out to the side while raising both arms overhead.',
        'Bring your right foot back to center as you lower your arms.',
        'Immediately step your left foot out to the side and raise your arms again.',
        'Continue alternating sides at a brisk, low-impact pace.'
    ],
    ARRAY[
        'Stomping heavily on your feet instead of staying light on toes.',
        'Dropping your arms lazily without full shoulder extension.'
    ],
    'Slow down your foot steps and raise your arms to shoulder height only.',
    'Transition into full plyometric jumping jacks or pick up stepping speed.',
    ARRAY[]::text[],
    3,
    20,
    360
),
(
    'knee-push-up',
    'Knee Push-Ups',
    'strength',
    'home',
    'none',
    'beginner',
    3.5,
    ARRAY['chest', 'shoulders', 'triceps', 'core'],
    ARRAY[
        'Kneel on a soft exercise mat with hands slightly wider than shoulder-width apart.',
        'Create a straight line from your head down to your knees by bracing your core.',
        'Lower your chest toward the floor by bending your elbows at about a 45-degree angle.',
        'Lower until your elbows reach a 90-degree angle.',
        'Press firmly through your palms to return to the top starting position.'
    ],
    ARRAY[
        'Sagging lower back or sticking hips up in the air.',
        'Flaring elbows out sideways at 90 degrees to your torso.'
    ],
    'Perform incline push-ups with hands placed against a sturdy wall or elevated kitchen counter.',
    'Perform full standard push-ups on your toes with chest touching the mat.',
    ARRAY['wrist', 'shoulder'],
    3,
    8,
    360
),
(
    'forearm-plank',
    'Forearm Plank',
    'strength',
    'home',
    'none',
    'beginner',
    3.3,
    ARRAY['core', 'abdominals', 'shoulders', 'glutes'],
    ARRAY[
        'Place your forearms on the floor with elbows directly below your shoulders.',
        'Extend your legs straight back with toes tucked on the mat.',
        'Engage your core, squeeze your glutes, and maintain a straight line from head to heels.',
        'Keep your neck neutral by gazing at the floor between your forearms.',
        'Hold the isometric position steadily while breathing continuously.'
    ],
    ARRAY[
        'Letting your lower back sag toward the floor.',
        'Piking your hips up high into an inverted V-shape.',
        'Holding your breath during the hold.'
    ],
    'Drop your knees to the mat while keeping your core actively braced.',
    'Lift one foot slightly off the floor or extend the duration to 45-60 seconds.',
    ARRAY['back', 'shoulder'],
    3,
    1,
    360
),
(
    'glute-bridge',
    'Glute Bridge',
    'strength',
    'home',
    'none',
    'beginner',
    3.0,
    ARRAY['glutes', 'hamstrings', 'lower_back'],
    ARRAY[
        'Lie on your back with knees bent and feet flat on the floor, hip-width apart.',
        'Rest your arms by your sides with palms facing down.',
        'Drive through your heels to lift your hips toward the ceiling.',
        'Squeeze your glutes tightly at the top so body forms a straight line from shoulders to knees.',
        'Lower your hips slowly back down with control.'
    ],
    ARRAY[
        'Overarching your lower back at the top instead of driving from glutes.',
        'Pushing through your toes instead of driving through heels.'
    ],
    'Do smaller hip raises or place a supportive pillow beneath your pelvis.',
    'Perform single-leg glute bridges or place a resistance loop band above your knees.',
    ARRAY['back'],
    3,
    12,
    360
),
(
    'wall-sit',
    'Wall Sit',
    'strength',
    'home',
    'none',
    'beginner',
    3.5,
    ARRAY['quads', 'glutes', 'calves'],
    ARRAY[
        'Stand with your back flat against a smooth wall, feet shoulder-width apart and 2 feet out from the wall.',
        'Slide your back down the wall until thighs are parallel to the floor (knees bent at 90 degrees).',
        'Ensure your knees are directly above your ankles, never extending past your toes.',
        'Keep your entire back and head pressed firmly against the wall.',
        'Hold the position while maintaining relaxed, even breathing.'
    ],
    ARRAY[
        'Letting knees drift past your toes, placing excess strain on patella.',
        'Resting hands on your knees to take weight off your legs.'
    ],
    'Do not slide down all the way to 90 degrees; hold at a shallower 45-degree knee bend.',
    'Hold a light weight against your chest or extend hold time to 45-60 seconds.',
    ARRAY['knee'],
    3,
    1,
    360
),
(
    'cycling',
    'Cycling',
    'cardio',
    'outdoors',
    'bicycle',
    'regular',
    6.8,
    ARRAY['quads', 'hamstrings', 'calves', 'glutes', 'cardiovascular'],
    ARRAY[
        'Adjust saddle height so your leg has a slight 25-30 degree bend at the bottom of the pedal stroke.',
        'Keep a relaxed grip on handlebars with shoulders down and elbows slightly bent.',
        'Maintain a smooth, continuous circular cadence around 70-90 RPM.',
        'Engage your core lightly to stabilize your pelvis and upper body.'
    ],
    ARRAY[
        'Saddle set too low, which increases compressive knee forces.',
        'Locking out elbows or hunching upper back excessively over the bars.'
    ],
    'Ride on flat terrain at a gentle 8-10 mph leisure pace or use a stationary bike on low resistance.',
    'Add hill climbs, interval sprints, or increase gear resistance.',
    ARRAY['knee', 'heart'],
    1,
    1,
    1800
),
(
    'yoga-flow',
    'Yoga Flow',
    'mobility',
    'home',
    'mat',
    'beginner',
    2.8,
    ARRAY['full_body', 'core', 'spine', 'hip_flexors', 'hamstrings'],
    ARRAY[
        'Begin in Mountain Pose with feet grounded and breathing centered.',
        'Inhale to sweep arms up overhead, exhale to fold forward with knees soft.',
        'Step back into downward facing dog, lengthening your spine and heels toward the floor.',
        'Flow through gentle cat-cow and cobra postures, synchronizing breath with movement.',
        'Finish in child pose to relax your nervous system and release spinal tension.'
    ],
    ARRAY[
        'Forcing deep stretches beyond your comfortable range of motion.',
        'Holding your breath during transitions or balance holds.'
    ],
    'Use yoga blocks under hands and keep knees generously bent during forward folds.',
    'Hold warrior balance poses longer or add chaturanga push-ups between flows.',
    ARRAY[]::text[],
    1,
    1,
    1200
),
(
    'stair-climbing',
    'Stair Climbing',
    'cardio',
    'home',
    'stairs',
    'regular',
    6.5,
    ARRAY['glutes', 'quads', 'calves', 'cardiovascular'],
    ARRAY[
        'Stand tall at the base of the stairs with shoulders back and core engaged.',
        'Step onto each stair with your entire foot, avoiding letting your heel hang off the edge.',
        'Drive through your heel and midfoot to lift your body weight upward.',
        'Ascend at a steady, rhythmic cadence without sprinting.',
        'Walk back down slowly and carefully to recover and protect your knees.'
    ],
    ARRAY[
        'Leaning excessively forward from the waist.',
        'Taking stairs on tiptoes only, straining the Achilles tendon.'
    ],
    'Step up one flight slowly, pausing for 15 seconds at the landing before continuing.',
    'Take two stairs at a time or carry light hand weights.',
    ARRAY['knee', 'heart'],
    1,
    1,
    900
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    place = EXCLUDED.place,
    equipment = EXCLUDED.equipment,
    level = EXCLUDED.level,
    met = EXCLUDED.met,
    muscles = EXCLUDED.muscles,
    steps = EXCLUDED.steps,
    mistakes = EXCLUDED.mistakes,
    easier = EXCLUDED.easier,
    harder = EXCLUDED.harder,
    avoid_tags = EXCLUDED.avoid_tags,
    default_sets = EXCLUDED.default_sets,
    default_reps = EXCLUDED.default_reps,
    default_seconds = EXCLUDED.default_seconds;
