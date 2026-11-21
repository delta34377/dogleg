-- ============================================================================
-- test_stats_50_rerun.sql — re-running stats_layer.sql never rewrites
-- history; stats_backfill.sql gives the same answers as live posting
-- ============================================================================
-- 1. Build a varied history through the API (in order and backdated posts,
--    nines with and without a handicap, hole-by-hole rounds with birdies,
--    same-day rounds, a deleted and a hidden round, a 10th-round milestone).
-- 2. Re-run stats_layer.sql twice: no stored value may change.
-- 3. Tamper with one round (as if it held values from an older engine):
--    re-running stats_layer.sql must leave it alone; stats_backfill.sql
--    repairs it and changes nothing else — so the live, incremental path and
--    the full recompute agree on everything.
-- 4. Run stats_backfill.sql again: still nothing changes.
-- ============================================================================

SELECT tests.create_course('rr-course') AS course \gset
SELECT tests.create_course('rr-other') AS other \gset
SELECT tests.create_course('rr-nine', 9) AS nine \gset

CREATE FUNCTION pg_temp.post(p_email text, p_date text, p_total int, p_extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  uid uuid := tests.user_id(p_email);
  new_id uuid;
BEGIN
  PERFORM tests.login_as(uid);
  SET LOCAL ROLE authenticated;
  new_id := (tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', uid, 'course_id', 'rr-course', 'tee_id', 'rr-course-white',
    'played_at', p_date || 'T00:00:00', 'total_score', p_total) || p_extra) ->> 'id')::uuid;
  RESET ROLE;
  PERFORM tests.logout();
  RETURN new_id;
END;
$$;

-- Everything computed, for every round (hidden ones too) and every profile
CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'rounds', (SELECT jsonb_object_agg(id, jsonb_build_array(
                 holes_played, differential, dogleg_score, strokes_vs_usual, achievements))
               FROM public.rounds),
    'indexes', (SELECT jsonb_object_agg(id, handicap_index) FROM public.profiles))
$$;

SELECT tests.create_user('u1@rr.test');
SELECT tests.create_user('u2@rr.test');
SELECT tests.create_user('u3@rr.test');
SELECT tests.create_user('u4@rr.test');
SELECT tests.create_user('u5@rr.test');
UPDATE public.profiles SET handicap = 18 WHERE username = 'u3';

-- u1: hole-by-hole rounds with birdies, in order, two courses
SELECT pg_temp.post('u1@rr.test', '2026-06-01', 88,
  '{"scores_by_hole": [3,5,4,6,5,5,4,6,5,5,5,4,6,5,5,4,5,6]}');
SELECT pg_temp.post('u1@rr.test', '2026-06-08', 84,
  '{"scores_by_hole": [3,3,3,5,5,5,4,6,5,5,5,4,6,5,5,4,5,6]}');
SELECT pg_temp.post('u1@rr.test', '2026-06-15', 86,
  '{"course_id": "rr-other", "tee_id": "rr-other-white", "scores_by_hole": [4,4,3,5,5,5,4,6,5,5,5,4,6,5,5,4,5,6]}');
SELECT pg_temp.post('u1@rr.test', '2026-06-22', 81,
  '{"scores_by_hole": [3,3,2,5,4,5,4,6,5,4,5,4,5,5,5,4,5,7]}');

-- u2: backdated posts mixing 18s and nines, no handicap
SELECT pg_temp.post('u2@rr.test', '2026-07-20', 96, '{"holes_declared": 18}');
SELECT pg_temp.post('u2@rr.test', '2026-07-05', 48, '{"front9": 48, "holes_declared": 9}');
SELECT pg_temp.post('u2@rr.test', '2026-07-12', 47, '{"back9": 47, "holes_declared": 9}');
SELECT pg_temp.post('u2@rr.test', '2026-07-01', 99, '{"holes_declared": 18}');
SELECT pg_temp.post('u2@rr.test', '2026-07-25', 50, '{"holes_declared": 9}');
SELECT pg_temp.post('u2@rr.test', '2026-07-03', 101, '{"holes_declared": 18}');

-- u3: manual handicap, nines on a nine-hole course and an 18
SELECT pg_temp.post('u3@rr.test', '2026-07-02', 46, '{"course_id": "rr-nine", "tee_id": "rr-nine-white"}');
SELECT pg_temp.post('u3@rr.test', '2026-07-09', 44, '{"course_id": "rr-nine", "tee_id": "rr-nine-white"}');
SELECT pg_temp.post('u3@rr.test', '2026-07-04', 93, '{"holes_declared": 18}');

-- u4: same-day rounds and ten rounds (the "Round #10" milestone)
SELECT pg_temp.post('u4@rr.test', '2026-08-01', 90);
SELECT pg_temp.post('u4@rr.test', '2026-08-01', 87);
SELECT pg_temp.post('u4@rr.test', '2026-08-0' || d, 85 + d) FROM generate_series(2, 9) d ORDER BY d;

-- u5: a deleted round and a hidden one
SELECT pg_temp.post('u5@rr.test', '2026-08-01', 95);
SELECT pg_temp.post('u5@rr.test', '2026-08-02', 82) AS u5_gone \gset
SELECT pg_temp.post('u5@rr.test', '2026-08-03', 91) AS u5_hidden \gset
SELECT pg_temp.post('u5@rr.test', '2026-08-04', 89);
DELETE FROM public.rounds WHERE id = :'u5_gone';
UPDATE public.rounds SET is_deleted = true WHERE id = :'u5_hidden';

-- (sanity: the history is not trivial)
SELECT tests.assert_true(
  (SELECT count(*) FILTER (WHERE achievements @> '[{"type": "most_birdies"}]') >= 1
      AND count(*) FILTER (WHERE achievements @> '[{"type": "rounds_milestone"}]') = 1
      AND count(*) FILTER (WHERE holes_played = 9 AND differential IS NOT NULL) >= 4
   FROM public.rounds),
  'setup: birdie records, a milestone and converted nines exist');


-- ----------------------------------------------------------------------------
-- 2. Re-running stats_layer.sql (twice) changes no stored value
-- ----------------------------------------------------------------------------
SELECT pg_temp.snapshot() AS before \gset
\ir ../stats_layer.sql
\ir ../stats_layer.sql
SELECT tests.assert_eq(pg_temp.snapshot(), :'before'::jsonb,
  're-running stats_layer.sql twice leaves every round and index unchanged');


-- ----------------------------------------------------------------------------
-- 3. A round holding values from an older engine is left alone by a re-run
--    and repaired by the backfill (which changes nothing else)
-- ----------------------------------------------------------------------------
SELECT id AS tampered FROM public.rounds WHERE user_id = tests.user_id('u1@rr.test')
ORDER BY played_at DESC LIMIT 1 \gset
UPDATE public.rounds
SET dogleg_score = 9.9, strokes_vs_usual = 42, achievements = '[{"type": "legacy", "label": "old badge"}]'
WHERE id = :'tampered';

\ir ../stats_layer.sql
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'tampered'), 9.9,
  'stats_layer.sql does not rewrite an existing round');

\ir ../stats_backfill.sql
SELECT tests.assert_eq(pg_temp.snapshot(), :'before'::jsonb,
  'stats_backfill.sql: same results as live posting, and the old values are repaired');

\ir ../stats_backfill.sql
SELECT tests.assert_eq(pg_temp.snapshot(), :'before'::jsonb,
  'running stats_backfill.sql again changes nothing');
