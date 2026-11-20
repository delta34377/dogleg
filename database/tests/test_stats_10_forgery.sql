-- ============================================================================
-- test_stats_10_forgery.sql — the browser can't forge stats
-- (SECURITY-3, STATS-2, ENTRY-2)
-- ============================================================================
-- The insert trigger must throw away whatever the client sent for the
-- computed columns, read ratings from public.tees and pars from
-- public.courses, and — when its own computation fails — still clear the
-- computed columns instead of keeping the client's values.
--
-- Sections 1-3 insert as the table owner on purpose: security_hardening.sql
-- revokes the computed columns from the API roles, but the trigger must be
-- forgery-proof on its own, whoever inserts. tests.api_insert run as the
-- owner converts JSON to this database's column types like PostgREST does,
-- without the API's grants. Section 4 checks the real API path.
-- ============================================================================

SELECT tests.create_user('alice@forge.test') AS alice \gset
SELECT tests.create_course('forge-course') AS course \gset
SELECT tests.create_course('forge-hard') AS hard_course \gset
-- A much harder tee on another course (slope 150 / rating 76.0)
UPDATE public.tees SET slope = 150, course_rating = 76.0 WHERE tee_id = 'forge-hard-white';


-- ----------------------------------------------------------------------------
-- 1. The SECURITY-3 payload: absurd tee_data ratings (used to overflow
--    numeric(5,1) and fall into the "keep everything" handler), forged
--    differential / Dogleg Score / strokes vs usual / holes, fake pars, and
--    an object-valued achievement label (which white-screens React).
-- ----------------------------------------------------------------------------
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'tee_id', 'forge-course-white',
  'tee_data', '{"slope": 55, "course_rating": -100000, "tee_name": "Forged"}'::jsonb,
  'played_at', '2026-07-01T00:00:00', 'total_score', 100,
  'par', 99, 'course_pars', '[10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10]'::jsonb,
  'created_at', now(),
  'holes_played', 9, 'differential', -10, 'dogleg_score', 10.0, 'strokes_vs_usual', 50,
  'achievements', '[{"type": "x", "label": {"a": 1}}]'::jsonb)) ->> 'id' AS r1 \gset

SELECT tests.assert_eq((SELECT holes_played FROM public.rounds WHERE id = :'r1'), 18,
  'holes_played is computed (client said 9)');
-- (100 - 71.5) x 113 / 130 = 24.8 — the real tee from public.tees
SELECT tests.assert_eq((SELECT differential FROM public.rounds WHERE id = :'r1'), 24.8,
  'differential uses public.tees ratings, not the client''s tee_data (and does not overflow)');
SELECT tests.assert_null((SELECT dogleg_score FROM public.rounds WHERE id = :'r1'),
  'first round: no baseline, so no Dogleg Score (client said 10.0)');
SELECT tests.assert_null((SELECT strokes_vs_usual FROM public.rounds WHERE id = :'r1'),
  'strokes_vs_usual is not kept from the client');
SELECT tests.assert_eq((SELECT achievements FROM public.rounds WHERE id = :'r1'),
  '[{"type": "first_round", "label": "🎉 First round on Dogleg"}]'::jsonb,
  'achievements are made by the server (the object label is gone)');
SELECT tests.assert_eq((SELECT par FROM public.rounds WHERE id = :'r1'), 72,
  'par comes from public.courses (client said 99)');
SELECT tests.assert_eq((SELECT to_jsonb(course_pars) FROM public.rounds WHERE id = :'r1'),
  '[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]'::jsonb,
  'course_pars come from public.courses (client sent all 10s)');
SELECT tests.assert_eq((SELECT tee_data ->> 'tee_name' FROM public.rounds WHERE id = :'r1'), 'Forged',
  'tee_data is kept as sent: it is display-only');


-- ----------------------------------------------------------------------------
-- 2. Forged ratings without a tee_id, and a tee_id from another course
-- ----------------------------------------------------------------------------
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'tee_id', NULL,
  'tee_data', '{"slope": 155, "course_rating": 93}'::jsonb,
  'played_at', '2026-07-02T00:00:00', 'total_score', 95, 'created_at', now())) ->> 'id' AS r2 \gset
-- (95 - 71.5) x 113 / 130 = 20.4, from the course's own (median) tee
SELECT tests.assert_eq((SELECT differential FROM public.rounds WHERE id = :'r2'), 20.4,
  'no tee_id: the course''s median tee is used, never tee_data');

SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'tee_id', 'forge-hard-white',
  'played_at', '2026-07-03T00:00:00', 'total_score', 95, 'created_at', now())) ->> 'id' AS r3 \gset
SELECT tests.assert_eq((SELECT differential FROM public.rounds WHERE id = :'r3'), 20.4,
  'a tee_id from a different (harder) course is ignored');

-- The baseline for that round is the median of 24.8 and 20.4 = 22.6
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'r3'),
  public.dogleg_score_value(22.6, 20.4), 'a real Dogleg Score once there is a baseline');


-- ----------------------------------------------------------------------------
-- 3. The exception path: if the computation itself fails, the round is still
--    saved and every computed column is NULL — never the client's values.
--    Simulated by making dogleg_score_value return a value that overflows
--    numeric(3,1) (the same "numeric field overflow" SECURITY-3 abused).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dogleg_score_value(p_baseline numeric, p_differential numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 123456.7 $$;

SELECT handicap_index AS index_before FROM public.profiles WHERE id = :'alice' \gset

-- (this insert prints the trigger's WARNING; that is expected)
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'tee_id', 'forge-course-white',
  'played_at', '2026-07-04T00:00:00', 'total_score', 70, 'created_at', now(),
  'holes_played', 18, 'differential', -9.9, 'dogleg_score', 9.9, 'strokes_vs_usual', 30,
  'achievements', '[{"type": "personal_best", "label": "Verified scratch golfer - DM me"}]'::jsonb))
  ->> 'id' AS r4 \gset

SELECT tests.assert_eq(
  (SELECT ARRAY[holes_played::numeric, differential, dogleg_score, strokes_vs_usual]
   FROM public.rounds WHERE id = :'r4'),
  ARRAY[NULL, NULL, NULL, NULL]::numeric[],
  'stats failed: holes_played, differential, dogleg_score and strokes_vs_usual are all NULL');
SELECT tests.assert_null((SELECT achievements FROM public.rounds WHERE id = :'r4'),
  'stats failed: the forged achievements are not kept');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'),
  :'index_before'::numeric, 'the forged differential never reaches the handicap index');

-- Put the real function back (re-running the migration must be safe anyway)
\ir ../stats_layer.sql


-- ----------------------------------------------------------------------------
-- 4. Through the API (as the browser): computed columns are either refused
--    (42501, once security_hardening.sql revokes them) or discarded; and
--    created_at, which orders same-day rounds, is the server's clock.
-- ----------------------------------------------------------------------------
SELECT has_column_privilege('authenticated', 'public.rounds', 'dogleg_score', 'INSERT')
       AS api_can_send_computed \gset

SELECT tests.login_as(:'alice');
SET ROLE authenticated;

\if :api_can_send_computed
  SELECT tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', :'alice', 'course_id', :'course', 'tee_id', 'forge-course-white',
    'played_at', '2026-07-05T00:00:00', 'total_score', 90,
    'dogleg_score', 10.0, 'differential', -5, 'achievements', '[{"label": {"x": 1}}]'::jsonb))
    AS forged_api \gset
  SELECT tests.assert_eq((:'forged_api'::jsonb ->> 'differential')::numeric, 16.1,
    'API insert: differential computed by the server ((90 - 71.5) x 113 / 130)');
  SELECT tests.assert_true(
    (SELECT bool_and(jsonb_typeof(a -> 'label') = 'string')
     FROM jsonb_array_elements(:'forged_api'::jsonb -> 'achievements') a),
    'API insert: every achievement label is a string');
\else
  SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', %L, 'course_id', %L, 'played_at', '2026-07-05T00:00:00', 'total_score', 90,
    'dogleg_score', 10.0))$q$, :'alice', :'course'), '42501');
\endif

SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'tee_id', 'forge-course-white',
  'played_at', '2026-07-06T00:00:00', 'total_score', 91,
  'created_at', '2020-01-01T00:00:00Z')) ->> 'id' AS r6 \gset
RESET ROLE;
SELECT tests.logout();

SELECT tests.assert_true(
  (SELECT created_at > now() - interval '1 hour' FROM public.rounds WHERE id = :'r6'),
  'API insert: created_at is set by the server (client sent 2020)');


-- ----------------------------------------------------------------------------
-- 5. Across everything Alice posted: every badge label is a plain string
--    (AchievementBadges renders a.label)
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.rounds r, jsonb_array_elements(coalesce(r.achievements, '[]')) a
   WHERE r.user_id = :'alice' AND jsonb_typeof(a -> 'label') <> 'string'),
  0, 'no stored achievement has a non-string label');
