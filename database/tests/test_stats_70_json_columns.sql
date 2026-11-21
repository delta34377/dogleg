-- ============================================================================
-- test_stats_70_json_columns.sql — every column whose production type is
-- uncertain can be `json` (SQL-2)
-- ============================================================================
-- json, unlike jsonb, has no "=" operator: `a IS DISTINCT FROM b`, DISTINCT,
-- GROUP BY or a row comparison over a json value is an error ("operator does
-- not exist: json = json", "could not identify an equality operator for type
-- json"), not just false. An earlier
-- draft compared scores_by_hole directly in the score-limit trigger, so on a
-- database where it is json EVERY post failed, from the old app and the new.
--
-- Here scores_by_hole, course_pars, stats_by_hole, achievements and tee_data
-- are all turned into json, the migrations are run again (as the founder
-- would on such a database), and every path that compares or rewrites those
-- columns is exercised. MOCK_SCORES_TYPE=json runs the whole suite with
-- scores_by_hole / course_pars as json; this file also covers the columns
-- stats_layer.sql itself adds.
--
-- Course: rated 71.5 / 130, pars 4,4,3,5,4,4,3,5,4 twice (72).
-- ============================================================================

SELECT tests.create_course('js-course') AS course \gset
SELECT tests.create_user('carol@js.test') AS carol \gset
SELECT tests.create_user('dave@js.test') AS dave \gset
SELECT tests.create_user('erin@js.test') AS erin \gset

-- ---- turn the uncertain columns into json ------------------------------------
-- (the triggers name scores_by_hole in their UPDATE OF lists, which blocks a
-- type change; stats_layer.sql re-creates them below)
DROP TRIGGER trg_dogleg_check_round ON public.rounds;
DROP TRIGGER trg_dogleg_round_after_change ON public.rounds;
ALTER TABLE public.rounds
  ALTER COLUMN scores_by_hole TYPE json USING to_json(scores_by_hole),
  ALTER COLUMN course_pars    TYPE json USING to_json(course_pars),
  ALTER COLUMN stats_by_hole  TYPE json USING to_json(stats_by_hole),
  ALTER COLUMN achievements   TYPE json USING to_json(achievements),
  ALTER COLUMN tee_data       TYPE json USING to_json(tee_data);

\ir ../stats_layer.sql
\ir ../feed_algorithm.sql
\ir ../security_hardening.sql
\ir ../repair_nine_hole_totals.sql

SELECT tests.assert_eq(
  (SELECT array_agg(attname::text || ' ' || format_type(atttypid, atttypmod) ORDER BY attname)
   FROM pg_attribute
   WHERE attrelid = 'public.rounds'::regclass
     AND attname IN ('achievements', 'course_pars', 'scores_by_hole', 'stats_by_hole', 'tee_data')),
  ARRAY['achievements json', 'course_pars json', 'scores_by_hole json',
        'stats_by_hole json', 'tee_data json'],
  'setup: the uncertain columns are json, and the migrations left them so');


-- Everything the stats engine computes for one golfer, oldest round first
CREATE FUNCTION pg_temp.stats_of(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'index', (SELECT handicap_index FROM public.profiles WHERE id = p_user),
    'rounds', (SELECT jsonb_agg(jsonb_build_object(
                 'date', played_at::date, 'total', total_score, 'holes', holes_played,
                 'differential', differential, 'dogleg_score', dogleg_score,
                 'strokes_vs_usual', strokes_vs_usual, 'achievements', achievements,
                 'total_putts', total_putts)
               ORDER BY played_at, created_at)
               FROM public.rounds
               WHERE user_id = p_user AND (is_deleted IS NULL OR is_deleted = false)))
$$;

-- Post a hole-by-hole round (2 putts a hole) through the API, as ScoreEntry does
CREATE FUNCTION pg_temp.post(p_user uuid, p_date text, p_scores int[])
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  new_id uuid;
BEGIN
  PERFORM tests.login_as(p_user);
  SET LOCAL ROLE authenticated;
  new_id := (tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', p_user, 'course_id', 'js-course', 'tee_id', 'js-course-white',
    'tee_data', (SELECT to_jsonb(t) FROM public.tees t WHERE t.tee_id = 'js-course-white'),
    'played_at', p_date || 'T00:00:00', 'holes_declared', 18,
    'total_score', (SELECT sum(s) FROM unnest(p_scores) s),
    'scores_by_hole', to_jsonb(p_scores),
    'stats_by_hole', (SELECT jsonb_agg(jsonb_build_object('putts', 2)) FROM unnest(p_scores)),
    'par', 72, 'course_pars', '[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]'::jsonb)) ->> 'id')::uuid;
  RESET ROLE;
  PERFORM tests.logout();
  RETURN new_id;
END;
$$;

-- pars + 1 on every hole = 90; pars on the first three holes = 87; +2 = 108
SELECT ARRAY[5,5,4,6,5,5,4,6,5,5,5,4,6,5,5,4,6,5] AS s90,
       ARRAY[4,4,3,6,5,5,4,6,5,5,5,4,6,5,5,4,6,5] AS s87,
       ARRAY[6,6,5,7,6,6,5,7,6,6,6,5,7,6,6,5,7,6] AS s108 \gset


-- ----------------------------------------------------------------------------
-- A. Posting (score-limit trigger, stats trigger) and a backdated post
--    (re-score, which compares achievements). Carol posts newest first,
--    Dave in date order; they must end up the same.
-- ----------------------------------------------------------------------------
SELECT pg_temp.post(:'carol', '2026-07-15', :'s108');
SELECT pg_temp.post(:'carol', '2026-07-08', :'s87');
SELECT pg_temp.post(:'carol', '2026-07-01', :'s90') AS carol_jul1 \gset

