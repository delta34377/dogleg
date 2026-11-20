-- ============================================================================
-- test_security_40_privacy.sql — private rounds, banned authors, and the
-- public round RPC (SOCIAL-4, SECURITY-13, PROFILES-4, ADMIN-3, contract C3)
-- ============================================================================
-- * Other users' private rounds and banned users' rounds are invisible
--   through the table (signed in and signed out), through the live feed RPC,
--   and through get_public_round. Owners still see their own.
-- * get_feed_chronological_mixed filters by itself too (checked with RLS
--   bypassed), so it stays right even if it ever runs as SECURITY DEFINER.
-- * get_public_round: anon can call it; exact C3 shape; NULL when not found,
--   hidden, private or by a banned author.
-- * EXECUTE hygiene: the app-facing RPCs are callable, internals are not.
-- ============================================================================

SELECT tests.create_user('alice@priv.test') AS alice \gset
SELECT tests.create_user('bob@priv.test')   AS bob   \gset
SELECT tests.create_user('carol@priv.test') AS carol \gset
SELECT tests.create_user('dave@priv.test')  AS dave  \gset
SELECT tests.create_user('erin@priv.test')  AS erin  \gset
SELECT tests.create_course('priv-course') AS course \gset

UPDATE public.profiles SET full_name = 'Alice Ace', avatar_url = 'https://example.test/alice.png'
WHERE id = :'alice';

-- Alice: one public round, one private round, one round a moderator hides
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'played_at', '2026-08-01T00:00:00', 'total_score', 90, 'caption', 'public one')) AS pub \gset
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'played_at', '2026-08-02T00:00:00', 'total_score', 85, 'is_private', true)) AS priv \gset
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', 'course_id', :'course',
  'played_at', '2026-08-03T00:00:00', 'total_score', 88)) AS hidden \gset
RESET ROLE;
SELECT :'pub'::jsonb ->> 'id' AS pub_id, :'pub'::jsonb ->> 'short_code' AS pub_code,
       :'priv'::jsonb ->> 'id' AS priv_id, :'priv'::jsonb ->> 'short_code' AS priv_code,
       :'hidden'::jsonb ->> 'id' AS hidden_id, :'hidden'::jsonb ->> 'short_code' AS hidden_code \gset
UPDATE public.rounds SET is_deleted = true WHERE id = :'hidden_id';   -- as a moderator would

-- Carol posts a round that becomes "popular" (3 reactions), then is banned
SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'carol', 'course_id', :'course',
  'played_at', '2026-08-04T00:00:00', 'total_score', 79)) AS carol_round \gset
RESET ROLE;
SELECT :'carol_round'::jsonb ->> 'id' AS carol_id, :'carol_round'::jsonb ->> 'short_code' AS carol_code \gset

-- Reactions and comments on Alice's public round (and 3 reactions on Carol's)
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.api_insert('public.follows', jsonb_build_object('follower_id', :'bob', 'following_id', :'alice'));
SELECT tests.api_insert('public.follows', jsonb_build_object('follower_id', :'bob', 'following_id', :'carol'));
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'bob', 'round_id', :'pub_id', 'reaction_type', 'fire'));
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'bob', 'round_id', :'pub_id', 'reaction_type', 'clap'));
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'bob', 'round_id', :'carol_id', 'reaction_type', 'fire'));
SELECT tests.api_insert('public.comments', jsonb_build_object('user_id', :'bob', 'round_id', :'pub_id',
  'content', 'First!', 'created_at', '2026-08-01T10:00:00Z'));
RESET ROLE;
SELECT tests.login_as(:'dave');
SET ROLE authenticated;
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'dave', 'round_id', :'pub_id', 'reaction_type', 'fire'));
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'dave', 'round_id', :'carol_id', 'reaction_type', 'clap'));
SELECT tests.api_insert('public.reactions', jsonb_build_object('user_id', :'dave', 'round_id', :'carol_id', 'reaction_type', 'goat'));
SELECT tests.api_insert('public.comments', jsonb_build_object('user_id', :'dave', 'round_id', :'pub_id',
  'content', 'hidden by a moderator', 'created_at', '2026-08-01T11:00:00Z')) ->> 'id' AS dave_comment \gset
RESET ROLE;
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.comments', jsonb_build_object('user_id', :'alice', 'round_id', :'pub_id',
  'content', 'Thanks', 'created_at', '2026-08-01T12:00:00Z'));
RESET ROLE;
SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.api_insert('public.comments', jsonb_build_object('user_id', :'carol', 'round_id', :'pub_id',
  'content', 'by someone who gets banned', 'created_at', '2026-08-01T13:00:00Z'));
RESET ROLE;

