-- ============================================================================
-- test_security_50_rerun.sql — security_hardening.sql against production as
-- it is TODAY (hole open, someone already exploited it), its preflight, and
-- re-running it (AUTH-1 remediation, contract "safe to re-run")
-- ============================================================================
-- run.sh applies every migration twice, so the file is already known to
-- re-run cleanly on an empty database. This file checks the interesting
-- cases with data in it.
-- Re-applying a migration inside a test: \ir ../file.sql (as the owner).
-- ============================================================================

SELECT tests.create_user('markgreenfield1@gmail.com', 'founder') AS founder \gset
SELECT tests.create_user('alice@rerun.test')   AS alice   \gset
SELECT tests.create_user('bob@rerun.test')     AS bob     \gset
SELECT tests.create_user('mallory@rerun.test') AS mallory \gset
SELECT tests.make_admin(:'founder');
SELECT tests.create_course('rerun-course') AS course \gset

-- Alice posts three rounds: index 15.8 (as in test_00_smoke.sql)
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'rerun-course-white', 'played_at', '2026-07-01T00:00:00', 'total_score', 95));
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'rerun-course-white', 'played_at', '2026-07-08T00:00:00', 'total_score', 92));
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'tee_id', 'rerun-course-white', 'played_at', '2026-07-15T00:00:00', 'total_score', 97));
RESET ROLE;
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.8, 'setup: index 15.8');
SELECT dogleg_score AS alice_score_before FROM public.rounds
WHERE user_id = :'alice' ORDER BY played_at DESC LIMIT 1 \gset


-- ----------------------------------------------------------------------------
-- 1. Production today: Supabase's table-wide grants are back (as before the
--    fix), and two users have used the hole
-- ----------------------------------------------------------------------------
GRANT INSERT, UPDATE ON public.profiles TO anon, authenticated;

SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.api_update('public.profiles', '{"is_admin": true}', format('id = %L', :'mallory')), 1,
  'setup: with the old grants Mallory makes herself an admin');
SELECT tests.assert_true(public.is_admin(), 'setup: ...and is one');
RESET ROLE;
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.api_update('public.profiles', '{"handicap_index": -5.0}', format('id = %L', :'alice')), 1,
  'setup: Alice fakes a +5 index');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 2. The founder runs security_hardening.sql
-- ----------------------------------------------------------------------------
\ir ../security_hardening.sql

SELECT tests.assert_false((SELECT is_admin FROM public.profiles WHERE id = :'mallory'),
  'Mallory''s self-made admin flag is gone');
SELECT tests.assert_true((SELECT is_admin FROM public.profiles WHERE id = :'founder'),
  'the founder is still an admin');
SELECT tests.assert_eq((SELECT handicap_index FROM public.profiles WHERE id = :'alice'), 15.8,
  'Alice''s fake index was recomputed from her rounds');
SELECT tests.assert_eq(
  (SELECT dogleg_score FROM public.rounds WHERE user_id = :'alice' ORDER BY played_at DESC LIMIT 1),
  :'alice_score_before'::numeric, 'her rounds were not rescored');
SELECT tests.assert_false(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'the hole is closed');
SELECT tests.assert_false(has_column_privilege('anon', 'public.profiles', 'is_admin', 'INSERT'),
  'the hole is closed for anon too');

SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.assert_false(public.is_admin(), 'Mallory is no longer an admin');
SELECT tests.expect_error('SELECT public.get_all_users_admin()', 'P0001', '%Admin access required%');
RESET ROLE;
SELECT tests.login_as(:'founder');
SET ROLE authenticated;
SELECT tests.assert_true(public.is_admin(), 'the founder passes is_admin()');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 3. Re-running is a no-op: an admin the founder adds later is kept, and the
--    grants and policies come out exactly the same
-- ----------------------------------------------------------------------------
SELECT tests.make_admin(:'bob');   -- the founder makes Bob a moderator on purpose

SELECT string_agg(format('%s.%s:%s:%s', table_name, column_name, grantee, privilege_type), ','
                  ORDER BY table_name, column_name, grantee, privilege_type) AS grants_before
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') \gset
SELECT string_agg(format('%s:%s:%s:%s:%s', tablename, policyname, permissive, cmd, roles), ','
                  ORDER BY tablename, policyname) AS policies_before
FROM pg_policies WHERE schemaname = 'public' \gset

\ir ../security_hardening.sql
\ir ../security_hardening.sql

SELECT tests.assert_true((SELECT is_admin FROM public.profiles WHERE id = :'bob'),
  'a re-run keeps admins the owner set after the lockdown');
