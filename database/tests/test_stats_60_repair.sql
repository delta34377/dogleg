-- ============================================================================
-- test_stats_60_repair.sql — repair_nine_hole_totals.sql finds and fixes
-- nine-hole rounds that the old engine scored as 18 holes
-- ============================================================================
-- Production still holds rounds from before holes_declared existed: a nine
-- typed into Total became an 18-hole round with a differential around -21,
-- a 10.0 Dogleg Score and record badges. This test plants such a row the
-- way the old engine stored it, then runs the repair the way the founder
-- would.
-- ============================================================================

SELECT tests.create_user('rp@rp.test') AS rp \gset
SELECT tests.create_user('honest@rp.test') AS honest \gset
SELECT tests.create_course('rp-course') AS course \gset

CREATE FUNCTION pg_temp.post(p_user uuid, p_date text, p_total int)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  new_id uuid;
BEGIN
  PERFORM tests.login_as(p_user);
  SET LOCAL ROLE authenticated;
  new_id := (tests.api_insert('public.rounds', jsonb_build_object(
    'user_id', p_user, 'course_id', 'rp-course', 'tee_id', 'rp-course-white',
    'played_at', p_date || 'T00:00:00', 'total_score', p_total)) ->> 'id')::uuid;
  RESET ROLE;
  PERFORM tests.logout();
  RETURN new_id;
END;
$$;

-- Honest 18s: 95 (20.4), 92 (17.8), 97 (22.2), then the bad nine, then a 90
SELECT pg_temp.post(:'rp', '2026-07-01', 95);
SELECT pg_temp.post(:'rp', '2026-07-08', 92);
SELECT pg_temp.post(:'rp', '2026-07-15', 97);
SELECT pg_temp.post(:'rp', '2026-07-20', 47) AS bad \gset
SELECT pg_temp.post(:'rp', '2026-07-25', 90) AS after_bad \gset
SELECT pg_temp.post(:'honest', '2026-07-01', 85) AS honest_round \gset

-- What the OLD engine stored for the 47 (holes_played 18, differential
-- -21.3, a 10.0 score, record badges). The new engine already refuses the
-- -21.3 itself, so the old values are written directly.
UPDATE public.rounds
SET differential = -21.3, dogleg_score = 10.0, strokes_vs_usual = 41.7,
    achievements = '[{"type": "personal_best", "label": "🏆 New personal best"},
                     {"type": "broke_70", "label": "💯 First time breaking 70"}]'
WHERE id = :'bad';
SELECT tests.assert_eq((SELECT holes_played FROM public.rounds WHERE id = :'bad'), 18,
  '(setup) the 47 is stored as an 18-hole round, as the old engine did');

\ir ../repair_nine_hole_totals.sql


-- ----------------------------------------------------------------------------
-- A. The suspect list
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq((SELECT count(*) FROM public.dogleg_suspect_nine_hole_rounds()), 1,
  'exactly one suspect round');
SELECT tests.assert_eq(
  (SELECT jsonb_build_array(username, played_on, total_score, holes_played, differential, dogleg_score)
   FROM public.dogleg_suspect_nine_hole_rounds()),
  jsonb_build_array('rp', '2026-07-20', 47, 18, -21.3, 10.0),
  'the list shows who, when, the total, holes played, differential and Dogleg Score');
SELECT tests.assert_eq((SELECT course FROM public.dogleg_suspect_nine_hole_rounds()), 'Test Course rp-course',
  'the list shows the course name');


-- ----------------------------------------------------------------------------
-- B. Nobody can call the helpers from the app
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'rp');
SET ROLE authenticated;
SELECT tests.expect_error(format('SELECT public.dogleg_set_holes_declared(%L, 9)', :'bad'), '42501');
SELECT tests.expect_error('SELECT * FROM public.dogleg_suspect_nine_hole_rounds()', '42501');
RESET ROLE;
SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.expect_error(format('SELECT public.dogleg_set_holes_declared(%L, 9)', :'bad'), '42501');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- C. The fix (SQL editor, as the owner)
-- ----------------------------------------------------------------------------
SELECT public.dogleg_set_holes_declared(:'bad', 9) AS fixed \gset

-- A total-only nine on an 18-hole course: average of the two nines' ratings
-- (130 / 35.75): D9 = (47 - 35.75) x 113 / 130 = 9.78. The index as of that
-- round (from 20.4, 17.8, 22.2) is 15.8: 9.78 + 0.52 x 15.8 + 1.2 = 19.2
SELECT tests.assert_eq((:'fixed'::jsonb ->> 'holes_played')::int, 9, 'now a 9-hole round');
SELECT tests.assert_eq((:'fixed'::jsonb ->> 'differential')::numeric, 19.2,
  'converted like a nine (was -21.3)');
SELECT tests.assert_eq(:'fixed'::jsonb -> 'achievements', '[]'::jsonb,
  'the fake record badges are gone');
-- baseline median(20.4, 17.8, 22.2) = 20.4 -> 6 + 0.4 x 1.2 = 6.5
SELECT tests.assert_eq((:'fixed'::jsonb ->> 'dogleg_score')::numeric, 6.5, 'a normal Dogleg Score');

-- The 90 after it was re-scored: a personal best again (92 was the best
-- real 18), and its baseline no longer includes -21.3
SELECT tests.assert_true(
  (SELECT achievements @> '[{"type": "personal_best"}]' FROM public.rounds WHERE id = :'after_bad'),
  'the later round is re-scored (personal best)');
-- index from 20.4, 17.8, 22.2, 19.2, 16.1: 5 rounds -> the lowest = 16.1
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'rp'), 16.1,
  'the handicap index is recomputed (it was dragged down by -21.3)');
SELECT tests.assert_eq((SELECT count(*) FROM public.dogleg_suspect_nine_hole_rounds()), 0,
  'the fixed round drops off the list');

-- Other golfers are untouched
SELECT tests.assert_eq((SELECT differential FROM public.rounds WHERE id = :'honest_round'), 11.7,
  'other golfers'' rounds are untouched');

-- Undo works (18 again: the -21.3 is now refused by the sanity guard)
SELECT public.dogleg_set_holes_declared(:'bad', 18) AS undone \gset
SELECT tests.assert_eq((:'undone'::jsonb ->> 'holes_played')::int, 18, 'undo: 18 holes again');
SELECT tests.assert_null(:'undone'::jsonb ->> 'differential', 'undo: an impossible 18 still does not count');

-- Bad input is refused
SELECT tests.expect_error(format('SELECT public.dogleg_set_holes_declared(%L, 12)', :'bad'), 'P0001',
  '%must be 9, 18 or NULL%');
SELECT tests.expect_error('SELECT public.dogleg_set_holes_declared(gen_random_uuid(), 9)', 'P0001',
  'No round with id%');

-- Running the repair file again is safe
\ir ../repair_nine_hole_totals.sql
SELECT tests.assert_eq((SELECT holes_declared FROM public.rounds WHERE id = :'bad'), 18,
  're-running the repair file changes no round');