UPDATE public.comments SET is_deleted = true WHERE id = :'dave_comment';   -- a moderator hides it
UPDATE public.profiles SET is_banned = true WHERE id = :'carol';           -- Carol is banned
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 1. Table reads (what getRound / getUserRounds / the profile page do)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE user_id = %L', :'alice')), 2,
  'Bob sees Alice''s public and hidden rounds (the app filters hidden ones), not her private one');
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE id = %L', :'priv_id')), 0,
  'Bob cannot open Alice''s private round by id');
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE short_code = %L', :'priv_code')), 0,
  '...or by its short code');
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE user_id = %L', :'carol')), 0,
  'Bob cannot see the banned user''s rounds');
RESET ROLE;

SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE user_id = %L', :'alice')), 3,
  'Alice sees all her own rounds, private included');
RESET ROLE;

SELECT tests.login_as(:'carol');
SET ROLE authenticated;
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE user_id = %L', :'carol')), 1,
  'a banned user still sees their own rounds');
RESET ROLE;

SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.assert_eq(tests.query_count('SELECT 1 FROM public.rounds WHERE is_private'), 0,
  'signed-out visitors see no private rounds');
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE id = %L', :'pub_id')), 1,
  'signed-out visitors still see public rounds');
RESET ROLE;
SELECT tests.logout();

-- get_user_stats (SECURITY DEFINER) agrees: Bob sees 1 round of Alice's
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq((public.get_user_stats(:'alice') ->> 'rounds_count')::int, 1,
  'get_user_stats counts only Alice''s public, visible round for Bob');
RESET ROLE;


-- ----------------------------------------------------------------------------
-- 2. The live feed: Bob follows Alice and Carol
-- ----------------------------------------------------------------------------
-- 2a. As the browser (RLS applies)
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(
  (SELECT array_agg(r ->> 'id') FROM jsonb_array_elements(
     public.get_feed_chronological_mixed(50, 0, 'mixed', 0.3) -> 'rounds') r),
  ARRAY[:'pub_id'], 'Bob''s feed: Alice''s public round only (no private, hidden or banned rounds)');
RESET ROLE;

-- 2b. The function's own filter, with RLS bypassed (as if it were SECURITY
-- DEFINER): the database owner, with Bob's JWT claims
SELECT tests.login_as(:'bob');
SELECT tests.assert_eq(
  (SELECT array_agg(r ->> 'id') FROM jsonb_array_elements(
     public.get_feed_chronological_mixed(50, 0, 'mixed', 0.3) -> 'rounds') r),
  ARRAY[:'pub_id'], 'the feed function itself drops private and banned rounds');

-- 2c. Discovery: Erin follows nobody; Carol's round is "popular" (3
-- reactions) but its author is banned; Alice's public round is popular too
SELECT tests.login_as(:'erin');
SELECT tests.assert_eq(
  (SELECT array_agg(r ->> 'id') FROM jsonb_array_elements(
     public.get_feed_chronological_mixed(50, 0, 'discover', 0.3) -> 'rounds') r),
  ARRAY[:'pub_id'], 'discovery never surfaces a banned user''s round, even a popular one');
SELECT tests.logout();

-- 2d. Same shape as before: the keys the app reads are all still there
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(
  (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(
     public.get_feed_chronological_mixed(50, 0, 'mixed', 0.3) -> 'rounds' -> 0) k),
  ARRAY['back9', 'caption', 'city', 'club_name', 'comments', 'course_id', 'course_name', 'course_pars',
        'front9', 'id', 'par', 'photo_url', 'played_at', 'profiles', 'reactions', 'reason',
        'scores_by_hole', 'source', 'state', 'tee_data', 'total_score', 'userReacted', 'user_id'],
  'feed rounds keep exactly the same keys');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 3. get_public_round, as a signed-out visitor (contract C3)
-- ----------------------------------------------------------------------------
SELECT tests.login_anon();
SET ROLE anon;

SELECT public.get_public_round(:'pub_code') AS pr \gset

SELECT tests.assert_eq((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(:'pr'::jsonb) k),
  ARRAY['author', 'comment_count', 'comments', 'reactions', 'round'], 'C3 top-level keys');
SELECT tests.assert_eq(:'pr'::jsonb -> 'round' ->> 'id', :'pub_id', 'the right round');
SELECT tests.assert_eq(:'pr'::jsonb -> 'round' ->> 'caption', 'public one', 'round is the whole rounds row');
SELECT tests.assert_eq((:'pr'::jsonb -> 'round' ->> 'differential')::numeric, 16.1,
  'round includes the server-computed columns');
SELECT tests.assert_eq(:'pr'::jsonb -> 'author',
  jsonb_build_object('id', :'alice', 'username', 'alice', 'full_name', 'Alice Ace',
                     'avatar_url', 'https://example.test/alice.png'),
  'author is {id, username, full_name, avatar_url}');
SELECT tests.assert_eq(:'pr'::jsonb -> 'reactions', '{"fire": 2, "clap": 1}'::jsonb,
  'reactions: counts per type, only types that have any');
