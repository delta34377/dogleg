-- ============================================================================
-- test_stats_40_rescoring.sql — backdated posts, deletes and hidden rounds
-- re-score the golfer's later rounds (STATS-4, STATS-5)
-- ============================================================================
-- The rule being tested: whatever order rounds are posted, deleted, hidden
-- or restored in, every golfer ends up with exactly the stats they would
-- have had by posting their remaining rounds in date order. So most checks
-- compare two golfers who played the same rounds, one posting them in
-- order and one not.
--
-- Course: rated 71.5 / 130 (front nine 35.8 / 128). 18-hole differential
-- = (total - 71.5) x 113 / 130: 97 -> 22.2, 95 -> 20.4, 92 -> 17.8,
-- 90 -> 16.1, 85 -> 11.7, 80 -> 7.4.
-- ============================================================================

SELECT tests.create_course('rs-course') AS course \gset

-- Everything the stats engine computes for one golfer, oldest round first
CREATE FUNCTION pg_temp.stats_of(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'index', (SELECT handicap_index FROM public.profiles WHERE id = p_user),
    'rounds', (SELECT jsonb_agg(jsonb_build_object(
                 'date', played_at::date, 'total', total_score, 'holes', holes_played,
                 'differential', differential, 'dogleg_score', dogleg_score,
                 'strokes_vs_usual', strokes_vs_usual, 'achievements', achievements)
               ORDER BY played_at, created_at)
               FROM public.rounds
               WHERE user_id = p_user AND (is_deleted IS NULL OR is_deleted = false)))
$$;

-- Post one Quick Score round through the API, as that golfer's browser would
CREATE FUNCTION pg_temp.post(p_user uuid, p_date text, p_total int, p_front9 int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  new_id uuid;
BEGIN
  PERFORM tests.login_as(p_user);
  SET LOCAL ROLE authenticated;
  new_id := (tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', p_user, 'course_id', 'rs-course', 'tee_id', 'rs-course-white',
    'played_at', p_date || 'T00:00:00', 'total_score', p_total,
    'front9', p_front9, 'holes_declared', CASE WHEN p_front9 IS NULL THEN 18 ELSE 9 END)) ->> 'id')::uuid;
  RESET ROLE;
  PERFORM tests.logout();
  RETURN new_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- A. Backdated posts (the natural "log my last few rounds" onboarding):
--    Carol posts Jul 15, then Jul 8, then Jul 1. Dave posts the same rounds
--    in date order.
-- ----------------------------------------------------------------------------
SELECT tests.create_user('carol@rs.test') AS carol \gset
SELECT tests.create_user('dave@rs.test') AS dave \gset

SELECT pg_temp.post(:'carol', '2026-07-15', 95);
SELECT pg_temp.post(:'carol', '2026-07-08', 92);
SELECT pg_temp.post(:'carol', '2026-07-01', 97);

SELECT pg_temp.post(:'dave', '2026-07-01', 97);
SELECT pg_temp.post(:'dave', '2026-07-08', 92);
SELECT pg_temp.post(:'dave', '2026-07-15', 95);

SELECT tests.assert_eq(
  (SELECT count(*) FROM public.rounds WHERE user_id = :'carol'
     AND achievements @> '[{"type": "first_round"}]'), 1,
  'backdated posts: only one "First round" badge (was one per post)');
SELECT tests.assert_eq(
  (SELECT played_at::date FROM public.rounds WHERE user_id = :'carol'
     AND achievements @> '[{"type": "first_round"}]'), '2026-07-01'::date,
  '...and it is on the earliest round');
-- Jul 8: baseline 22.2 -> 6 + 0.4 x 4.4 = 7.8; Jul 15: median(22.2, 17.8) = 20.0 -> 5.8
SELECT tests.assert_eq(
  (SELECT array_agg(dogleg_score ORDER BY played_at) FROM public.rounds WHERE user_id = :'carol'),
  ARRAY[NULL, 7.8, 5.8]::numeric[],
  'backdated posts: the later rounds get their missing Dogleg Scores');
SELECT tests.assert_true(
  (SELECT achievements @> '[{"type": "personal_best"}]' FROM public.rounds
   WHERE user_id = :'carol' AND played_at::date = '2026-07-08'),
  'backdated posts: the 92 is a personal best over the earlier 97');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'carol'), 15.8,
  'backdated posts: index = lowest of 3 differentials - 2');
SELECT tests.assert_eq(pg_temp.stats_of(:'carol'), pg_temp.stats_of(:'dave'),
  'posting newest-first ends exactly like posting in date order');


-- ----------------------------------------------------------------------------
-- B. Hard delete (what "Delete round" in My Rounds does): Erin deletes her
--    Jul 20 round; she must end up like Frank, who never posted it.
-- ----------------------------------------------------------------------------
SELECT tests.create_user('erin@rs.test') AS erin \gset
SELECT tests.create_user('frank@rs.test') AS frank \gset

SELECT pg_temp.post(:'erin', '2026-07-01', 95);
SELECT pg_temp.post(:'erin', '2026-07-08', 92);
SELECT pg_temp.post(:'erin', '2026-07-15', 97);
SELECT pg_temp.post(:'erin', '2026-07-20', 80) AS erin_80 \gset
SELECT pg_temp.post(:'erin', '2026-07-25', 90) AS erin_90 \gset

SELECT pg_temp.post(:'frank', '2026-07-01', 95);
SELECT pg_temp.post(:'frank', '2026-07-08', 92);
SELECT pg_temp.post(:'frank', '2026-07-15', 97);
SELECT pg_temp.post(:'frank', '2026-07-25', 90);

-- Before: the 90 is measured against median(20.4, 17.8, 22.2, 7.4) = 19.1
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'erin_90'), 7.2,
  'before the delete: the 90 scores 7.2');
