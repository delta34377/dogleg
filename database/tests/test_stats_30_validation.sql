-- ============================================================================
-- test_stats_30_validation.sql — score sanity limits (contract C8, ENTRY-3, ENTRY-10)
-- ============================================================================
-- Hard limits, enforced by the server with SQLSTATE 23514 and a readable
-- message: total 9-200, each hole 1-20, front/back nine 1-120, played_at at
-- most 1 day in the future. Enforced by a trigger only (no table CHECK), so
-- old out-of-range rows neither stop the migration nor block edits and
-- re-scoring of other values (SQL-1; see test_stats_35_legacy_totals.sql).
-- ============================================================================

SELECT tests.create_user('val@val.test') AS val \gset
SELECT tests.create_course('val-course') AS course \gset

-- Is scores_by_hole json or jsonb in this run (MOCK_SCORES_TYPE=jsonb or
-- json)? Only then can the browser send non-numbers in it at all.
SELECT format_type(atttypid, atttypmod) IN ('jsonb', 'json') AS scores_json
FROM pg_attribute WHERE attrelid = 'public.rounds'::regclass AND attname = 'scores_by_hole' \gset

-- A valid payload; each check below changes one thing
SELECT jsonb_build_object('user_id', :'val', 'course_id', :'course', 'tee_id', 'val-course-white',
                          'played_at', '2026-08-01T00:00:00', 'total_score', 90)::text AS ok \gset

SELECT tests.login_as(:'val');
SET ROLE authenticated;

-- ---- total_score 9..200 ----------------------------------------------------
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"total_score": 8}'), '23514', 'Total score must be between 9 and 200 (got 8).');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"total_score": 201}'), '23514', '%between 9 and 200%');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"total_score": 800}'), '23514');
SELECT tests.api_insert('public.rounds', :'ok'::jsonb || '{"total_score": 9, "played_at": "2026-08-02T00:00:00"}');
SELECT tests.api_insert('public.rounds', :'ok'::jsonb || '{"total_score": 200, "played_at": "2026-08-03T00:00:00"}');

-- ---- front9 / back9 1..120 ---------------------------------------------------
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"front9": 0}'), '23514', 'Front 9 score must be between 1 and 120%');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"back9": 121}'), '23514', 'Back 9 score must be between 1 and 120%');
SELECT tests.api_insert('public.rounds', :'ok'::jsonb || '{"front9": 120, "total_score": 120, "played_at": "2026-08-04T00:00:00"}');

-- ---- each hole 1..20, at most 18 holes ---------------------------------------
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"scores_by_hole": [4,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514',
  'Hole 2 score must be a whole number from 1 to 20 (got 0).');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"scores_by_hole": [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,21]}'), '23514', 'Hole 18 score%');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"scores_by_hole": [-3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514', 'Hole 1 score%');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"scores_by_hole": [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514', 'A round has at most 18 holes%');
-- blank holes are fine (a partial or nine-hole round), 1 and 20 are fine
SELECT tests.api_insert('public.rounds', :'ok'::jsonb ||
  '{"scores_by_hole": [1,20,4,4,4,4,4,4,4,null,null,null,null,null,null,null,null,null], "total_score": 49, "played_at": "2026-08-05T00:00:00"}');

\if :scores_json
  SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
    '{"scores_by_hole": [4,"abc",4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514', 'Hole 2 score%');
  SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
    '{"scores_by_hole": [4,4.5,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514', 'Hole 2 score%');
  SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
    '{"scores_by_hole": [4,{"x":1},4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]}'), '23514', 'Hole 2 score%');
  SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
    '{"scores_by_hole": {"1": 4}}'), '23514', '%must be a list%');
\endif

-- ---- played_at: at most 1 day in the future ----------------------------------
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || jsonb_build_object(%L, %L))',
  'public.rounds', :'ok', 'played_at', to_char(now() + interval '3 days', 'YYYY-MM-DD"T00:00:00"')),
  '23514', 'The date played can''t be in the future%');
SELECT tests.expect_error(format('SELECT tests.api_insert(%L, %L::jsonb || %L)', 'public.rounds', :'ok',
  '{"played_at": "2062-08-01T00:00:00"}'), '23514', '%future%');
-- "tomorrow" is allowed: the golfer's local date can be ahead of UTC
SELECT tests.api_insert('public.rounds', :'ok'::jsonb ||
  jsonb_build_object('played_at', to_char(now() + interval '12 hours', 'YYYY-MM-DD"T"HH24:MI:SS')));

RESET ROLE;
SELECT tests.logout();

SELECT tests.assert_eq((SELECT count(*) FROM public.rounds WHERE user_id = :'val'), 5,
  'only the 5 valid rounds were saved');


