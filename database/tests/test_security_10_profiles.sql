-- ============================================================================
-- test_security_10_profiles.sql — profiles after security_hardening.sql
-- (AUTH-1, ADMIN-1, SECURITY-1, PROFILES-1, STATS-3)
-- ============================================================================
-- * A user cannot write is_admin / is_banned / handicap_index (or the
--   follower counts) on their own row: 42501 permission denied.
-- * Every column the app writes today still works (Profile.js, AvatarUpload,
--   UsernameSetup, AuthContext createProfile, mark_notifications_checked).
-- * Own row only, even if production has some looser policy we can't see.
-- * The server side still writes the protected columns: the stats triggers
--   (handicap_index) and the admin RPCs (is_banned) are SECURITY DEFINER.
-- * The founder is still an admin.
-- ============================================================================

SELECT tests.create_user('alice@prof.test') AS alice \gset
SELECT tests.create_user('bob@prof.test')   AS bob   \gset
SELECT tests.create_user('markgreenfield1@gmail.com', 'founder') AS founder \gset
SELECT tests.make_admin(:'founder');
SELECT tests.create_course('prof-course') AS course \gset

-- A deliberately loose extra policy, the kind the Supabase dashboard template
-- creates. The restrictive guard policies must still pin everything to the
-- user's own row.
CREATE POLICY test_loose_update ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY test_loose_insert ON public.profiles FOR INSERT WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 1. Protected columns: refused on your own row
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'alice');
SET ROLE authenticated;

DO $$
DECLARE
  me uuid := tests.user_id('alice@prof.test');
  change jsonb;
BEGIN
  FOREACH change IN ARRAY ARRAY[
    '{"is_admin": true}', '{"is_admin": false}', '{"is_banned": false}',
    '{"handicap_index": -5.0}', '{"follower_count": 100000}', '{"following_count": 0}',
    '{"bio": "fine", "is_admin": true}'   -- smuggled in with a normal edit
  ]::jsonb[] LOOP
    PERFORM tests.expect_error(
      format('SELECT tests.api_update(%L, %L::jsonb, %L)', 'public.profiles', change, format('id = %L', me)),
      '42501', '%permission denied%');
  END LOOP;
END $$;

SELECT tests.assert_false(public.is_admin(), 'Alice is still not an admin');
SELECT tests.expect_error('SELECT public.get_all_users_admin()', 'P0001', '%Admin access required%');


-- ----------------------------------------------------------------------------
-- 2. Everything the app writes on its own profile still works
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(tests.api_update('public.profiles',
  '{"username": "alice_new", "full_name": "Alice A", "bio": "Golf", "handicap": 18,
    "location": "Austin, TX", "avatar_url": "https://example.test/a.jpg",
    "avatar_path": "alice/a.jpg", "wants_newsletter": true}',
  format('id = %L', :'alice')), 1, 'Profile.js / AvatarUpload / UsernameSetup edits still work');

-- mark_notifications_checked writes last_notifications_check (modelled as
-- running with the caller's rights, so it needs that column grant)
SELECT public.mark_notifications_checked();
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT ARRAY[username, full_name, bio, location, avatar_path] FROM public.profiles WHERE id = :'alice'),
  ARRAY['alice_new', 'Alice A', 'Golf', 'Austin, TX', 'alice/a.jpg'],
  'the edits were saved');
SELECT tests.assert_not_null((SELECT last_notifications_check FROM public.profiles WHERE id = :'alice'),
  'mark_notifications_checked still works');


-- ----------------------------------------------------------------------------
-- 3. Own row only (even with the loose policies above)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(
  tests.api_update('public.profiles', '{"bio": "hacked"}', format('id = %L', :'alice')), 0,
  'Bob cannot edit Alice''s profile');
SELECT tests.assert_eq(
  tests.api_update('public.profiles', '{"bio": "hacked"}', 'true'), 1,
  'an update with no filter only touches Bob''s own row');
-- moving his row onto someone else's id is refused by WITH CHECK
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', jsonb_build_object('id', %L), %L)$q$,
         gen_random_uuid(), format('id = %L', :'bob')),
  '42501');
RESET ROLE;
SELECT tests.assert_eq((SELECT bio FROM public.profiles WHERE id = :'alice'), 'Golf',
  'Alice''s bio is untouched');


