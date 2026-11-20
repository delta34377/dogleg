-- ============================================================================
-- test_00_smoke.sql — the harness works, and today's migrations behave the
-- way the current code says they do.
-- ============================================================================
-- Runs in its own fresh copy of the migrated database (see run.sh), so the
-- users and rounds created here are invisible to every other test file.
-- Each statement autocommits, just like each API request from the browser.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. The assertion helpers themselves
-- ----------------------------------------------------------------------------

-- expect_error must pass when the statement fails with the right SQLSTATE...
SELECT tests.expect_error('SELECT 1 / 0', '22012');
SELECT tests.expect_error('SELECT 1 / 0', '22012', '%division by zero%');

-- ...and must itself fail when the statement succeeds or fails differently.
DO $$
DECLARE
  cases text[] := ARRAY[
    $q$SELECT tests.expect_error('SELECT 1', '42501')$q$,        -- statement succeeded
    $q$SELECT tests.expect_error('SELECT 1 / 0', '42501')$q$,    -- wrong SQLSTATE
    $q$SELECT tests.assert_eq(1, 2, 'one is not two')$q$,
    $q$SELECT tests.assert_true(NULL, 'NULL is not true')$q$
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY cases LOOP
    BEGIN
      EXECUTE c;
      RAISE EXCEPTION 'harness self-test: % should have failed', c USING ERRCODE = 'XX000';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'ASSERTION FAILED%' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;

SELECT tests.assert_eq(count(*), 3, 'assert_eq compares bigint with integer')
FROM (VALUES (1), (2), (3)) AS v(x);


-- ----------------------------------------------------------------------------
-- 1. Set up two users and a rated course
-- ----------------------------------------------------------------------------
SELECT tests.create_user('alice@smoke.test') AS alice \gset
SELECT tests.create_user('bob@smoke.test')   AS bob   \gset
SELECT tests.create_course('smoke-course')   AS course \gset

SELECT tests.assert_eq((SELECT username FROM public.profiles WHERE id = :'alice'), 'alice',
                       'create_user makes a profiles row with a username');


-- ----------------------------------------------------------------------------
-- 2. Alice posts three 18-hole Quick Score rounds, as the browser does
--    (payload shape: frontend/src/services/roundsService.js saveRound)
-- ----------------------------------------------------------------------------
-- The common part of the payload, kept in a psql variable. tee_data is the
-- whole tees row the user picked, exactly as ScoreEntry passes it along.
SELECT jsonb_build_object(
         'user_id', :'alice', 'course_id', c.course_id, 'course_name', c.course_name,
         'club_name', cl.club_name, 'city', cl.city, 'state', cl.state,
         'tee_id', t.tee_id, 'tee_data', to_jsonb(t),
         'front9', NULL, 'back9', NULL, 'scores_by_hole', NULL, 'par', 72,
         'course_pars', '[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]'::jsonb,
         'caption', '', 'photo_url', NULL)::text AS quick_score
FROM public.courses c
JOIN public.clubs cl ON cl.club_id = c.club_id
JOIN public.tees t ON t.course_id = c.course_id
WHERE c.course_id = :'course' \gset

SELECT tests.login_as(:'alice');
SET ROLE authenticated;

SELECT tests.assert_eq(auth.uid(), :'alice'::uuid, 'login_as sets auth.uid()');
SELECT tests.assert_eq(auth.role(), 'authenticated', 'login_as sets auth.role()');
SELECT tests.assert_eq(current_user::text, 'authenticated', 'SET ROLE makes us the authenticated role');

-- One statement (= one API request) per round, oldest first
SELECT tests.api_insert('public.rounds', :'quick_score'::jsonb || jsonb_build_object(
  'played_at', '2026-07-01T00:00:00', 'total_score', 95, 'created_at', now())) ->> 'id' AS round1 \gset
SELECT tests.api_insert('public.rounds', :'quick_score'::jsonb || jsonb_build_object(
  'played_at', '2026-07-08T00:00:00', 'total_score', 92, 'created_at', now())) ->> 'id' AS round2 \gset
SELECT tests.api_insert('public.rounds', :'quick_score'::jsonb || jsonb_build_object(
  'played_at', '2026-07-15T00:00:00', 'total_score', 97, 'created_at', now())) ->> 'id' AS round3 \gset

-- RLS: Alice cannot post a round as Bob
SELECT tests.expect_error(
  format($q$SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', %L, 'total_score', 90))$q$, :'bob'),
  '42501', '%row-level security%');

RESET ROLE;
SELECT tests.logout();

-- Server-computed stats, per the current stats_layer.sql:
--   differential = (total - 71.5) x 113 / 130, rounded to 0.1
SELECT tests.assert_eq(
  (SELECT array_agg(differential ORDER BY played_at) FROM public.rounds WHERE user_id = :'alice'),
  ARRAY[20.4, 17.8, 22.2]::numeric[],
  'differentials from the picked tee (71.5 / 130)');

SELECT tests.assert_eq(
  (SELECT array_agg(holes_played ORDER BY played_at) FROM public.rounds WHERE user_id = :'alice'),
  ARRAY[18, 18, 18],
  'total-only scores of 92-97 count as 18 holes');

-- Handicap index with 3 counting rounds = lowest differential - 2.0
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.8,
                       'handicap index recomputed after the third round');

-- Dogleg Score: first round has no baseline; then 6 + 0.4 x (baseline - differential)
SELECT tests.assert_eq(
  (SELECT array_agg(dogleg_score ORDER BY played_at) FROM public.rounds WHERE user_id = :'alice'),
  ARRAY[NULL, 7.0, 4.8]::numeric[],
  'Dogleg Scores vs the running median baseline');

SELECT tests.assert_eq(
  (SELECT achievements -> 0 ->> 'type' FROM public.rounds WHERE id = :'round1'),
  'first_round', 'first round gets the first_round badge');
SELECT tests.assert_true(
  (SELECT achievements @> '[{"type": "personal_best"}]' FROM public.rounds WHERE id = :'round2'),
  'a lower 18-hole score is a personal best');

-- Share-link short codes: 6 characters, no look-alikes (0/O, 1/I)
SELECT tests.assert_eq(
  (SELECT count(*) FROM public.rounds WHERE user_id = :'alice' AND short_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  3, 'every round gets a short code');


-- ----------------------------------------------------------------------------
-- 3. Bob follows Alice, sees her rounds, reacts; notifications still work
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;

SELECT tests.api_insert('public.follows', jsonb_build_object('follower_id', :'bob', 'following_id', :'alice'));

SELECT tests.assert_eq(
  jsonb_array_length(public.get_feed_chronological_mixed(10, 0, 'mixed', 0.3) -> 'rounds'),
  3, 'the live feed RPC shows Bob the rounds of people he follows');

SELECT tests.assert_eq((public.get_user_stats(:'alice') ->> 'rounds_count')::int, 3,
                       'get_user_stats is callable by signed-in users');

SELECT tests.api_insert('public.reactions', jsonb_build_object(
  'user_id', :'bob', 'reaction_type', 'fire',
  'round_id', :'round2'));

-- notifications_hardening.sql: no direct inserts any more, triggers only
SELECT tests.expect_error(
  format($q$SELECT tests.api_insert('public.notifications', jsonb_build_object('user_id', %L, 'type', 'follow', 'actor_id', %L, 'message', 'forged'))$q$,
         :'alice', :'bob'),
  '42501');

RESET ROLE;
SELECT tests.logout();

SELECT tests.assert_eq(
  (SELECT array_agg(type ORDER BY type) FROM public.notifications WHERE user_id = :'alice'),
  ARRAY['follow', 'reaction'],
  'the follow and the reaction each notified Alice');
SELECT tests.assert_eq((SELECT follower_count FROM public.profiles WHERE id = :'alice'), 1,
                       'follower count trigger');

-- Signed-out visitors cannot call the stats RPC
SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.expect_error(format('SELECT public.get_user_stats(%L)', :'alice'), '42501');
RESET ROLE;
SELECT tests.logout();



-- ============================================================================
-- 4. The is_admin hole is closed (AUTH-1 / PROFILES-1 / STATS-3 / ADMIN-1)
--    Until security_hardening.sql, Supabase's table-wide grants let any
--    signed-in user write these columns on their own row, and is_admin()
--    reads profiles.is_admin: "make yourself admin". Now the columns are
--    server-only (column grants), so the attempts below fail with 42501.
--    test_security_*.sql cover the rest of security_hardening.sql.
-- ============================================================================

-- 4a. UPDATE own row: is_admin
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_false(public.is_admin(), 'Bob starts as a normal user');
SELECT tests.expect_error('SELECT public.get_stats_engine_admin()', 'P0001', '%Admin access required%');
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"is_admin": true}', %L)$q$, format('id = %L', :'bob')),
  '42501', '%permission denied%');
