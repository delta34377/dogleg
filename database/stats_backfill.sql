-- ============================================================================
-- Dogleg — Stats BACKFILL: recompute every historical round
-- ============================================================================
--
--   !!!  WARNING: THIS REWRITES EVERY USER'S HISTORY  !!!
--
--   It recomputes holes_played, differential, Dogleg Score, "strokes vs
--   usual" and achievement badges for EVERY round of EVERY user, then every
--   handicap index. Badges people have already seen can disappear or change,
--   Dogleg Scores can move, and handicap indexes can change.
--
--   Run it ONLY deliberately, for example:
--     * once, after the first install of database/stats_layer.sql, or
--     * after fixing a bug in the stats engine that affected old rounds.
--   Do NOT run it as part of normal migrations. (stats_layer.sql used to do
--   this every time it was pasted in; that is why this is a separate file.)
--
--   To fix ONE golfer's rounds, you don't need this file. Use, in the SQL
--   editor:   SELECT public.dogleg_rebuild_user('<their user id>', NULL);
--   To fix nine-hole rounds scored as 18 holes: repair_nine_hole_totals.sql.
--
-- BEFORE YOU RUN IT
--   1. database/stats_layer.sql must already be installed (this file uses its
--      functions and stops with an error if they are missing).
--   2. Optional but wise: Supabase dashboard → Database → Backups, and note
--      the time, so you can restore if the result looks wrong.
--
-- HOW TO RUN
--   SQL Editor → New query → paste this ENTIRE file → Run.
--   It runs as one transaction: if anything fails, nothing changes.
--   A NOTICE at the end says how many rounds changed. Running it a second
--   time right away changes nothing (it reports 0 rounds changed).
--
-- WHAT IT DOES
--   * Derives total_putts for rounds that tracked per-hole putts before the
--     total_putts column existed.
--   * For each user: re-scores all their rounds oldest first, exactly as if
--     they had been posted in date order, with the rules in stats_layer.sql
--     (dogleg_rebuild_user), then recomputes their handicap index.
--   * Rounds hidden by moderation (is_deleted = true) are skipped: they never
--     count anywhere, so their old values are left as they are.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.dogleg_rebuild_user(uuid, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Run database/stats_layer.sql first: public.dogleg_rebuild_user is missing.';
  END IF;
END $$;

-- A copy of the current values, only to report what changed at the end
-- (dropped automatically at COMMIT)
CREATE TEMP TABLE dogleg_backfill_before ON COMMIT DROP AS
SELECT id, holes_played, differential, dogleg_score, strokes_vs_usual, achievements
FROM public.rounds;

DO $$
DECLARE
  u record;
  n_users int := 0;
  n_failed int := 0;
  n_putts int;
  n_changed int;
BEGIN
  -- Derive total_putts for rounds that tracked per-hole putts before the
  -- total_putts column existed
  UPDATE public.rounds
  SET total_putts = public.dogleg_putts_total(to_jsonb(scores_by_hole), to_jsonb(stats_by_hole))
  WHERE total_putts IS NULL AND stats_by_hole IS NOT NULL
    AND public.dogleg_putts_total(to_jsonb(scores_by_hole), to_jsonb(stats_by_hole)) IS NOT NULL;
  GET DIAGNOSTICS n_putts = ROW_COUNT;

  -- Every profile, so users with no rounds left also get their index cleared
  FOR u IN SELECT id FROM public.profiles ORDER BY id LOOP
    BEGIN
      PERFORM public.dogleg_rebuild_user(u.id, NULL);
      n_users := n_users + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One user's bad data must not stop everyone else's backfill
      n_failed := n_failed + 1;
      RAISE WARNING 'stats backfill: user % skipped: %', u.id, SQLERRM;
    END;
  END LOOP;

  SELECT count(*) INTO n_changed
  FROM public.rounds r
  JOIN dogleg_backfill_before b ON b.id = r.id
  WHERE (r.holes_played, r.differential, r.dogleg_score, r.strokes_vs_usual, r.achievements)
        IS DISTINCT FROM
        (b.holes_played, b.differential, b.dogleg_score, b.strokes_vs_usual, b.achievements);

  RAISE NOTICE 'Stats backfill: % round(s) changed, % user(s) re-scored, % user(s) failed; total_putts filled in on % round(s).',
    n_changed, n_users, n_failed, n_putts;
END $$;

COMMIT;