SELECT tests.assert_eq((SELECT achievements FROM public.rounds WHERE id = :'erin_90'), '[]'::jsonb,
  'before the delete: the 90 is no personal best (80 is)');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'erin'), 7.4,
  'before the delete: index 7.4');
SELECT pg_temp.stats_of(:'erin') AS erin_before \gset

DELETE FROM public.rounds WHERE id = :'erin_80';

-- After: median(20.4, 17.8, 22.2) = 20.4 -> 6 + 0.4 x 4.3 = 7.7
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'erin_90'), 7.7,
  'after the delete: the later round is re-scored');
SELECT tests.assert_true(
  (SELECT achievements @> '[{"type": "personal_best"}, {"type": "course_pr"}]'
   FROM public.rounds WHERE id = :'erin_90'),
  'after the delete: the 90 is now her personal best and course PR');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'erin'), 15.1,
  'after the delete: index from the 4 remaining rounds (lowest - 1)');
SELECT tests.assert_eq(pg_temp.stats_of(:'erin'), pg_temp.stats_of(:'frank'),
  'deleting a round ends exactly like never having posted it');


-- ----------------------------------------------------------------------------
-- C. Hide (soft-delete, what moderation does) and restore
-- ----------------------------------------------------------------------------
SELECT tests.create_user('gwen@rs.test') AS gwen \gset
SELECT pg_temp.post(:'gwen', '2026-07-01', 95);
SELECT pg_temp.post(:'gwen', '2026-07-08', 92);
SELECT pg_temp.post(:'gwen', '2026-07-15', 97);
SELECT pg_temp.post(:'gwen', '2026-07-20', 80) AS gwen_80 \gset
SELECT pg_temp.post(:'gwen', '2026-07-25', 90);

SELECT tests.assert_eq(pg_temp.stats_of(:'gwen'), :'erin_before'::jsonb,
  '(setup) Gwen starts like Erin before her delete');

UPDATE public.rounds SET is_deleted = true WHERE id = :'gwen_80';
SELECT tests.assert_eq(pg_temp.stats_of(:'gwen'), pg_temp.stats_of(:'frank'),
  'hiding a round re-scores like deleting it');

UPDATE public.rounds SET is_deleted = false WHERE id = :'gwen_80';
SELECT tests.assert_eq(pg_temp.stats_of(:'gwen'), :'erin_before'::jsonb,
  'restoring it puts everything back');


-- ----------------------------------------------------------------------------
-- D. Two rounds on the same day (STATS-5): the second is compared with the
--    first, for badges AND for its Dogleg Score
-- ----------------------------------------------------------------------------
SELECT tests.create_user('hana@rs.test') AS hana \gset
SELECT pg_temp.post(:'hana', '2026-08-01', 85) AS hana_85 \gset
SELECT pg_temp.post(:'hana', '2026-08-01', 95) AS hana_95 \gset

SELECT tests.assert_eq((SELECT achievements FROM public.rounds WHERE id = :'hana_95'), '[]'::jsonb,
  'same day: no false "First time breaking 100" after an 85 earlier that day');
-- baseline = the 85's 11.7 -> 6 + 0.4 x (11.7 - 20.4) = 2.5
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'hana_95'), 2.5,
  'same day: the second round gets a Dogleg Score against the first');

-- A round posted later but dated the same day sorts after both (posting
-- order breaks the tie), so nothing earlier is re-scored
SELECT pg_temp.post(:'hana', '2026-08-01', 88) AS hana_88 \gset
SELECT tests.assert_eq((SELECT dogleg_score FROM public.rounds WHERE id = :'hana_95'), 2.5,
  'same day: a third round that day does not change the second');


-- ----------------------------------------------------------------------------
-- E. Nines only, no handicap (the pending-nines bootstrap): Ivan posts seven
--    front nines of 45 in date order, Hank posts the same nines newest
--    first. Pairs of nines make Ivan's index after the 6th; the six waiting
--    nines are then converted, and the 7th uses the new index.
--    D9 = (45 - 35.8) x 113 / 128 = 8.12; first index 16.2 - 2 = 14.2
--    -> each waiting nine 8.12 + 0.52 x 14.2 + 1.2 = 16.7
--    -> index 15.7 -> the 7th nine 8.12 + 0.52 x 15.7 + 1.2 = 17.5
-- ----------------------------------------------------------------------------
SELECT tests.create_user('ivan@rs.test') AS ivan \gset
SELECT tests.create_user('hank@rs.test') AS hank \gset

SELECT pg_temp.post(:'ivan', '2026-09-0' || d, 45, 45) FROM generate_series(1, 7) d ORDER BY d;
SELECT pg_temp.post(:'hank', '2026-09-0' || d, 45, 45) FROM generate_series(1, 7) d ORDER BY d DESC;

SELECT tests.assert_eq(
  (SELECT array_agg(differential ORDER BY played_at) FROM public.rounds WHERE user_id = :'ivan'),
  ARRAY[16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 17.5]::numeric[],
  'nines only: converted once an index exists, the 7th with the newer index');
SELECT tests.assert_eq(
  (SELECT array_agg(dogleg_score ORDER BY played_at) FROM public.rounds WHERE user_id = :'ivan'),
  ARRAY[NULL, 6.0, 6.0, 6.0, 6.0, 6.0, 5.7]::numeric[],
  'nines only: Dogleg Scores once the nines are converted');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'ivan'), 16.7,
  'nines only: index from 7 converted nines');
SELECT tests.assert_eq(pg_temp.stats_of(:'hank'), pg_temp.stats_of(:'ivan'),
  'nines only: posting newest-first ends exactly like posting in date order');