SELECT tests.assert_false(public.is_admin(), '...so is_admin() still says Bob is not an admin');
SELECT tests.expect_error('SELECT public.get_stats_engine_admin()', 'P0001', '%Admin access required%');
-- ...but his ordinary profile edits still work
SELECT tests.assert_eq(
  tests.api_update('public.profiles', '{"bio": "Weekend hacker"}', format('id = %L', :'bob')), 1,
  'a normal profile edit still works');

-- 4b. UPDATE own row: handicap_index (only ever computed by the server)
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"handicap_index": -5.0}', %L)$q$, format('id = %L', :'bob')),
  '42501');
RESET ROLE;
SELECT tests.assert_null((SELECT handicap_index FROM public.profiles WHERE id = :'bob'),
                         'Bob has no rounds, so no index, and the forged one never landed');

-- 4c. UPDATE own row: is_banned (a banned user can't unban themselves)
UPDATE public.profiles SET is_banned = true WHERE id = :'alice';   -- as the owner, like an admin ban
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"is_banned": false}', %L)$q$, format('id = %L', :'alice')),
  '42501');
RESET ROLE;
SELECT tests.assert_true((SELECT is_banned FROM public.profiles WHERE id = :'alice'),
                         'the ban stays');

-- 4d. INSERT own first profile row with is_admin = true (brand-new signup)
INSERT INTO auth.users (email) VALUES ('mallory@smoke.test') RETURNING id AS mallory \gset
SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_insert('public.profiles', jsonb_build_object('id', %L, 'username', 'mallory', 'is_admin', true))$q$,
         :'mallory'),
  '42501');
-- the normal signup insert (AuthContext createProfile) still works
SELECT tests.assert_false(
  (tests.api_insert('public.profiles', jsonb_build_object(
     'id', :'mallory', 'username', 'mallory', 'full_name', NULL, 'avatar_url', NULL,
     'phone', NULL, 'wants_newsletter', false, 'created_at', now())) ->> 'is_admin')::boolean,
  'a new user''s profile is created, and not as an admin');
SELECT tests.assert_false(public.is_admin(), 'Mallory is not an admin');
RESET ROLE;
SELECT tests.logout();

-- 4e. The founder's read-only production check (deep-dive report, section
--     1.1) now answers false for every protected column.
SELECT tests.assert_eq(
  (SELECT array_agg(c ORDER BY c)
   FROM unnest(ARRAY['handicap_index', 'is_admin', 'is_banned']) AS c
   WHERE has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE')
      OR has_column_privilege('authenticated', 'public.profiles', c, 'INSERT')),
  NULL::text[],
  'authenticated may no longer INSERT or UPDATE the protected profile columns');
