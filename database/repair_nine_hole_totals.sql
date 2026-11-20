-- ============================================================================
-- Dogleg — ONE-TIME REPAIR: nine-hole rounds that were scored as 18 holes
-- ============================================================================
-- THE PROBLEM (report findings ENTRY-1 / STATS-1)
--   Until November 2026, Quick Score had no "9 holes / 18 holes" choice. A
--   golfer who played nine holes and typed only a total (say 47) got that
--   round scored as an 18-hole round: an impossible differential around -21,
--   a 10.0 Dogleg Score, "New personal best" / "First time breaking 70"
--   badges, the course record, and a handicap index that can go negative.
--   New rounds can't do this any more (the app now sends holes_declared and
--   stats_layer.sql uses it), but rounds posted before that are still wrong.
--
-- BEFORE YOU START
--   database/stats_layer.sql must already be installed.
--
-- WHAT RUNNING THIS FILE DOES
--   It changes NO rounds by itself. It installs two helpers that only the
--   SQL editor can use (the app can't call them):
--     public.dogleg_suspect_nine_hole_rounds()    lists the suspect rounds (read-only)
--     public.dogleg_set_holes_declared(id, 9|18)  fixes one round
--   and then shows the list. Running it again is safe.
--
-- HOW TO FIX ROUNDS (step by step)
--   1. SQL Editor → New query → paste this ENTIRE file → Run.
--      The result grid lists the suspect rounds: who, which course, when,
--      the total, and the stats it got. (To see the list again later, run:
--          SELECT * FROM public.dogleg_suspect_nine_hole_rounds();  )
--   2. For each row, decide whether it really was nine holes. A total under
--      60 over 18 holes is almost impossible, but check with the golfer if
--      you can: this list is CANDIDATES, not proof.
--   3. Fix one round by running, in a new query (copy the id from the list):
--          SELECT public.dogleg_set_holes_declared('PASTE-THE-ROUND-ID-HERE', 9);
--      That marks it as 9 holes and re-scores that golfer's rounds from that
--      round's date on (differentials, Dogleg Scores, badges, handicap
--      index). The result shows the round's new values.
--      Made a mistake? Run it again with 18 (or NULL for "not said") to undo.
--   4. Run the list again: fixed rounds drop off it (they are 9-hole rounds
--      now).
--
--   Optional, all at once — ONLY if you are sure that EVERY round on the
--   list with a total under 60 was nine holes:
--          SELECT public.dogleg_set_holes_declared(id, 9)
--          FROM public.dogleg_suspect_nine_hole_rounds()
--          WHERE total_score < 60;
--
-- ALSO: OLD ROUNDS OUTSIDE THE NEW SCORE LIMITS
--   stats_layer.sql added a rule that a total must be 9-200. Old rounds that
--   break it were left alone, and they don't get in the way: they can be
--   edited, hidden or deleted, and the stats engine re-scores them like any
--   other round. Only a change of the total itself is checked: the new total
--   must be 9-200.
--   A NOTICE below says how many there are. To see them, run:
--          SELECT id, user_id, course_name, played_at, total_score
--          FROM public.rounds WHERE total_score NOT BETWEEN 9 AND 200;
--   and fix each total (e.g. UPDATE public.rounds SET total_score = 85
--   WHERE id = '...';) or delete the round.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'rounds'
                   AND column_name = 'holes_declared') THEN
    RAISE EXCEPTION 'Run database/stats_layer.sql first: rounds.holes_declared is missing.';
  END IF;

  SELECT count(*) INTO bad FROM public.rounds WHERE total_score NOT BETWEEN 9 AND 200;
  IF bad > 0 THEN
    RAISE NOTICE '% round(s) have a total outside 9-200 (see "OLD ROUNDS OUTSIDE THE NEW SCORE LIMITS" at the top of this file).', bad;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- The list of suspects (read-only).
-- A total typed on its own (no hole-by-hole scores, no front/back nine),
-- counted as 18 holes, and either under 60 or with a differential below -5.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dogleg_suspect_nine_hole_rounds()
RETURNS TABLE (
  username text, course text, played_on date, total_score integer,
  holes_played integer, differential numeric, dogleg_score numeric,
  id uuid, user_id uuid
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p.username::text,
         coalesce(nullif(r.course_name, ''), c.course_name)::text,
         r.played_at::date,
         r.total_score::integer,
         r.holes_played::integer,
         r.differential::numeric,
         r.dogleg_score::numeric,
         r.id,
         r.user_id
  FROM public.rounds r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN public.courses c ON c.course_id = r.course_id
  WHERE (r.is_deleted IS NULL OR r.is_deleted = false)
    AND r.holes_played = 18
    AND r.front9 IS NULL AND r.back9 IS NULL
    -- no hole-by-hole scores (works whether the column is int[] or jsonb)
    AND NOT EXISTS (SELECT 1 FROM unnest(public.dogleg_nums(to_jsonb(r.scores_by_hole))) s
                    WHERE s IS NOT NULL)
    AND (r.total_score < 60 OR r.differential < -5)
  ORDER BY 1, 3;
$$;

REVOKE EXECUTE ON FUNCTION public.dogleg_suspect_nine_hole_rounds() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- The fix for one round.
-- SECURITY DEFINER so it can re-score any golfer; for that reason the app
-- can't call it (EXECUTE revoked below). Only the SQL editor can.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dogleg_set_holes_declared(p_round_id uuid, p_holes int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rounds;
  prev_flag text;
BEGIN
  IF p_holes IS NOT NULL AND p_holes NOT IN (9, 18) THEN
    RAISE EXCEPTION 'p_holes must be 9, 18 or NULL (got %)', p_holes;
  END IF;

  SELECT * INTO r FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No round with id %', p_round_id;
  END IF;

  -- Change the column without the row trigger re-scoring by itself; the
  -- explicit re-score right after does it, once.
  prev_flag := current_setting('dogleg.in_rebuild', true);
  PERFORM set_config('dogleg.in_rebuild', 'on', true);
  UPDATE public.rounds SET holes_declared = p_holes WHERE id = p_round_id;
  PERFORM set_config('dogleg.in_rebuild', coalesce(nullif(prev_flag, ''), 'off'), true);

  -- Re-score this golfer from this round's date on, then their index
  PERFORM public.dogleg_rebuild_user(r.user_id, r.played_at);

  RETURN (SELECT jsonb_build_object(
            'id', x.id, 'total_score', x.total_score, 'holes_declared', x.holes_declared,
            'holes_played', x.holes_played, 'differential', x.differential,
            'dogleg_score', x.dogleg_score, 'achievements', x.achievements,
            'handicap_index_now', (SELECT handicap_index FROM public.profiles WHERE id = x.user_id))
          FROM public.rounds x WHERE x.id = p_round_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dogleg_set_holes_declared(uuid, int) FROM PUBLIC, anon, authenticated;

COMMIT;


-- The list (the result grid shows this)
SELECT username, course, played_on, total_score, holes_played, differential, dogleg_score, id
FROM public.dogleg_suspect_nine_hole_rounds();