SELECT tests.assert_eq(
  (SELECT string_agg(format('%s.%s:%s:%s', table_name, column_name, grantee, privilege_type), ','
                     ORDER BY table_name, column_name, grantee, privilege_type)
   FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')),
  :'grants_before', 're-running leaves the column grants unchanged');
SELECT tests.assert_eq(
  (SELECT string_agg(format('%s:%s:%s:%s:%s', tablename, policyname, permissive, cmd, roles), ','
                     ORDER BY tablename, policyname)
   FROM pg_policies WHERE schemaname = 'public'),
  :'policies_before', 're-running leaves the policies unchanged');


-- ----------------------------------------------------------------------------
-- 4. A column added later: invisible to the app until the file is re-run
--    (the documented "rule for new columns")
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN home_course text;
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.profiles', '{"home_course": "x"}', %L)$q$, format('id = %L', :'alice')),
  '42501', '%permission denied%');
RESET ROLE;
\ir ../security_hardening.sql
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_eq(
  tests.api_update('public.profiles', '{"home_course": "Pebble"}', format('id = %L', :'alice')), 1,
  'after re-running the file the app can write the new column');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 5. PREFLIGHT: a function that writes a server-only column with the
--    caller's rights stops the whole file, and nothing changes
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.test_promote(p_user uuid) RETURNS void
LANGUAGE sql AS $$ UPDATE public.profiles SET bio = 'x', is_admin = true WHERE id = p_user $$;

-- re-open the hole so we can see whether the file closed it or not
GRANT UPDATE (is_admin) ON public.profiles TO authenticated;

-- Expect the file to fail: let psql carry on past its errors for a moment
-- (each later statement in the file then fails with "current transaction is
-- aborted"; that output is expected)
\set ON_ERROR_STOP 0
\ir ../security_hardening.sql
\set ON_ERROR_STOP 1

SELECT tests.assert_true(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'the preflight stopped the file: the whole transaction was rolled back');
SELECT tests.assert_true((SELECT is_admin FROM public.profiles WHERE id = :'bob'),
  '...so not even the clean-up ran');

-- The same, for a function writing a computed rounds column (for example a
-- short-code generator that UPDATEs the row after the insert)
DROP FUNCTION public.test_promote(uuid);
CREATE FUNCTION public.test_set_code(p_round uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- a comment that mentions is_admin must not count
  UPDATE public.rounds
     SET short_code = 'ZZZZZZ'
   WHERE id = p_round;
END;
$$;
\set ON_ERROR_STOP 0
\ir ../security_hardening.sql
\set ON_ERROR_STOP 1
SELECT tests.assert_true(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'a caller''s-rights writer of rounds.short_code also stops the file');

-- The escape hatch from the README: ignore a function you know only you run
SET dogleg.preflight_ignore = 'test_set_code';
\ir ../security_hardening.sql
RESET dogleg.preflight_ignore;
SELECT tests.assert_false(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'with dogleg.preflight_ignore the file runs');

-- The recommended fix instead: make it SECURITY DEFINER; then no escape hatch needed
ALTER FUNCTION public.test_set_code(uuid) SECURITY DEFINER SET search_path = public;
GRANT UPDATE (is_admin) ON public.profiles TO authenticated;
\ir ../security_hardening.sql
SELECT tests.assert_false(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'a SECURITY DEFINER writer does not stop the file');
-- (the hole was open again at the start of that run, so the clean-up ran:
-- Bob, not the founder, lost the admin flag — as documented)
SELECT tests.assert_false((SELECT is_admin FROM public.profiles WHERE id = :'bob'),
  'clean-up runs whenever the hole was open at the start');
SELECT tests.assert_true((SELECT is_admin FROM public.profiles WHERE id = :'founder'),
  '...and always keeps the founder');

-- Functions that only READ the protected columns, or only write allowed
-- columns, are fine (e.g. mark_notifications_checked, the feed)
CREATE FUNCTION public.test_reader() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT is_admin FROM public.profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.test_bio(p text) RETURNS void
LANGUAGE sql AS $$ UPDATE public.profiles SET bio = p WHERE id = auth.uid() $$;
\ir ../security_hardening.sql
SELECT tests.assert_false(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'readers and writers of allowed columns pass the preflight');

-- A SQL-standard body (BEGIN ATOMIC, no plain source text) is checked too
CREATE FUNCTION public.test_unban(p uuid) RETURNS void
LANGUAGE sql
BEGIN ATOMIC
  UPDATE public.profiles SET is_banned = false WHERE id = p;
END;
GRANT UPDATE (is_admin) ON public.profiles TO authenticated;
\set ON_ERROR_STOP 0
\ir ../security_hardening.sql
\set ON_ERROR_STOP 1
SELECT tests.assert_true(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'a BEGIN ATOMIC writer of profiles.is_banned also stops the file');
DROP FUNCTION public.test_unban(uuid);
\ir ../security_hardening.sql
SELECT tests.assert_false(has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'and once it is gone the file runs again');