SELECT pg_temp.post(:'dave', '2026-07-01', :'s90');
SELECT pg_temp.post(:'dave', '2026-07-08', :'s87');
SELECT pg_temp.post(:'dave', '2026-07-15', :'s108');

SELECT tests.assert_eq(
  (SELECT array_agg(differential ORDER BY played_at) FROM public.rounds WHERE user_id = :'dave'),
  ARRAY[16.1, 13.5, 31.7]::numeric[],
  'hole-by-hole rounds get differentials with json columns');
SELECT tests.assert_eq(
  (SELECT array_agg(total_putts ORDER BY played_at) FROM public.rounds WHERE user_id = :'dave'),
  ARRAY[36, 36, 36], 'total_putts is derived from a json stats_by_hole');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'dave'), 11.5,
  'index = lowest of 3 differentials (13.5) - 2.0');
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.rounds WHERE user_id = :'carol'
     AND achievements::jsonb @> '[{"type": "first_round"}]'), 1,
  'backdated posts: one "First round" badge');
SELECT tests.assert_eq(pg_temp.stats_of(:'carol'), pg_temp.stats_of(:'dave'),
  'backdated posts re-score with json columns (newest-first = date order)');


-- ----------------------------------------------------------------------------
-- B. Editing hole scores through the API (score-limit trigger on UPDATE and
--    the after-change trigger both compare the old and new scores_by_hole)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.expect_error(
  format('SELECT tests.api_update(%L, %L, %L)', 'public.rounds',
         jsonb_build_object('scores_by_hole', '[5,5,4,6,5,5,4,6,5,5,5,4,6,5,5,4,6,25]'::jsonb),
         format('id = %L', :'carol_jul1')),
  '23514', 'Hole 18 score%');
SELECT tests.assert_eq(
  tests.api_update('public.rounds',
    jsonb_build_object('scores_by_hole', '[4,4,3,6,5,5,4,6,5,5,5,4,6,5,5,4,6,5]'::jsonb, 'total_score', 87),
    format('id = %L', :'carol_jul1')), 1,
  'Carol corrects her Jul 1 card to an 87');
-- an update that sends the same scores again is fine
SELECT tests.assert_eq(
  tests.api_update('public.rounds',
    jsonb_build_object('scores_by_hole', '[4,4,3,6,5,5,4,6,5,5,5,4,6,5,5,4,6,5]'::jsonb, 'caption', 'fixed'),
    format('id = %L', :'carol_jul1')), 1,
  'saving the same scores again works');
RESET ROLE;
SELECT tests.logout();

SELECT tests.assert_eq((SELECT differential FROM public.rounds WHERE id = :'carol_jul1'), 13.5,
  'the edited round was re-scored');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'carol'), 11.5,
  'index after the edit: lowest (13.5) - 2.0');


-- ----------------------------------------------------------------------------
-- C. Delete and hide (re-score), the backfill and the repair helper
-- ----------------------------------------------------------------------------
DELETE FROM public.rounds WHERE id = :'carol_jul1';
SELECT tests.assert_eq(
  (SELECT array_agg(played_at::date ORDER BY played_at) FROM public.rounds
   WHERE user_id = :'carol' AND achievements::jsonb @> '[{"type": "first_round"}]'),
  ARRAY['2026-07-08']::date[], 'delete: the "First round" badge moves to the next round');

UPDATE public.rounds SET is_deleted = true
WHERE user_id = :'dave' AND played_at::date = '2026-07-15';
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'dave'), NULL::numeric,
  'hide: 2 differentials left, no index');

SELECT pg_temp.stats_of(:'carol') AS carol_good \gset
UPDATE public.rounds SET achievements = NULL, dogleg_score = NULL WHERE user_id = :'carol';
\ir ../stats_backfill.sql
SELECT tests.assert_eq(pg_temp.stats_of(:'carol'), :'carol_good'::jsonb,
  'stats_backfill.sql runs and restores the stats with json columns');

SELECT (public.dogleg_set_holes_declared(id, 9) ->> 'holes_played')::int AS holes_now
FROM public.rounds WHERE user_id = :'carol' AND played_at::date = '2026-07-08' \gset
SELECT tests.assert_eq(:holes_now, 18,
  'dogleg_set_holes_declared runs (hole-by-hole scores still decide: 18 holes)');


-- ----------------------------------------------------------------------------
-- D. The read RPCs: stats, course page, share link, feed
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'erin');
SET ROLE authenticated;
SELECT tests.api_insert('public.follows', jsonb_build_object('follower_id', :'erin', 'following_id', :'carol'));
SELECT tests.assert_eq(
  (public.get_user_stats(:'carol') -> 'hole_stats' ->> 'holes_recorded')::int, 36,
  'get_user_stats reads json hole scores');
SELECT tests.assert_eq(
  (public.get_user_stats(:'carol') -> 'hole_stats' ->> 'putts_avg')::numeric, 2.00,
  'get_user_stats reads json putts');
SELECT tests.assert_eq((public.get_course_page('js-course') ->> 'rounds_count')::int, 4,
  'get_course_page works');
SELECT tests.assert_eq(
  jsonb_array_length(public.get_feed_chronological_mixed(10, 0, 'mixed', 0.3) -> 'rounds'), 2,
  'the live feed shows Erin the rounds of people she follows');
RESET ROLE;
SELECT tests.logout();

SELECT short_code AS code FROM public.rounds WHERE user_id = :'carol' ORDER BY played_at LIMIT 1 \gset
SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.assert_eq(
  jsonb_array_length(public.get_public_round(:'code') -> 'round' -> 'scores_by_hole'), 18,
  'get_public_round returns the json hole scores');
RESET ROLE;
SELECT tests.logout();
