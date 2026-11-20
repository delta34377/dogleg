-- ============================================================================
-- test_security_30_social.sql — reactions, comments, follows, notifications
-- (SOCIAL-1, SECURITY-8, ADMIN-3, SECURITY-4, SOCIAL-6)
-- ============================================================================
-- * Nobody can react, comment or follow AS someone else — even after this
--   test adds deliberately loose permissive policies (WITH CHECK (true)),
--   the kind that let notifications be forged before July. So the
--   notification triggers (which trust NEW.user_id) can't be abused.
-- * Nobody can delete or edit someone else's reaction, comment or follow.
--   (The app has no "delete a comment on my round" feature: checked.)
-- * Banned users can't post rounds, reactions, comments or follows, but can
--   still delete their own things. Lifting the ban restores posting.
-- * Notifications can't be updated through the API at all any more.
-- ============================================================================

SELECT tests.create_user('alice@soc.test')   AS alice   \gset
SELECT tests.create_user('bob@soc.test')     AS bob     \gset
SELECT tests.create_user('mallory@soc.test') AS mallory \gset
SELECT tests.create_course('soc-course') AS course \gset

-- Loose permissive policies on every write (what a dashboard template makes)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reactions', 'comments', 'follows'] LOOP
    EXECUTE format('CREATE POLICY test_loose_insert ON public.%I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY test_loose_update ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY test_loose_delete ON public.%I FOR DELETE USING (true)', t);
  END LOOP;
END $$;

-- Alice posts a round; Bob reacts, comments and follows her (the normal way)
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'played_at', '2026-08-01T00:00:00', 'total_score', 90)) ->> 'id' AS round_id \gset
RESET ROLE;

SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.api_insert('public.reactions', jsonb_build_object(
  'user_id', :'bob', 'round_id', :'round_id', 'reaction_type', 'fire')) ->> 'id' AS bob_reaction \gset
SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', :'bob', 'round_id', :'round_id', 'content', 'Great round', 'created_at', now())) ->> 'id' AS bob_comment \gset
SELECT tests.api_insert('public.follows', jsonb_build_object(
  'follower_id', :'bob', 'following_id', :'alice')) ->> 'id' AS bob_follow \gset
RESET ROLE;


-- ----------------------------------------------------------------------------
-- 1. Mallory can't write as Bob (the notification-forging path)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.reactions', jsonb_build_object(
  'user_id', %L, 'round_id', %L, 'reaction_type', 'clown'))$q$, :'bob', :'round_id'),
  '42501', '%row-level security%');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', %L, 'round_id', %L, 'content', 'words Bob never wrote'))$q$, :'bob', :'round_id'),
  '42501', '%row-level security%');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.follows', jsonb_build_object(
  'follower_id', %L, 'following_id', %L))$q$, :'bob', :'mallory'),
  '42501', '%row-level security%');

-- ...nor take over Bob's rows by editing them
SELECT tests.assert_eq(tests.api_update('public.comments', '{"content": "edited by Mallory"}',
  format('id = %L', :'bob_comment')), 0, 'Mallory cannot edit Bob''s comment');
SELECT tests.assert_eq(tests.api_update('public.reactions', jsonb_build_object('user_id', :'mallory'),
  format('id = %L', :'bob_reaction')), 0, 'Mallory cannot re-assign Bob''s reaction');
SELECT tests.assert_eq(tests.api_update('public.follows', jsonb_build_object('following_id', :'mallory'),
  format('id = %L', :'bob_follow')), 0, 'Mallory cannot redirect Bob''s follow');

-- ...nor delete them
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.reactions WHERE id = %L', :'bob_reaction')), 0,
  'Mallory cannot delete Bob''s reaction');
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.comments WHERE id = %L', :'bob_comment')), 0,
  'Mallory cannot delete Bob''s comment');
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.follows WHERE id = %L', :'bob_follow')), 0,
  'Mallory cannot delete Bob''s follow');

-- ...and her own rows can't be moved onto Bob either
SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', :'mallory', 'round_id', :'round_id', 'content', 'hi')) ->> 'id' AS mallory_comment \gset
SELECT tests.expect_error(format($q$SELECT tests.api_update('public.comments', jsonb_build_object('user_id', %L), %L)$q$,
  :'bob', format('id = %L', :'mallory_comment')), '42501', '%row-level security%');
RESET ROLE;

