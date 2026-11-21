-- ============================================================================
-- test_stats_90_perf.sql — posting stays fast for a golfer with a long
-- history (STATS-8)
-- ============================================================================
-- One golfer with 300 rounds (two thirds hole-by-hole with birdies). A
-- normal post and a backdated post (which re-scores every later round) must
-- each take well under 2 seconds. Measured on the harness in November 2026:
-- about 40 ms and 0.5 s. Before the rewrite a normal post took about 0.5 s
-- here (re-parsing every earlier scorecard for "most birdies") and a
-- backdated post re-scored nothing at all.
-- Run with VERBOSE=1 to see the timings.
-- ============================================================================

SELECT tests.create_user('perf@perf.test') AS perf \gset
SELECT tests.create_course('perf-course') AS course \gset

-- Load 300 rounds quickly: stats triggers off, then one full re-score
ALTER TABLE public.rounds DISABLE TRIGGER trg_dogleg_round_before_insert;
ALTER TABLE public.rounds DISABLE TRIGGER trg_dogleg_round_after_change;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'perf', 'course_id', :'course', 'tee_id', 'perf-course-white',
  'played_at', to_char(date '2024-01-01' + i, 'YYYY-MM-DD"T00:00:00"'),
  'created_at', timestamptz '2024-01-01' + i * interval '1 day',
  'total_score', CASE WHEN i % 3 = 0 THEN 85 + i % 15 ELSE 73 END,
  'scores_by_hole', CASE WHEN i % 3 = 0 THEN NULL
                         -- par 72 card with one birdie and one double
                         ELSE (SELECT jsonb_agg(CASE WHEN h = 1 + i % 18 THEN p - 1
                                                     WHEN h = 1 + (i * 7 + 3) % 18 THEN p + 2
                                                     ELSE p END ORDER BY h)
                               FROM unnest('{4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4}'::int[])
                                    WITH ORDINALITY AS c(p, h)) END))
FROM generate_series(1, 300) i;
ALTER TABLE public.rounds ENABLE TRIGGER trg_dogleg_round_before_insert;
ALTER TABLE public.rounds ENABLE TRIGGER trg_dogleg_round_after_change;

SELECT public.dogleg_rebuild_user(:'perf', NULL);
SELECT tests.assert_eq(
  (SELECT count(*) FILTER (WHERE differential IS NOT NULL) FROM public.rounds WHERE user_id = :'perf'),
  300, '(setup) 300 scored rounds');

CREATE TEMP TABLE timings (what text, ms numeric);

-- Each timed post is one statement, triggers included, run as the browser
CREATE FUNCTION pg_temp.timed_post(p_label text, p_payload jsonb) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
  t0 timestamptz;
  ms numeric;
BEGIN
  PERFORM tests.login_as((p_payload ->> 'user_id')::uuid);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  PERFORM tests.api_insert('public.rounds', p_payload);
  ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000);
  RESET ROLE;
  PERFORM tests.logout();
  INSERT INTO timings VALUES (p_label, ms);
  RAISE NOTICE '% took % ms', p_label, ms;
  RETURN ms;
END;
$$;

SELECT pg_temp.timed_post('normal post (newest round, hole-by-hole)', jsonb_build_object(
  'user_id', :'perf', 'course_id', :'course', 'tee_id', 'perf-course-white',
  'played_at', '2026-11-01T00:00:00', 'total_score', 70, 'holes_declared', 18,
  'scores_by_hole', '[3,4,3,4,4,4,3,4,4,4,4,3,5,4,4,3,5,5]'::jsonb));

SELECT pg_temp.timed_post('backdated post (re-scores all 301 later rounds)', jsonb_build_object(
  'user_id', :'perf', 'course_id', :'course', 'tee_id', 'perf-course-white',
  'played_at', '2023-06-01T00:00:00', 'total_score', 88, 'holes_declared', 18,
  'scores_by_hole', '[4,5,3,5,4,5,3,6,5,4,4,4,5,5,4,4,6,6]'::jsonb));

SELECT tests.assert_true(
  (SELECT ms FROM timings WHERE what LIKE 'normal%') < 2000,
  'a normal post with 300 earlier rounds takes under 2 s');
SELECT tests.assert_true(
  (SELECT ms FROM timings WHERE what LIKE 'backdated%') < 2000,
  'a backdated post that re-scores 301 rounds takes under 2 s');

-- The backdated round really did re-score everything after it
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.rounds
   WHERE user_id = :'perf' AND achievements @> '[{"type": "first_round"}]'), 1,
  'one "First round" badge, on the backdated round');
