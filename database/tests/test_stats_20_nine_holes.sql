-- ============================================================================
-- test_stats_20_nine_holes.sql — how many holes was it? (ENTRY-1, STATS-1, STATS-6)
-- ============================================================================
-- Contract C2: hole-by-hole or front/back-nine scores decide holes_played.
-- A total on its own uses rounds.holes_declared (sent by the app), then
-- courses.num_holes = 9, then the old guess (45-160 = 18 holes).
--
-- Every golfer here has a manual handicap of 14 and posts one round, so the
-- expected numbers are easy to check by hand. The harness course is rated
-- 71.5 / 130 (front nine 35.8 / 128, back nine 35.7 / 132); its nine-hole
-- variant only has front-nine ratings 35.8 / 128.
-- Nine-hole conversion (WHS 2024): D9 + 0.52 x 14 + 1.2 = D9 + 8.48.
-- ============================================================================

SELECT tests.create_course('nine-c18') AS c18 \gset
SELECT tests.create_course('nine-c9', 9) AS c9 \gset

-- One golfer per scenario, each with a manual handicap of 14
SELECT tests.create_user('n1@nine.test') AS n1 \gset
SELECT tests.create_user('n2@nine.test') AS n2 \gset
SELECT tests.create_user('n3@nine.test') AS n3 \gset
SELECT tests.create_user('n4@nine.test') AS n4 \gset
SELECT tests.create_user('n5@nine.test') AS n5 \gset
SELECT tests.create_user('n6@nine.test') AS n6 \gset
SELECT tests.create_user('n7@nine.test') AS n7 \gset
UPDATE public.profiles SET handicap = 14 WHERE username LIKE 'n_';


-- ----------------------------------------------------------------------------
-- 1. Quick Score "9 holes", total only (an old-style payload with the 9/18
--    choice): 45 on an 18-hole course. Which nine is unknown, so the average
--    of the two nines is used: slope 130, rating 35.75.
--    D9 = (45 - 35.75) x 113 / 130 = 8.04  ->  16.5
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n1');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n1', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 45, 'holes_declared', 9)) AS n1_round \gset
RESET ROLE;

SELECT tests.assert_eq((:'n1_round'::jsonb ->> 'holes_played')::int, 9,
  'holes_declared = 9 makes a total-only round a 9-hole round');
SELECT tests.assert_eq((:'n1_round'::jsonb ->> 'differential')::numeric, 16.5,
  '9-hole conversion from the average of the two nines');
-- baseline for a first round = manual handicap + 3 = 17 -> 6 + 0.4 x (17 - 16.5)
SELECT tests.assert_eq((:'n1_round'::jsonb ->> 'dogleg_score')::numeric, 6.2,
  'a nine gets a Dogleg Score');
SELECT tests.assert_false((:'n1_round'::jsonb -> 'achievements') @> '[{"type": "personal_best"}]',
  'a nine is never an 18-hole personal best');


-- ----------------------------------------------------------------------------
-- 2. Quick Score "9 holes" as the new app sends it: front9 = total = 44.
--    Front-nine ratings 35.8 / 128: D9 = 7.24 -> 15.7 (the USGA's example)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n2');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n2', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-01T00:00:00', 'front9', 44, 'total_score', 44,
  'holes_declared', 9)) AS n2_round \gset
RESET ROLE;
SELECT tests.assert_eq((:'n2_round'::jsonb ->> 'holes_played')::int, 9, 'front9 = total is a nine');
SELECT tests.assert_eq((:'n2_round'::jsonb ->> 'differential')::numeric, 15.7,
  'front-nine ratings are used when front9 is sent');


-- ----------------------------------------------------------------------------
-- 3. A nine-hole course (courses.num_holes = 9), no holes_declared (e.g. an
--    app that hasn't been updated): total 45 is 9 holes, on "the" nine.
--    D9 = (45 - 35.8) x 113 / 128 = 8.12 -> 16.6
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n3');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n3', 'course_id', :'c9', 'tee_id', 'nine-c9-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 45, 'par', 72)) AS n3_round \gset
RESET ROLE;
SELECT tests.assert_eq((:'n3_round'::jsonb ->> 'holes_played')::int, 9,
  'a total on a nine-hole course is 9 holes');
SELECT tests.assert_eq((:'n3_round'::jsonb ->> 'differential')::numeric, 16.6,
  'nine-hole course: its nine-hole rating is used');
SELECT tests.assert_eq((:'n3_round'::jsonb ->> 'par')::int, 36,
  'par comes from the course (36), not the client (72)');

-- The same course played twice round (holes_declared = 18, total 90): the
-- 18-hole rating is the nine's doubled: 71.6 / 128 -> (90 - 71.6) x 113 / 128
SELECT tests.login_as(:'n4');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n4', 'course_id', :'c9', 'tee_id', 'nine-c9-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 90, 'holes_declared', 18)) AS n4_round \gset
RESET ROLE;
SELECT tests.assert_eq((:'n4_round'::jsonb ->> 'holes_played')::int, 18,
  'holes_declared = 18 wins over the nine-hole course');