-- ----------------------------------------------------------------------------
-- 4. Signing up: the app's first-profile INSERT works, but not with a
--    protected column, and not for somebody else's id
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (email) VALUES ('carol@prof.test') RETURNING id AS carol \gset
INSERT INTO auth.users (email) VALUES ('dave@prof.test')  RETURNING id AS dave \gset

SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'carol', 'is_admin', true))$q$, :'carol'), '42501');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'carol', 'is_admin', false))$q$, :'carol'), '42501');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'carol', 'handicap_index', 0.1))$q$, :'carol'), '42501');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'carol', 'is_banned', false))$q$, :'carol'), '42501');
-- a profile for another user's id: refused by the guard policy
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'not_dave'))$q$, :'dave'), '42501', '%row-level security%');
-- exactly what AuthContext.createProfile sends
SELECT tests.api_insert('public.profiles', jsonb_build_object(
  'id', :'carol', 'username', 'carol', 'full_name', 'Carol C', 'avatar_url', NULL,
  'phone', NULL, 'wants_newsletter', false, 'created_at', now())) AS carol_profile \gset
SELECT tests.assert_false(public.is_admin(), 'Carol signed up as a normal user');
RESET ROLE;
SELECT tests.assert_false((:'carol_profile'::jsonb ->> 'is_admin')::boolean, 'is_admin got its default (false)');
SELECT tests.assert_eq((SELECT count(*) FROM public.profiles WHERE id = :'dave'), 0, 'no profile was made for Dave');


-- ----------------------------------------------------------------------------
-- 5. Signed-out visitors can't write profiles at all
-- ----------------------------------------------------------------------------
SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"bio": "x"}', %L)$q$, format('id = %L', :'alice')), '42501');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.profiles',
  jsonb_build_object('id', %L, 'username', 'ghost'))$q$, :'dave'), '42501');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 6. The server still writes handicap_index (SECURITY DEFINER stats path)
--    Same three rounds as test_00_smoke.sql: index = 17.8 - 2.0 = 15.8
-- ----------------------------------------------------------------------------
UPDATE public.profiles SET handicap = NULL WHERE id = :'alice';  -- as the owner: no cold-start baseline
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'prof-course-white', 'played_at', '2026-07-01T00:00:00', 'total_score', 95));
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'prof-course-white', 'played_at', '2026-07-08T00:00:00', 'total_score', 92));
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'prof-course-white', 'played_at', '2026-07-15T00:00:00', 'total_score', 97));
RESET ROLE;
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.8,
  'posting rounds still updates handicap_index (the trigger runs as the owner)');

-- A stale/forged value (written as the owner), then Alice edits her manual
-- handicap in the app: the profile trigger recomputes the real index
UPDATE public.profiles SET handicap_index = -5.0 WHERE id = :'alice';
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.api_update('public.profiles', '{"handicap": 20}', format('id = %L', :'alice')), 1,
  'Alice can change her manual handicap');
RESET ROLE;
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.8,
  'the handicap trigger rewrote handicap_index through the SECURITY DEFINER path');


-- ----------------------------------------------------------------------------
-- 7. The founder is still an admin, and the admin RPCs still write is_banned
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'founder');
SET ROLE authenticated;
SELECT tests.assert_true(public.is_admin(), 'the founder passes is_admin()');
SELECT tests.assert_true((public.get_stats_engine_admin() ->> 'rounds_total')::int >= 3,
  'the founder can use the admin RPCs');
SELECT tests.assert_true(public.toggle_user_ban_admin(:'bob'), 'the founder bans Bob through the admin RPC');
RESET ROLE;
SELECT tests.assert_true((SELECT is_banned FROM public.profiles WHERE id = :'bob'),
  'the SECURITY DEFINER ban RPC wrote is_banned');

-- ...and Bob can't lift it
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"is_banned": false}', %L)$q$, format('id = %L', :'bob')),
  '42501');
RESET ROLE;
SELECT tests.logout();
SELECT tests.assert_true((SELECT is_banned FROM public.profiles WHERE id = :'bob'), 'Bob is still banned');


-- ----------------------------------------------------------------------------
-- 8. The founder's read-only check from the report: all false now
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(
  (SELECT count(*)
   FROM unnest(ARRAY['is_admin', 'is_banned', 'handicap_index', 'follower_count', 'following_count']) AS c,
        unnest(ARRAY['anon', 'authenticated']) AS r,
        unnest(ARRAY['INSERT', 'UPDATE']) AS p
   WHERE has_column_privilege(r, 'public.profiles', c, p)),
  0, 'no API role may INSERT or UPDATE a protected profile column');
