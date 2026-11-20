-- ============================================================================
-- test_security_45_phone.sql — phone numbers copied into profiles (SQL-3)
-- ============================================================================
-- The old app's createProfile copies a phone sign-up's number into
-- profiles.phone, and every signed-in user can read every profiles row (the
-- app's profile pages select('*') on other people's profiles). The number is
-- also in auth.users, which is what sign-in uses, so security_hardening.sql
-- clears the copy on every run. The column stays writable, because the old
-- app still sends phone: null when it creates a profile.
-- ============================================================================

SELECT tests.create_user('alice@phone.test') AS alice \gset
SELECT tests.create_user('bob@phone.test')   AS bob   \gset

-- Alice signed up by phone before the fix: the old app copied her number
UPDATE auth.users SET phone = '15551234567' WHERE id = :'alice';
UPDATE public.profiles SET phone = '+15551234567' WHERE id = :'alice';

-- The leak being fixed: Bob can read it
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq((SELECT phone FROM public.profiles WHERE id = :'alice'), '+15551234567',
  'before the clean-up: another user can read the copied phone number');
RESET ROLE;
SELECT tests.logout();

SELECT username AS alice_username_before, wants_newsletter AS alice_newsletter_before
FROM public.profiles WHERE id = :'alice' \gset


-- ----------------------------------------------------------------------------
-- 1. Running security_hardening.sql clears the copy, and says so
-- ----------------------------------------------------------------------------
\ir ../security_hardening.sql

SELECT tests.assert_eq((SELECT count(*) FROM public.profiles WHERE phone IS NOT NULL), 0,
  'no phone numbers are left in profiles');
SELECT tests.assert_eq((SELECT phone FROM auth.users WHERE id = :'alice'), '15551234567',
  'the number is still in auth.users');
SELECT tests.assert_eq(
  (SELECT result FROM dogleg_security_report WHERE item = 'phone numbers copied into profiles'),
  '1 removed (the numbers are still in auth.users, where sign-in reads them)',
  'the report counts the numbers removed');
SELECT tests.assert_eq(
  (SELECT username FROM public.profiles WHERE id = :'alice'), :'alice_username_before',
  'nothing else in the profile changed (username)');
SELECT tests.assert_eq(
  (SELECT wants_newsletter FROM public.profiles WHERE id = :'alice'), :'alice_newsletter_before'::boolean,
  'nothing else in the profile changed (newsletter choice)');

SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_null((SELECT phone FROM public.profiles WHERE id = :'alice'),
  'after the clean-up: Bob reads no phone number');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 2. The old app's sign-up insert (it sends phone) still works
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (email, phone) VALUES ('carol@phone.test', '15559876543') RETURNING id AS carol \gset
SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.api_insert('public.profiles', jsonb_build_object(
  'id', :'carol', 'username', 'carol', 'full_name', 'Carol', 'avatar_url', NULL,
  'phone', '+15559876543', 'wants_newsletter', false, 'created_at', now()));
RESET ROLE;
SELECT tests.logout();
SELECT tests.assert_true(has_column_privilege('authenticated', 'public.profiles', 'phone', 'INSERT'),
  'the app may still send phone when it creates a profile');


-- ----------------------------------------------------------------------------
-- 3. Re-running clears a number copied in meanwhile, then finds none
-- ----------------------------------------------------------------------------
\ir ../security_hardening.sql
SELECT tests.assert_null((SELECT phone FROM public.profiles WHERE id = :'carol'),
  're-run: the number the old app copied in meanwhile is cleared');
SELECT tests.assert_eq(
  (SELECT result FROM dogleg_security_report WHERE item = 'phone numbers copied into profiles'),
  '1 removed (the numbers are still in auth.users, where sign-in reads them)',
  're-run: the report counts it');

\ir ../security_hardening.sql
SELECT tests.assert_eq(
  (SELECT result FROM dogleg_security_report WHERE item = 'phone numbers copied into profiles'),
  'none found', 're-run with nothing to clear: "none found"');


-- ----------------------------------------------------------------------------
-- 4. A database without profiles.phone: the step is skipped, not an error
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN phone;
\ir ../security_hardening.sql
SELECT tests.assert_eq(
  (SELECT result FROM dogleg_security_report WHERE item = 'phone numbers copied into profiles'),
  'skipped: profiles has no phone column', 'no phone column: skipped');