SELECT tests.assert_eq((:'n4_round'::jsonb ->> 'differential')::numeric, 16.2,
  'an 18 on a nine-hole course is rated as the nine played twice');


-- ----------------------------------------------------------------------------
-- 4. The 18-hole guess still works: a total of 92, nothing declared
--    (92 - 71.5) x 113 / 130 = 17.8
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n5');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n5', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 92)) AS n5_round \gset
RESET ROLE;
SELECT tests.assert_eq((:'n5_round'::jsonb ->> 'holes_played')::int, 18,
  'total-only 92 with nothing declared is 18 holes (old rule)');
SELECT tests.assert_eq((:'n5_round'::jsonb ->> 'differential')::numeric, 17.8,
  '18-hole differential');


-- ----------------------------------------------------------------------------
-- 5. A nine typed as an 18 (old app, or "18" picked by mistake): total 47
--    would be a -21.3 differential. The sanity guard refuses to count it,
--    so it can't wreck the index or win badges / the course record.
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n6');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n6', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 92)) ->> 'id' AS n6_first \gset
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n6', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-02T00:00:00', 'total_score', 47, 'holes_declared', 18)) AS n6_round \gset
RESET ROLE;
SELECT tests.assert_eq((:'n6_round'::jsonb ->> 'holes_played')::int, 18, 'declared 18 is 18 holes');
SELECT tests.assert_null((:'n6_round'::jsonb ->> 'differential'),
  'an impossible 18-hole differential (-21.3) is not counted');
SELECT tests.assert_null((:'n6_round'::jsonb ->> 'dogleg_score'), '...so no 10.0 Dogleg Score');
SELECT tests.assert_eq(:'n6_round'::jsonb -> 'achievements', '[]'::jsonb,
  '...and no "personal best" / "broke 70" badges');
SELECT tests.login_as(:'n6');
SET ROLE authenticated;
SELECT tests.assert_eq((public.get_course_page(:'c18') ->> 'course_record')::int, 92,
  '...and it is not the course record');
SELECT tests.assert_eq((public.get_user_stats(:'n6') -> 'best_round' ->> 'total_score')::int, 92,
  '...or the golfer''s best round');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 6. Hole-by-hole data always wins: 18 hole scores with holes_declared = 9
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'n7');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n7', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-01T00:00:00', 'total_score', 90, 'holes_declared', 9,
  'scores_by_hole', '[5,5,4,6,5,5,4,6,5,5,5,4,6,5,5,4,6,5]'::jsonb)) AS n7_round \gset
SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', :'n7', 'course_id', :'c18', 'tee_id', 'nine-c18-white',
  'played_at', '2026-08-02T00:00:00', 'total_score', 47, 'holes_declared', 18,
  'scores_by_hole', '[5,5,4,6,5,5,4,7,6,null,null,null,null,null,null,null,null,null]'::jsonb))
  AS n7_nine \gset
RESET ROLE;
SELECT tests.logout();
SELECT tests.assert_eq((:'n7_round'::jsonb ->> 'holes_played')::int, 18,
  '18 hole scores make 18 holes whatever was declared');
SELECT tests.assert_eq((:'n7_nine'::jsonb ->> 'holes_played')::int, 9,
  '9 hole scores make 9 holes whatever was declared');


-- ----------------------------------------------------------------------------
-- 7. The pieces on their own
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(public.dogleg_holes_played(NULL, NULL, NULL, 47), 18,
  'the old 4-argument dogleg_holes_played still works (old rule: 45-160 = 18)');
SELECT tests.assert_eq(public.dogleg_holes_played(NULL, NULL, NULL, 47, 9, NULL), 9,
  'declared 9');
SELECT tests.assert_eq(public.dogleg_holes_played(NULL, NULL, NULL, 47, NULL, 9), 9,
  'nine-hole course');
SELECT tests.assert_eq(public.dogleg_holes_played(NULL, 40, NULL, 85, 9, NULL), 18,
  'a front nine of 40 inside a total of 85 is 18 holes, whatever was declared');
SELECT tests.assert_eq(public.dogleg_holes_played(NULL, 40, 45, 85, 9, 9), 18,
  'both nines entered is 18 holes');
SELECT tests.assert_null(public.dogleg_holes_played(NULL, NULL, NULL, 30, NULL, NULL),
  'a total of 30 with nothing else to go on: unknown');

-- holes_declared only takes 9 or 18
SELECT tests.login_as(:'n5');
SET ROLE authenticated;
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', %L, 'course_id', %L, 'played_at', '2026-08-03T00:00:00', 'total_score', 60,
  'holes_declared', 12))$q$, :'n5', :'c18'), '23514');
RESET ROLE;
SELECT tests.logout();