-- ----------------------------------------------------------------------------
-- UPDATEs: changed values are checked too, unchanged ones are not
-- ----------------------------------------------------------------------------
SELECT id AS some_round FROM public.rounds WHERE user_id = :'val' ORDER BY played_at LIMIT 1 \gset
SELECT tests.expect_error(format('UPDATE public.rounds SET total_score = 500 WHERE id = %L', :'some_round'),
  '23514', '%between 9 and 200%');
SELECT tests.expect_error(format($q$UPDATE public.rounds SET played_at = now() + interval '1 year' WHERE id = %L$q$,
  :'some_round'), '23514', '%future%');
-- hiding (soft-deleting) a valid round still works
SELECT tests.assert_eq(
  tests.exec_count(format('UPDATE public.rounds SET is_deleted = true WHERE id = %L', :'some_round')), 1,
  'a moderator can hide a round');


-- ----------------------------------------------------------------------------
-- No table CHECK on total_score (SQL-1). A CHECK, even NOT VALID, is checked
-- on every UPDATE of a row, so it broke the stats engine's own UPDATEs of old
-- out-of-range rows. The trigger above is the only limit: it checks new
-- rounds and changed totals, for every role. Simulate an old row from before
-- the limits.
-- ----------------------------------------------------------------------------
SELECT tests.assert_false(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.rounds'::regclass AND conname = 'rounds_total_score_range'),
  'there is no rounds_total_score_range CHECK');

ALTER TABLE public.rounds DISABLE TRIGGER trg_dogleg_check_round;
INSERT INTO public.rounds (user_id, course_id, played_at, total_score)
VALUES (:'val', :'course', '2026-06-01', 5) RETURNING id AS old_typo \gset
ALTER TABLE public.rounds ENABLE TRIGGER trg_dogleg_check_round;

-- An earlier draft of stats_layer.sql added the CHECK (NOT VALID). If it got
-- installed, re-running the file removes it.
ALTER TABLE public.rounds ADD CONSTRAINT rounds_total_score_range
  CHECK (total_score BETWEEN 9 AND 200 OR coalesce(is_deleted, false)) NOT VALID;

\ir ../stats_layer.sql

SELECT tests.assert_false(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.rounds'::regclass AND conname = 'rounds_total_score_range'),
  're-running stats_layer.sql drops the old draft CHECK');
SELECT tests.assert_eq((SELECT total_score FROM public.rounds WHERE id = :'old_typo'), 5,
  're-running the migration leaves the old row alone');

-- The old row can be edited (values other than the total), hidden and
-- restored, and the server can re-score it
SELECT tests.assert_eq(
  tests.exec_count(format($q$UPDATE public.rounds SET caption = 'x' WHERE id = %L$q$, :'old_typo')), 1,
  'an old out-of-range round can still be edited');
SELECT tests.assert_eq(
  tests.exec_count(format('UPDATE public.rounds SET is_deleted = true WHERE id = %L', :'old_typo')), 1,
  'an old out-of-range round can still be hidden');
SELECT tests.assert_eq(
  tests.exec_count(format('UPDATE public.rounds SET is_deleted = false WHERE id = %L', :'old_typo')), 1,
  '...and restored');
SELECT tests.assert_eq(
  tests.exec_count(format($q$UPDATE public.rounds SET achievements = '[]', holes_played = NULL WHERE id = %L$q$,
                          :'old_typo')), 1,
  'the stats engine can update its computed columns');
SELECT public.dogleg_rebuild_user(:'val', NULL);
SELECT tests.assert_true(
  (SELECT achievements @> '[{"type": "first_round"}]' FROM public.rounds WHERE id = :'old_typo'),
  'dogleg_rebuild_user re-scores it (it is the golfer''s first round)');
-- A changed total is still checked: another out-of-range value is refused
SELECT tests.expect_error(format('UPDATE public.rounds SET total_score = 4 WHERE id = %L', :'old_typo'),
  '23514', '%between 9 and 200%');
-- fixing the total works, and so does deleting it
SELECT tests.assert_eq(
  tests.exec_count(format('UPDATE public.rounds SET total_score = 85 WHERE id = %L', :'old_typo')), 1,
  'an old typo can be corrected');
SELECT tests.assert_eq(tests.exec_count(format('DELETE FROM public.rounds WHERE id = %L', :'old_typo')), 1,
  'an old row can be deleted');

-- The trigger still refuses a new out-of-range round even if it says it is hidden
SELECT tests.expect_error(format(
  $q$INSERT INTO public.rounds (user_id, course_id, total_score, is_deleted) VALUES (%L, %L, 5, true)$q$,
  :'val', :'course'), '23514', '%between 9 and 200%');