SELECT tests.assert_eq((:'pr'::jsonb ->> 'comment_count')::int, 2,
  'comment_count leaves out the hidden comment and the banned user''s comment');
SELECT tests.assert_eq(
  (SELECT array_agg(c ->> 'content' ORDER BY ord) FROM jsonb_array_elements(:'pr'::jsonb -> 'comments') WITH ORDINALITY AS t(c, ord)),
  ARRAY['First!', 'Thanks'], 'comments: visible ones, oldest first');
SELECT tests.assert_eq(
  (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(:'pr'::jsonb -> 'comments' -> 0) k),
  ARRAY['author', 'content', 'created_at', 'id'], 'comment keys');
SELECT tests.assert_eq(:'pr'::jsonb -> 'comments' -> 0 -> 'author',
  jsonb_build_object('username', 'bob', 'full_name', 'Bob', 'avatar_url', NULL),
  'comment author is {username, full_name, avatar_url}');

-- by id as well as by short code
SELECT tests.assert_eq(public.get_public_round(:'pub_id'), :'pr'::jsonb, 'the round id works like the short code');

-- NULL for everything that isn't public
SELECT tests.assert_null(public.get_public_round(:'priv_code'), 'a private round: NULL (by short code)');
SELECT tests.assert_null(public.get_public_round(:'priv_id'), 'a private round: NULL (by id)');
SELECT tests.assert_null(public.get_public_round(:'hidden_code'), 'a hidden (moderated) round: NULL');
SELECT tests.assert_null(public.get_public_round(:'carol_code'), 'a banned user''s round: NULL');
SELECT tests.assert_null(public.get_public_round('NOPE42'), 'an unknown code: NULL');
SELECT tests.assert_null(public.get_public_round(''), 'an empty code: NULL');
SELECT tests.assert_null(public.get_public_round(NULL), 'no code: NULL');
SELECT tests.assert_null(public.get_public_round(upper(:'priv_id')), 'an upper-cased private id: still NULL');
RESET ROLE;
SELECT tests.logout();

-- Signed in: the same answers (private rounds stay private, even for followers)
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(public.get_public_round(:'pub_code') -> 'round' ->> 'id', :'pub_id',
  'signed-in users can call it too');
SELECT tests.assert_null(public.get_public_round(:'priv_code'), 'a follower gets NULL for a private round');
RESET ROLE;
SELECT tests.logout();

-- At most 50 comments, oldest first; comment_count is the full count
INSERT INTO public.comments (round_id, user_id, content, created_at)
SELECT :'pub_id', :'bob', 'extra ' || i, timestamptz '2026-08-02T00:00:00Z' + i * interval '1 minute'
FROM generate_series(1, 53) AS i;
SELECT tests.login_anon();
SET ROLE anon;
SELECT public.get_public_round(:'pub_code') AS pr50 \gset
SELECT tests.assert_eq(jsonb_array_length(:'pr50'::jsonb -> 'comments'), 50, 'at most 50 comments');
SELECT tests.assert_eq((:'pr50'::jsonb ->> 'comment_count')::int, 55, 'comment_count counts all visible comments');
SELECT tests.assert_eq(:'pr50'::jsonb -> 'comments' -> 0 ->> 'content', 'First!', 'the oldest comes first');
RESET ROLE;
SELECT tests.logout();


-- ----------------------------------------------------------------------------
-- 4. EXECUTE hygiene
-- ----------------------------------------------------------------------------
SELECT tests.login_anon();
SET ROLE anon;
SELECT tests.expect_error($q$SELECT public.dogleg_to_num('4')$q$, '42501');
SELECT tests.expect_error(format('SELECT public.dogleg_recompute_handicap(%L)', :'alice'), '42501');
SELECT tests.expect_error(format('SELECT public.get_user_stats(%L)', :'alice'), '42501');  -- as before: signed-in only
RESET ROLE;

SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.expect_error($q$SELECT public.dogleg_nums('[1,2]'::jsonb)$q$, '42501');
SELECT tests.expect_error(format('SELECT public.dogleg_rebuild_user(%L, NULL)', :'alice'), '42501');
-- the app-facing RPCs still work for signed-in users
SELECT tests.assert_not_null(public.get_user_stats(:'bob'), 'get_user_stats');
SELECT tests.assert_not_null(public.get_course_page(:'course'), 'get_course_page');
SELECT tests.assert_not_null(public.get_feed_chronological_mixed(10, 0, 'mixed', 0.3), 'the feed RPC');
SELECT tests.assert_false(public.is_admin(), 'is_admin()');
RESET ROLE;
SELECT tests.logout();

SELECT tests.assert_true(has_function_privilege('anon', 'public.get_public_round(text)', 'EXECUTE'),
  'anon may call get_public_round');
SELECT tests.assert_eq(
  (SELECT count(*) FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'dogleg\_%'
     AND p.proname <> 'dogleg_is_banned'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0, 'no internal dogleg_* function is callable by an API role');