SELECT tests.assert_eq(
  (SELECT count(*) FROM public.notifications WHERE actor_id = :'bob' AND type = 'comment'), 1,
  'the only "Bob commented" notification is the real one');
SELECT tests.assert_eq(
  (SELECT ARRAY[(SELECT content FROM public.comments WHERE id = :'bob_comment'),
                (SELECT reaction_type FROM public.reactions WHERE id = :'bob_reaction'),
                (SELECT following_id::text FROM public.follows WHERE id = :'bob_follow')]),
  ARRAY['Great round', 'fire', :'alice'], 'Bob''s comment, reaction and follow are untouched');


-- ----------------------------------------------------------------------------
-- 2. The round's owner can't delete other people's comments on it either
--    (frontend/src: deleteComment always filters on the comment's own
--    user_id; moderation goes through delete_comment_admin)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.comments WHERE id = %L', :'bob_comment')), 0,
  'Alice cannot delete Bob''s comment on her round');
RESET ROLE;


-- ----------------------------------------------------------------------------
-- 3. Own rows: Bob un-reacts, deletes his comment, unfollows (as the app does)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.reactions WHERE id = %L', :'bob_reaction')), 1,
  'Bob removes his own reaction');
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.comments WHERE id = %L AND user_id = %L',
  :'bob_comment', :'bob')), 1, 'Bob deletes his own comment');
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.follows WHERE follower_id = %L AND following_id = %L',
  :'bob', :'alice')), 1, 'Bob unfollows Alice');
RESET ROLE;


-- ----------------------------------------------------------------------------
-- 4. Bans block posting (ADMIN-3), but not deleting your own things
-- ----------------------------------------------------------------------------
UPDATE public.profiles SET is_banned = true WHERE id = :'mallory';   -- as the owner, like the ban RPC

SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.rounds', jsonb_build_object(
  'user_id', %L, 'course_id', %L, 'played_at', '2026-08-02T00:00:00', 'total_score', 80))$q$,
  :'mallory', :'course'), '42501', '%row-level security%');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.reactions', jsonb_build_object(
  'user_id', %L, 'round_id', %L, 'reaction_type', 'skull'))$q$, :'mallory', :'round_id'),
  '42501', '%row-level security%');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', %L, 'round_id', %L, 'content', 'troll'))$q$, :'mallory', :'round_id'),
  '42501', '%row-level security%');
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.follows', jsonb_build_object(
  'follower_id', %L, 'following_id', %L))$q$, :'mallory', :'alice'),
  '42501', '%row-level security%');
-- editing an old comment into abuse is posting too
SELECT tests.expect_error(format($q$SELECT tests.api_update('public.comments', '{"content": "abuse"}', %L)$q$,
  format('id = %L', :'mallory_comment')), '42501', '%row-level security%');
-- deleting it is fine
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.comments WHERE id = %L', :'mallory_comment')), 1,
  'a banned user can still delete their own comment');
RESET ROLE;

UPDATE public.profiles SET is_banned = false WHERE id = :'mallory';  -- ban lifted
SELECT tests.login_as(:'mallory');
SET ROLE authenticated;
SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', :'mallory', 'round_id', :'round_id', 'content', 'sorry'));
RESET ROLE;
SELECT tests.assert_eq((SELECT count(*) FROM public.comments WHERE user_id = :'mallory'), 1,
  'after the ban is lifted Mallory can comment again');


-- ----------------------------------------------------------------------------
-- 5. Notifications: no updates through the API (SOCIAL-6)
-- ----------------------------------------------------------------------------
SELECT tests.assert_eq(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'UPDATE'),
  0, 'the leftover notifications UPDATE policy is gone');

SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_true(tests.query_count('SELECT 1 FROM public.notifications') > 0,
  'Alice can still read her notifications');
SELECT tests.expect_error(format($q$SELECT tests.api_update('public.notifications', jsonb_build_object('user_id', %L), 'true')$q$,
  :'bob'), '42501', '%permission denied%');
SELECT tests.expect_error($q$SELECT tests.api_update('public.notifications', '{"read": true}', 'true')$q$, '42501');
-- still no direct inserts (notifications_hardening.sql)
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.notifications', jsonb_build_object(
  'user_id', %L, 'type', 'follow', 'actor_id', %L, 'message', 'forged'))$q$, :'alice', :'bob'), '42501');
RESET ROLE;
SELECT tests.logout();
