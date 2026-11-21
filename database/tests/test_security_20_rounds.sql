-- ============================================================================
-- test_security_20_rounds.sql — rounds (and comment moderation) after
-- security_hardening.sql (ENTRY-4, STATS-2, SECURITY-4, contract C2)
-- ============================================================================
-- * The app's insert (C2: client-made id, holes_declared) works and returns
--   the server-computed columns; a retry with the same id is a 23505.
-- * The computed columns and is_deleted can't be sent or rewritten (42501).
-- * Other columns stay writable on your own round; other people's rounds
--   can't be inserted as, updated or deleted, even with loose policies.
-- * A moderator's hide (is_deleted) can't be undone by the author, for
--   rounds and for comments.
-- ============================================================================

SELECT tests.create_user('alice@rnd.test') AS alice \gset
SELECT tests.create_user('bob@rnd.test')   AS bob   \gset
SELECT tests.create_user('markgreenfield1@gmail.com', 'founder') AS founder \gset
SELECT tests.make_admin(:'founder');
SELECT tests.create_course('rnd-course') AS course \gset

-- The kind of extra policies an old Supabase template could have left behind
CREATE POLICY test_loose_insert ON public.rounds FOR INSERT WITH CHECK (true);
CREATE POLICY test_loose_update ON public.rounds FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY test_loose_delete ON public.rounds FOR DELETE USING (true);
CREATE POLICY test_loose_update ON public.comments FOR UPDATE USING (true) WITH CHECK (true);

-- What roundsService.saveRound sends (contract C2), minus id
SELECT jsonb_build_object(
  'user_id', :'alice', 'course_id', :'course', 'course_name', 'Test Course', 'club_name', 'Test Club',
  'city', 'Testville', 'state', 'TX', 'tee_id', 'rnd-course-white', 'tee_data', '{"tee_name": "White"}'::jsonb,
  'played_at', '2026-08-01T00:00:00', 'front9', NULL, 'back9', NULL, 'total_score', 90,
  'scores_by_hole', NULL, 'par', 72, 'course_pars', NULL, 'caption', 'Windy', 'photo_url', NULL,
  'created_at', now(), 'holes_declared', 18)::text AS payload \gset
SELECT gen_random_uuid() AS round_id \gset


-- ----------------------------------------------------------------------------
-- 1. The app's insert
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'alice');
SET ROLE authenticated;

SELECT tests.api_insert('public.rounds', :'payload'::jsonb || jsonb_build_object('id', :'round_id')) AS saved \gset
SELECT tests.assert_eq(:'saved'::jsonb ->> 'id', :'round_id', 'the client-made id is kept');
SELECT tests.assert_eq((:'saved'::jsonb ->> 'holes_played')::int, 18, 'holes_played comes back');
SELECT tests.assert_eq((:'saved'::jsonb ->> 'differential')::numeric, 16.1, 'differential comes back ((90 - 71.5) x 113 / 130)');
SELECT tests.assert_not_null(:'saved'::jsonb ->> 'short_code', 'short_code comes back');
SELECT tests.assert_not_null(:'saved'::jsonb -> 'achievements', 'achievements come back');

-- A retry after a lost reply: unique violation, and the row can be read back
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb)', 'public.rounds',
  :'payload'::jsonb || jsonb_build_object('id', :'round_id')), '23505');
SELECT tests.assert_eq(tests.query_count(format('SELECT 1 FROM public.rounds WHERE id = %L', :'round_id')), 1,
  'the retry finds the saved round by id');


-- ----------------------------------------------------------------------------
-- 2. Computed / moderation columns can't be sent on insert...
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  base jsonb := jsonb_build_object('user_id', tests.user_id('alice@rnd.test'), 'course_id', 'rnd-course',
                                   'played_at', '2026-08-02T00:00:00', 'total_score', 88);
  forged jsonb;
BEGIN
  FOREACH forged IN ARRAY ARRAY[
    '{"holes_played": 9}', '{"differential": -5}', '{"dogleg_score": 10}',
    '{"strokes_vs_usual": 30}', '{"achievements": [{"label": {"x": 1}}]}',
    '{"short_code": "AAAAAA"}', '{"is_deleted": false}'
  ]::jsonb[] LOOP
    PERFORM tests.expect_error(
      format('SELECT tests.api_insert(%L, %L::jsonb)', 'public.rounds', base || forged),
      '42501', '%permission denied%');
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 3. ...or rewritten later. Other columns of your own round stay writable.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  rid text := (SELECT id::text FROM public.rounds WHERE user_id = tests.user_id('alice@rnd.test') LIMIT 1);
  forged jsonb;
BEGIN
  FOREACH forged IN ARRAY ARRAY[
    '{"holes_played": 9}', '{"differential": -5}', '{"dogleg_score": 10}',
    '{"strokes_vs_usual": 30}', '{"achievements": []}', '{"short_code": "AAAAAA"}',
    '{"is_deleted": true}', '{"caption": "ok", "differential": -5}'
  ]::jsonb[] LOOP
    PERFORM tests.expect_error(
      format('SELECT tests.api_update(%L, %L::jsonb, %L)', 'public.rounds', forged, format('id = %L', rid)),
      '42501', '%permission denied%');
  END LOOP;
