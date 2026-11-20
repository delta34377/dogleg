-- ============================================================================
-- test_stats_35_legacy_totals.sql — an old round with a total outside 9-200
-- must not stop the golfer's re-scoring (SQL-1 / ENTRY-1)
-- ============================================================================
-- The old app accepted any total above 0, so production can hold rounds such
-- as a one-hole hole-by-hole save with a total of 4. stats_layer.sql leaves
-- them alone. An earlier draft also added a NOT VALID table CHECK on the
-- total. Postgres checks a CHECK on every UPDATE of a row, so the stats
-- engine's own UPDATE of such a row (taking its "First round" badge away
-- after a backdated post, say) failed. The after-change trigger swallowed the
-- error as a WARNING and rolled the whole re-score back: stale handicap index,
-- two "First round" badges, later rounds not re-scored, and the golfer
-- skipped by stats_backfill.sql.
--
-- Alice has such a round; Bob, the control, played the same real rounds and
-- has none. Their differentials, Dogleg Scores and index must always match,
-- and Alice must always have exactly one "First round" badge.
--
-- Course: rated 71.5 / 130. 18-hole differential = (total - 71.5) x 113 / 130:
-- 97 -> 22.2, 95 -> 20.4, 92 -> 17.8, 90 -> 16.1, 85 -> 11.7, 80 -> 7.4.
-- ============================================================================

SELECT tests.create_course('lg-course') AS course \gset
SELECT tests.create_user('alice@lg.test') AS alice \gset
SELECT tests.create_user('bob@lg.test') AS bob \gset

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

-- The part that must not depend on the legacy round: the index, and each
-- real round's differential and Dogleg Score (badges depend on the round
-- count, so they are checked separately)
CREATE FUNCTION pg_temp.scores_of(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'index', (SELECT handicap_index FROM public.profiles WHERE id = p_user),
    'rounds', (SELECT jsonb_agg(jsonb_build_object(
                 'date', played_at::date, 'differential', differential,
                 'dogleg_score', dogleg_score, 'strokes_vs_usual', strokes_vs_usual)
               ORDER BY played_at, created_at)
               FROM public.rounds
               WHERE user_id = p_user AND (is_deleted IS NULL OR is_deleted = false)
                 AND total_score BETWEEN 9 AND 200))
$$;

CREATE FUNCTION pg_temp.first_round_dates(p_user uuid) RETURNS date[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(played_at::date ORDER BY played_at), ARRAY[]::date[])
  FROM public.rounds
  WHERE user_id = p_user AND (is_deleted IS NULL OR is_deleted = false)
    AND achievements @> '[{"type": "first_round"}]'
$$;

-- Post one Quick Score round through the API, as that golfer's browser would
CREATE FUNCTION pg_temp.post(p_user uuid, p_date text, p_total int)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  new_id uuid;
BEGIN
  PERFORM tests.login_as(p_user);
  SET LOCAL ROLE authenticated;
  new_id := (tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', p_user, 'course_id', 'lg-course', 'tee_id', 'lg-course-white',
    'played_at', p_date || 'T00:00:00', 'total_score', p_total, 'holes_declared', 18)) ->> 'id')::uuid;
  RESET ROLE;
  PERFORM tests.logout();
  RETURN new_id;
END;
$$;

-- Delete one round through the API, as "Delete round" in My Rounds does
CREATE FUNCTION pg_temp.delete_round(p_user uuid, p_round uuid)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  PERFORM tests.login_as(p_user);
  SET LOCAL ROLE authenticated;
  n := tests.exec_count(format('DELETE FROM public.rounds WHERE id = %L', p_round));
  RESET ROLE;
  PERFORM tests.logout();
  RETURN n;
END;
$$;


-- ----------------------------------------------------------------------------
-- Setup. Alice's legacy round: Jun 1, one hole-by-hole hole with 2 putts, a
-- total of 4. Posted with the score-limit trigger off, as the old app could;
-- the stats engine gives it Alice's "First round" badge.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rounds DISABLE TRIGGER trg_dogleg_check_round;
SELECT (tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'alice', 'course_id', 'lg-course', 'tee_id', 'lg-course-white',
  'played_at', '2026-06-01T00:00:00', 'total_score', 4,
  'scores_by_hole', '[4]'::jsonb, 'stats_by_hole', '[{"putts": 2}]'::jsonb)) ->> 'id') AS legacy \gset
ALTER TABLE public.rounds ENABLE TRIGGER trg_dogleg_check_round;

SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-06-01']::date[],
  'setup: the legacy round has Alice''s "First round" badge');
SELECT tests.assert_null((SELECT differential FROM public.rounds WHERE id = :'legacy'),
  'setup: the legacy round has no differential');

SELECT pg_temp.post(:'alice', '2026-07-01', 95);
SELECT pg_temp.post(:'alice', '2026-07-08', 92);
SELECT pg_temp.post(:'alice', '2026-07-15', 97);
SELECT pg_temp.post(:'alice', '2026-07-22', 90);

SELECT pg_temp.post(:'bob', '2026-07-01', 95);
SELECT pg_temp.post(:'bob', '2026-07-08', 92);
SELECT pg_temp.post(:'bob', '2026-07-15', 97);
SELECT pg_temp.post(:'bob', '2026-07-22', 90);

SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.1,
  'setup: 4 differentials -> index = lowest (16.1) - 1.0');
SELECT tests.assert_eq(pg_temp.scores_of(:'alice'), pg_temp.scores_of(:'bob'),
  'setup: the legacy round does not change Alice''s scores');


-- ----------------------------------------------------------------------------
-- A. Backdated post (the onboarding "log my older rounds" path): May 15, an
--    80. The re-score must move the "First round" badge off the legacy round.
-- ----------------------------------------------------------------------------
SELECT pg_temp.post(:'alice', '2026-05-15', 80) AS alice_may15 \gset
SELECT pg_temp.post(:'bob', '2026-05-15', 80) AS bob_may15 \gset

SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 7.4,
  'backdated post: 5 differentials -> index = lowest (7.4), not the stale 15.1');
SELECT tests.assert_eq(
  (SELECT handicap_index FROM public.profiles WHERE id = :'alice'),
  public.dogleg_index_as_of(:'alice', NULL, NULL, NULL),
  'backdated post: the stored index matches Alice''s rounds');
SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-05-15']::date[],
  'backdated post: exactly one "First round" badge, on the earliest round');
SELECT tests.assert_eq((SELECT achievements FROM public.rounds WHERE id = :'legacy'), '[]'::jsonb,
  'backdated post: the legacy round was re-scored (badge taken off)');
SELECT tests.assert_eq(pg_temp.scores_of(:'alice'), pg_temp.scores_of(:'bob'),
  'backdated post: Alice''s later rounds were re-scored like Bob''s');


-- ----------------------------------------------------------------------------
-- B. Deleting a round dated before the legacy round: the badge moves back.
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(pg_temp.delete_round(:'alice', :'alice_may15'), 1, 'Alice deletes her May 15 round');
SELECT tests.assert_eq(pg_temp.delete_round(:'bob', :'bob_may15'), 1, 'Bob deletes his May 15 round');

SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.1,
  'delete: index back to 15.1');
SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-06-01']::date[],
  'delete: exactly one "First round" badge, back on the legacy round');
SELECT tests.assert_eq(pg_temp.scores_of(:'alice'), pg_temp.scores_of(:'bob'),
  'delete: Alice''s later rounds were re-scored like Bob''s');


-- ----------------------------------------------------------------------------
-- C. A moderator hides a round dated before the legacy round (the admin RPCs
--    run as the owner; so does this script).
-- ----------------------------------------------------------------------------
SELECT pg_temp.post(:'alice', '2026-05-20', 85) AS alice_may20 \gset
SELECT pg_temp.post(:'bob', '2026-05-20', 85) AS bob_may20 \gset
SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-05-20']::date[],
  'second backdated post: the badge moves to May 20');

UPDATE public.rounds SET is_deleted = true WHERE id IN (:'alice_may20', :'bob_may20');

SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-06-01']::date[],
  'hide: exactly one "First round" badge, back on the legacy round');
SELECT tests.assert_eq(pg_temp.scores_of(:'alice'), pg_temp.scores_of(:'bob'),
  'hide: Alice''s rounds were re-scored like Bob''s');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.1,
  'hide: index back to 15.1');


-- ----------------------------------------------------------------------------
-- D. dogleg_rebuild_user (what stats_backfill.sql and the repair script
--    call) re-scores every round, the legacy one included.
-- ----------------------------------------------------------------------------
SELECT pg_temp.stats_of(:'alice') AS alice_good \gset

-- Wreck the stored stats (computed columns only: no trigger re-scores them)
UPDATE public.rounds SET achievements = NULL, dogleg_score = NULL, strokes_vs_usual = NULL
WHERE user_id = :'alice';
UPDATE public.profiles SET handicap_index = 54.0 WHERE id = :'alice';

SELECT tests.assert_true(public.dogleg_rebuild_user(:'alice', NULL) > 0,
  'dogleg_rebuild_user runs for a golfer with a legacy round');
SELECT tests.assert_eq(pg_temp.stats_of(:'alice'), :'alice_good'::jsonb,
  'dogleg_rebuild_user restores every round, the legacy one included, and the index');
SELECT tests.assert_eq(pg_temp.first_round_dates(:'alice'), ARRAY['2026-06-01']::date[],
  'dogleg_rebuild_user: exactly one "First round" badge');


-- ----------------------------------------------------------------------------
-- E. stats_backfill.sql does not skip her, and its table-wide total_putts
--    fill-in can update the legacy row too.
-- ----------------------------------------------------------------------------
UPDATE public.rounds SET achievements = NULL, dogleg_score = NULL, strokes_vs_usual = NULL
WHERE user_id = :'alice';
UPDATE public.rounds SET total_putts = NULL WHERE id = :'legacy';
UPDATE public.profiles SET handicap_index = 54.0 WHERE id = :'alice';

\ir ../stats_backfill.sql

SELECT tests.assert_eq(pg_temp.stats_of(:'alice'), :'alice_good'::jsonb,
  'stats_backfill.sql re-scores a golfer with a legacy round');
SELECT tests.assert_eq((SELECT total_putts FROM public.rounds WHERE id = :'legacy'), 2,
  'stats_backfill.sql fills in total_putts on the legacy round');
SELECT tests.assert_eq((SELECT total_score FROM public.rounds WHERE id = :'legacy'), 4,
  'nothing changed the legacy round''s total');