END $$;

SELECT tests.assert_eq(
  tests.api_update('public.rounds', '{"caption": "Windy, but fun"}', format('id = %L', :'round_id')), 1,
  'the owner can still edit an ordinary column (caption)');
RESET ROLE;
SELECT tests.assert_eq(
  (SELECT ARRAY[caption, differential::text] FROM public.rounds WHERE id = :'round_id'),
  ARRAY['Windy, but fun', '16.1'], 'caption changed; differential untouched');


-- ----------------------------------------------------------------------------
-- 4. Someone else's round: can't post as Alice, edit or delete hers
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb)', 'public.rounds',
  :'payload'::jsonb || jsonb_build_object('played_at', '2026-08-03T00:00:00')),
  '42501', '%row-level security%');
SELECT tests.assert_eq(
  tests.api_update('public.rounds', '{"caption": "hacked"}', format('id = %L', :'round_id')), 0,
  'Bob cannot edit Alice''s round');
SELECT tests.assert_eq(
  tests.exec_count(format('DELETE FROM public.rounds WHERE id = %L', :'round_id')), 0,
  'Bob cannot delete Alice''s round');
-- Bob can't hand his own round over to Alice either
SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'bob', 'course_id', :'course',
  'played_at', '2026-08-01T00:00:00', 'total_score', 99)) ->> 'id' AS bob_round \gset
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.rounds', jsonb_build_object('user_id', %L), %L)$q$,
         :'alice', format('id = %L', :'bob_round')),
  '42501', '%row-level security%');
RESET ROLE;
SELECT tests.assert_eq((SELECT count(*) FROM public.rounds WHERE user_id = :'alice'), 1,
  'Alice still has exactly her one round');


-- ----------------------------------------------------------------------------
-- 5. Moderation sticks: the founder hides Alice's round and comment through
--    the admin RPCs; Alice can't un-hide either of them
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', :'bob', 'round_id', :'round_id', 'content', 'Nice', 'created_at', now())) ->> 'id' AS bob_comment \gset
SELECT tests.expect_error(format($q$SELECT tests.api_insert('public.comments', jsonb_build_object(
  'user_id', %L, 'round_id', %L, 'content', 'x', 'is_deleted', false))$q$, :'bob', :'round_id'), '42501');
RESET ROLE;

SELECT tests.login_as(:'founder');
SET ROLE authenticated;
SELECT public.delete_round_admin(:'round_id');
SELECT public.delete_comment_admin(:'bob_comment');
RESET ROLE;
SELECT tests.assert_true((SELECT is_deleted FROM public.rounds WHERE id = :'round_id'), 'the admin RPC hid the round');

SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.rounds', '{"is_deleted": false}', %L)$q$, format('id = %L', :'round_id')),
  '42501');
RESET ROLE;
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.expect_error(
  format($q$SELECT tests.api_update('public.comments', '{"is_deleted": false}', %L)$q$, format('id = %L', :'bob_comment')),
  '42501');
RESET ROLE;
SELECT tests.assert_true((SELECT is_deleted FROM public.rounds WHERE id = :'round_id'), 'the round stays hidden');
SELECT tests.assert_true((SELECT is_deleted FROM public.comments WHERE id = :'bob_comment'), 'the comment stays hidden');


-- ----------------------------------------------------------------------------
-- 6. Deleting your own round still works (roundsService.deleteRound uses
--    .delete().select('id'), i.e. DELETE ... RETURNING)
-- ----------------------------------------------------------------------------
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(
  tests.exec_count(format('DELETE FROM public.rounds WHERE id = %L AND user_id = %L RETURNING id',
                          :'bob_round', :'bob')), 1,
  'Bob deletes his own round (with RETURNING, like .delete().select())');
RESET ROLE;
SELECT tests.logout();
SELECT tests.assert_eq((SELECT count(*) FROM public.rounds WHERE id = :'bob_round'), 0, 'it is gone');

-- Every computed column is server-only for both API roles
SELECT tests.assert_eq(
  (SELECT count(*)
   FROM unnest(ARRAY['holes_played', 'differential', 'dogleg_score', 'strokes_vs_usual',
                     'achievements', 'short_code', 'is_deleted']) AS c,
        unnest(ARRAY['anon', 'authenticated']) AS r,
        unnest(ARRAY['INSERT', 'UPDATE']) AS p
   WHERE has_column_privilege(r, 'public.rounds', c, p)),
  0, 'no API role may INSERT or UPDATE a computed rounds column');
SELECT tests.assert_true(has_column_privilege('authenticated', 'public.rounds', 'holes_declared', 'INSERT'),
  'holes_declared (C2) stays writable');
SELECT tests.assert_true(has_column_privilege('authenticated', 'public.rounds', 'id', 'INSERT'),
  'id (C2) stays writable');
