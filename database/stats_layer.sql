-- ============================================================================
-- Dogleg — Stats Layer Migration (Strava-for-Golf foundation)
-- ============================================================================
-- WHAT THIS ADDS
--   1. rounds.holes_played / rounds.differential  — WHS score differential per
--      round, computed automatically from the selected tee's slope & rating.
--   2. profiles.handicap_index — auto-calculated WHS-style handicap
--      (best 8 of last 20 differentials, with the official small-sample table).
--   3. rounds.dogleg_score + rounds.strokes_vs_usual — the 0.0–10.0 "how good
--      was this round FOR YOU" metric (see docs/stats_pivot_plan.md).
--   4. rounds.achievements — auto-detected PRs & milestones (personal best,
--      broke 100/90/80/70, course PR, most birdies...).
--   5. rounds.stats_by_hole — optional per-hole putts (entered in the app).
--   6. rounds.holes_declared — the 9 / 18 holes choice the app sends, so a
--      nine-hole score typed into "Total" is no longer scored as 18 holes.
--   7. Score sanity limits (total 9-200, each hole 1-20, each nine 1-120, no
--      dates more than a day in the future). Breaking one rejects the insert
--      with error code 23514 and a readable message.
--   8. Automatic re-scoring: posting an OLDER round, deleting a round or
--      hiding/restoring one re-computes that golfer's later rounds.
--   9. RPCs: get_user_stats(uuid), get_course_page(text) — everything the
--      Stats tab and Course pages need in one call each.
--
-- HOW TO RUN
--   Run order: database/stats_layer.sql -> database/feed_algorithm.sql ->
--   database/security_hardening.sql (run this file first), and run them
--   BEFORE merging the matching app changes (the app sends holes_declared).
--   1. Open Supabase dashboard → SQL Editor → New query
--   2. Paste this ENTIRE file and click "Run"
--   3. You should see "Success. No rows returned" (NOTICEs are normal).
--   Safe to re-run at any time: it only (re)creates columns, functions and
--   triggers. It does NOT change any existing round — every user's Dogleg
--   Scores, badges and differentials stay exactly as they are.
--   The whole file runs as one transaction: if anything fails, nothing changes.
--
--   Recomputing EVERY historical round is a separate, deliberate step:
--   database/stats_backfill.sql (read its warning first). Fixing nine-hole
--   rounds that were scored as 18 holes: database/repair_nine_hole_totals.sql.
--
-- DESIGN NOTES
--   * A stats bug must NEVER block posting a round: the trigger wraps all
--     computation in an exception handler and leaves the computed columns
--     NULL if anything unexpected happens. (The score limits in PART 6 are
--     the one deliberate exception: they reject impossible scores.)
--   * The browser can't forge stats. The insert trigger first throws away
--     whatever the client sent for holes_played, differential, dogleg_score,
--     strokes_vs_usual and achievements; it reads tee ratings from
--     public.tees (by tee_id) and pars from public.courses, never from the
--     client's tee_data / par / course_pars when the course is known.
--     tee_data is kept for display only.
--   * "Before this round" means one thing everywhere: ordered by
--     (played_at, created_at, id). Two rounds on the same day are ordered by
--     when they were posted. created_at is set by the server for app posts.
--   * Soft-deleted rounds (is_deleted = true) are excluded everywhere.
--   * 9-hole rounds (WHS 2024 method): the 9-hole differential is combined
--     with an expected differential for the unplayed nine (0.52 x index + 1.2,
--     which reproduces the USGA's published example exactly). Requires the
--     nine's ratings and an index (or the manually entered handicap as a
--     cold-start stand-in) — otherwise the round stays pending (NULL),
--     matching how WHS holds 9-hole scores until an index exists.
--     Plain doubling was rejected: it doubles the variance of the entry, and
--     best-8-of-20 selection then systematically favors those entries,
--     biasing the index low for players who post many nines.
--   * How many holes? Hole-by-hole scores or front/back nine scores decide.
--     A total on its own uses the 9/18 choice the app sends (holes_declared),
--     then "the course only has 9 holes", then the old guess (45-160 = 18).
--   * Ratings accuracy tiers (July 2026): picked tee (exact WHS) -> course's
--     median-rated tee (estimate) -> par at slope 113 (rough). A skipped tee
--     picker no longer blocks stats; it just costs precision. The handicap
--     index therefore includes estimated differentials — documented app
--     behavior, not a GHIN substitute.
--   * Adjusted gross ("net double bogey") applies to hole-by-hole rounds:
--     with an index we cap each hole at par + 2 + strokes received (using the
--     course's stroke-index allocation); without one we use the WHS par + 5
--     rule. Quick-Score rounds use the raw total (documented accuracy tier).
--   * The index used for a round (net double bogey, nine conversions) is the
--     index AS OF that round, rebuilt from the rounds before it, so re-scoring
--     an old round gives the same answer it got when it was posted.
--   * scores_by_hole / course_pars / courses.handicaps may be stored as
--     int[], text[] or jsonb depending on how the table was created — every
--     reader goes through to_jsonb() + dogleg_nums() so all cases work.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1 — Columns, limits and indexes
-- ============================================================================

ALTER TABLE public.rounds
  -- holes_played already exists in production (integer, default 18); the
  -- insert trigger computes it honestly for every new round
  ADD COLUMN IF NOT EXISTS holes_played     integer,
  ADD COLUMN IF NOT EXISTS differential     numeric(5,1),
  ADD COLUMN IF NOT EXISTS dogleg_score     numeric(3,1),
  ADD COLUMN IF NOT EXISTS strokes_vs_usual numeric(4,1),
  ADD COLUMN IF NOT EXISTS achievements     jsonb,
  ADD COLUMN IF NOT EXISTS stats_by_hole    jsonb,
  ADD COLUMN IF NOT EXISTS total_putts      integer,
  -- What the golfer picked in the app: 9 or 18 holes (NULL = not said, e.g.
  -- rounds posted before this column existed). The CHECK is only created
  -- together with the column, so re-running this file is a no-op here.
  ADD COLUMN IF NOT EXISTS holes_declared   smallint
    CONSTRAINT rounds_holes_declared_check CHECK (holes_declared IN (9, 18));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handicap_index numeric(4,1);

-- Total score sanity limit as a table constraint (the trigger in PART 6 checks
-- the same limit first, with a friendlier message). NOT VALID: rows already in
-- the table are not checked, so an old typo can't make this migration fail.
-- Hidden (is_deleted) rounds are exempt, so a moderator can always hide an
-- old out-of-range round. Any other edit of such an old row fails until its
-- total is fixed; it can still be deleted. repair_nine_hole_totals.sql
-- explains how to find them.
DO $$
DECLARE
  bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.rounds'::regclass
                   AND conname = 'rounds_total_score_range') THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_total_score_range
      CHECK (total_score BETWEEN 9 AND 200 OR coalesce(is_deleted, false)) NOT VALID;
  END IF;

  SELECT count(*) INTO bad FROM public.rounds WHERE total_score NOT BETWEEN 9 AND 200;
  IF bad > 0 THEN
    RAISE NOTICE '% existing round(s) have a total outside 9-200. They stay as they are; repair_nine_hole_totals.sql explains how to find and fix them.', bad;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rounds_user_played
  ON public.rounds (user_id, played_at DESC)
  WHERE (is_deleted IS NULL OR is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_rounds_course_score
  ON public.rounds (course_id, total_score ASC)
  WHERE (is_deleted IS NULL OR is_deleted = false);


-- ============================================================================
-- PART 2 — Small helpers
-- ============================================================================

-- Text → numeric that never throws (returns NULL for junk like '' or 'abc').
-- A pattern check instead of catching a cast error: catching errors costs a
-- subtransaction per call, and this runs tens of thousands of times when a
-- golfer's history is re-scored (STATS-8). Accepts '4', ' 4 ', '+4', '-1.5',
-- '4.', '.5'; rejects exponents ('1e1'), 'NaN' and 'Infinity'.
CREATE OR REPLACE FUNCTION public.dogleg_to_num(t text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN t ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$' THEN t::numeric END
$$;

-- Any jsonb array (of numbers, numeric strings, or nulls) → numeric[]
-- Callers pass to_jsonb(col) so int[], text[] and jsonb columns all work.
CREATE OR REPLACE FUNCTION public.dogleg_nums(j jsonb)
RETURNS numeric[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL
    ELSE (
      SELECT array_agg(public.dogleg_to_num(e #>> '{}') ORDER BY ord)
      FROM jsonb_array_elements(j) WITH ORDINALITY t(e, ord)
    )
  END;
$$;

-- How many holes does this round cover? (18, 9, a partial count, or NULL =
-- can't tell). In order of trust:
--   1. hole-by-hole scores (count the filled holes)
--   2. front-nine / back-nine scores
--   3. a total on its own: the golfer's 9/18 choice (p_declared), else "the
--      course only has 9 holes" (p_course_holes), else a total of 45-160 is
--      assumed to be 18 holes (the pre-November 2026 rule)
CREATE OR REPLACE FUNCTION public.dogleg_holes_played(
  p_scores jsonb, p_front9 numeric, p_back9 numeric, p_total numeric,
  p_declared integer, p_course_holes integer
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  scores numeric[];
  filled int;
  one_nine numeric;
BEGIN
  scores := public.dogleg_nums(p_scores);
  IF scores IS NOT NULL THEN
    SELECT count(*) INTO filled FROM unnest(scores) s WHERE s IS NOT NULL;
    IF filled > 0 THEN RETURN filled; END IF;  -- 18, 9 or a partial round
    -- fall through when the array exists but is empty
  END IF;

  IF p_front9 IS NOT NULL AND p_back9 IS NOT NULL THEN RETURN 18; END IF;

  one_nine := coalesce(p_front9, p_back9);
  IF one_nine IS NOT NULL THEN
    -- One nine entered and it IS the total → a 9-hole round
    IF p_total IS NULL OR p_total = one_nine THEN RETURN 9; END IF;
    -- The total is more than that nine → it includes the other nine too
    IF p_total > one_nine THEN RETURN 18; END IF;
    RETURN NULL;
  END IF;

  -- Total only
  IF p_total IS NULL THEN RETURN NULL; END IF;
  IF p_declared IN (9, 18) THEN RETURN p_declared; END IF;
  IF p_course_holes = 9 THEN RETURN 9; END IF;
  IF p_total BETWEEN 45 AND 160 THEN RETURN 18; END IF;
  RETURN NULL;
END;
$$;

-- The original 4-argument version, kept so older callers keep working
-- (no 9/18 choice, no course information).
CREATE OR REPLACE FUNCTION public.dogleg_holes_played(
  p_scores jsonb, p_front9 numeric, p_back9 numeric, p_total numeric
) RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT public.dogleg_holes_played(p_scores, p_front9, p_back9, p_total,
                                    NULL::integer, NULL::integer);
$$;

-- Total putts derived from per-hole entries — only when every scored hole
-- has a putts value (a partial sum would understate the round)
CREATE OR REPLACE FUNCTION public.dogleg_putts_total(p_scores jsonb, p_stats jsonb)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  scored int;
  putt_cnt int;
  putt_sum int;
BEGIN
  IF p_stats IS NULL OR jsonb_typeof(p_stats) <> 'array' THEN RETURN NULL; END IF;

  SELECT count(*) INTO scored
  FROM unnest(public.dogleg_nums(p_scores)) s WHERE s IS NOT NULL;

  SELECT count(*) FILTER (WHERE public.dogleg_to_num(e ->> 'putts') IS NOT NULL),
         sum(public.dogleg_to_num(e ->> 'putts'))::int
  INTO putt_cnt, putt_sum
  FROM jsonb_array_elements(p_stats) e;

  IF putt_cnt > 0 AND putt_cnt = scored THEN RETURN putt_sum; END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Birdies-or-better in an 18-hole hole-by-hole round (NULL when the round
-- doesn't have 18 hole scores and 18 pars). Parses each array exactly once
-- (the old per-hole re-parsing made posting slow for long histories, STATS-8).
CREATE OR REPLACE FUNCTION public.dogleg_birdies(p_scores jsonb, p_pars jsonb)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s numeric[] := public.dogleg_nums(p_scores);
  p numeric[] := public.dogleg_nums(p_pars);
  n int := 0;
BEGIN
  IF array_length(s, 1) IS DISTINCT FROM 18 OR array_length(p, 1) IS DISTINCT FROM 18 THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..18 LOOP
    IF s[i] <= p[i] - 1 THEN   -- NULL (a blank hole) is never true
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- Does this round count for records (personal best, course PR, leaderboards)?
-- Only full 18-hole rounds with a plausible differential: that leaves out
-- nines, partial rounds, and implausible entries such as eighteen 1s.
CREATE OR REPLACE FUNCTION public.dogleg_counts_for_records(
  p_holes integer, p_differential numeric, p_total numeric
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(p_holes = 18 AND p_differential IS NOT NULL AND p_total IS NOT NULL, false);
$$;

-- Dogleg Score from a baseline (the golfer's typical differential) and this
-- round's differential, clamped to 0.0–10.0.
CREATE OR REPLACE FUNCTION public.dogleg_score_value(p_baseline numeric, p_differential numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT greatest(0.0, least(10.0, round(6.0 + 0.4 * (p_baseline - p_differential), 1)));
$$;

-- WHS index from a set of differentials sorted lowest first (the official
-- small-sample table); NULL with fewer than 3. Capped at 54.0.
CREATE OR REPLACE FUNCTION public.dogleg_index_from_diffs(diffs numeric[])
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int := coalesce(array_length(diffs, 1), 0);
  new_index numeric;
BEGIN
  new_index := CASE
    WHEN n < 3  THEN NULL
    WHEN n = 3  THEN diffs[1] - 2.0
    WHEN n = 4  THEN diffs[1] - 1.0
    WHEN n = 5  THEN diffs[1]
    WHEN n = 6  THEN (diffs[1] + diffs[2]) / 2.0 - 1.0
    WHEN n <= 8 THEN (diffs[1] + diffs[2]) / 2.0
    WHEN n <= 11 THEN (diffs[1] + diffs[2] + diffs[3]) / 3.0
    WHEN n <= 14 THEN (diffs[1] + diffs[2] + diffs[3] + diffs[4]) / 4.0
    WHEN n <= 16 THEN (diffs[1] + diffs[2] + diffs[3] + diffs[4] + diffs[5]) / 5.0
    WHEN n <= 18 THEN (diffs[1] + diffs[2] + diffs[3] + diffs[4] + diffs[5] + diffs[6]) / 6.0
    WHEN n = 19 THEN (diffs[1] + diffs[2] + diffs[3] + diffs[4] + diffs[5] + diffs[6] + diffs[7]) / 7.0
    ELSE (diffs[1] + diffs[2] + diffs[3] + diffs[4] + diffs[5] + diffs[6] + diffs[7] + diffs[8]) / 8.0
  END;

  IF new_index IS NOT NULL THEN
    new_index := least(round(new_index, 1), 54.0);
  END IF;
  RETURN new_index;
END;
$$;

-- Sanity guard for a finished 18-hole-equivalent differential. Below -10
-- (better than a +10 handicap) is not a real amateur round: it's almost
-- always a nine-hole score scored as 18 holes or a typo, so it is not
-- counted (NULL) instead of wrecking the golfer's index.
CREATE OR REPLACE FUNCTION public.dogleg_sane_differential(p_differential numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p_differential BETWEEN -10 AND 150 THEN round(p_differential, 1) END;
$$;

-- WHS 2024 nine-hole conversion: the nine's differential plus the expected
-- differential for the unplayed nine (0.52 x index + 1.2).
CREATE OR REPLACE FUNCTION public.dogleg_nine_to_18(p_d9 numeric, p_index numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT public.dogleg_sane_differential(p_d9 + 0.52 * p_index + 1.2);
$$;


-- ============================================================================
-- PART 3 — Reference data from the database (never from the browser)
-- ============================================================================

-- A copy of the round with par / course_pars taken from public.courses when
-- the course has that data. The browser sends both, but it could send
-- anything (and sends fake all-4 pars when a course has none).
CREATE OR REPLACE FUNCTION public.dogleg_with_course_data(r public.rounds)
RETURNS public.rounds
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  c_pars jsonb;
  c_total_par numeric;
  pars numeric[];
  filled int;
  pars_sum numeric;
BEGIN
  SELECT to_jsonb(c.pars), public.dogleg_to_num(c.total_par::text)
  INTO c_pars, c_total_par
  FROM public.courses c WHERE c.course_id = r.course_id;
  IF NOT FOUND THEN RETURN r; END IF;

  pars := public.dogleg_nums(c_pars);
  SELECT count(p), sum(p) INTO filled, pars_sum FROM unnest(pars) p;

  IF filled >= 9 THEN
    -- jsonb_populate_record converts the jsonb array to whatever type
    -- rounds.course_pars has (int[], text[] or jsonb)
    r := jsonb_populate_record(r, jsonb_build_object('course_pars',
           (SELECT jsonb_agg(CASE WHEN p IS NULL THEN NULL ELSE round(p)::int END ORDER BY o)
            FROM unnest(pars) WITH ORDINALITY u(p, o))));
  END IF;

  IF c_total_par BETWEEN 27 AND 90 THEN
    r.par := c_total_par;
  ELSIF filled >= 9 AND pars_sum BETWEEN 27 AND 90 THEN
    r.par := pars_sum;
  END IF;
  RETURN r;
END;
$$;

-- How many holes this round covers, with its course's hole count as a hint.
CREATE OR REPLACE FUNCTION public.dogleg_round_holes(r public.rounds)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT public.dogleg_holes_played(
    to_jsonb(r.scores_by_hole), r.front9, r.back9, r.total_score, r.holes_declared,
    (SELECT public.dogleg_to_num(c.num_holes::text)::int
     FROM public.courses c WHERE c.course_id = r.course_id));
$$;

-- Slope / course rating of one tees row (as jsonb) for p_part:
--   '18'    the full 18 holes
--   'front' / 'back'  one nine
--   'nine'  a nine, but we don't know which: the average of the two
-- Returns {"slope": .., "rating": ..} or NULL when the tee has no usable
-- ratings for that part. Handles nine-hole courses (STATS-6), whose tees
-- may store their 9-hole rating in slope/course_rating or in the front-nine
-- columns: an 18 there is the nine played twice.
CREATE OR REPLACE FUNCTION public.dogleg_tee_rating(p_tee jsonb, p_part text, p_nine_course boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s  numeric;
  cr numeric;
  s9 numeric;
  cr9 numeric;
  f  jsonb;
  b  jsonb;
BEGIN
  IF p_tee IS NULL OR jsonb_typeof(p_tee) <> 'object' THEN RETURN NULL; END IF;
  s  := public.dogleg_to_num(p_tee ->> 'slope');
  cr := public.dogleg_to_num(p_tee ->> 'course_rating');

  IF p_part = '18' THEN
    IF s BETWEEN 55 AND 155 AND cr BETWEEN 40 AND 90 THEN
      RETURN jsonb_build_object('slope', s, 'rating', cr);
    END IF;
    -- Build it from the two nines (WHS: ratings add up, slopes average)
    f := public.dogleg_tee_rating(p_tee, 'front', p_nine_course);
    b := public.dogleg_tee_rating(p_tee, 'back', p_nine_course);
    IF f IS NOT NULL AND b IS NOT NULL THEN
      RETURN jsonb_build_object(
        'slope',  round(((f ->> 'slope')::numeric + (b ->> 'slope')::numeric) / 2),
        'rating', (f ->> 'rating')::numeric + (b ->> 'rating')::numeric);
    END IF;
    RETURN NULL;
  END IF;

  IF p_part = 'nine' THEN
    f := public.dogleg_tee_rating(p_tee, 'front', p_nine_course);
    b := public.dogleg_tee_rating(p_tee, 'back', p_nine_course);
    IF f IS NOT NULL AND b IS NOT NULL THEN
      RETURN jsonb_build_object(
        'slope',  ((f ->> 'slope')::numeric + (b ->> 'slope')::numeric) / 2,
        'rating', ((f ->> 'rating')::numeric + (b ->> 'rating')::numeric) / 2);
    END IF;
    RETURN coalesce(f, b);
  END IF;

  -- One named nine
  IF p_part = 'front' THEN
    s9  := public.dogleg_to_num(p_tee ->> 'slope_front9');
    cr9 := public.dogleg_to_num(p_tee ->> 'cr_front9');
  ELSE
    s9  := public.dogleg_to_num(p_tee ->> 'slope_back9');
    cr9 := public.dogleg_to_num(p_tee ->> 'cr_back9');
  END IF;
  IF s9 BETWEEN 55 AND 155 AND cr9 BETWEEN 20 AND 45 THEN
    RETURN jsonb_build_object('slope', s9, 'rating', cr9);
  END IF;
  -- A nine-hole course has only one nine: its "back nine" is the same holes
  IF p_part = 'back' AND p_nine_course THEN
    RETURN public.dogleg_tee_rating(p_tee, 'front', true);
  END IF;
  -- A main rating this low is a nine-hole rating (no 18 is rated under 40)
  IF s BETWEEN 55 AND 155 AND cr BETWEEN 20 AND 40 THEN
    RETURN jsonb_build_object('slope', s, 'rating', cr);
  END IF;
  RETURN NULL;
END;
$$;

-- Ratings for a round, from public.tees (never from the client's tee_data):
--   tier 1: the tee the golfer picked (tee_id, on this course)
--   tier 2: the course's median-rated tee
--   NULL:   no rated tee — the caller falls back to par at slope 113
CREATE OR REPLACE FUNCTION public.dogleg_round_rating(p_course_id text, p_tee_id text, p_part text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  nine_course boolean;
  res jsonb;
BEGIN
  IF p_course_id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(public.dogleg_to_num(c.num_holes::text) = 9, false) INTO nine_course
  FROM public.courses c WHERE c.course_id = p_course_id;
  nine_course := coalesce(nine_course, false);

  IF p_tee_id IS NOT NULL THEN
    SELECT public.dogleg_tee_rating(to_jsonb(t), p_part, nine_course) INTO res
    FROM public.tees t
    WHERE t.course_id = p_course_id AND t.tee_id::text = p_tee_id
    LIMIT 1;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  SELECT x.rating INTO res
  FROM (
    SELECT y.rating,
           row_number() OVER (ORDER BY (y.rating ->> 'rating')::numeric,
                                       (y.rating ->> 'slope')::numeric, y.tee_id) AS rn,
           count(*) OVER () AS cnt
    FROM (
      SELECT public.dogleg_tee_rating(to_jsonb(t), p_part, nine_course) AS rating,
             t.tee_id::text AS tee_id
      FROM public.tees t
      WHERE t.course_id = p_course_id
    ) y
    WHERE y.rating IS NOT NULL
  ) x
  WHERE x.rn = (x.cnt - 1) / 2 + 1;   -- the median (lower middle for an even count)

  RETURN res;
END;
$$;

-- Par of one nine. From the course's hole pars when that nine is complete,
-- else half of an 18-hole par, else 36.
CREATE OR REPLACE FUNCTION public.dogleg_nine_par(p_course_pars jsonb, p_par numeric, p_nine text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pars numeric[];
  front numeric;
  back numeric;
BEGIN
  pars := public.dogleg_nums(p_course_pars);
  IF pars IS NOT NULL THEN
    SELECT CASE WHEN count(pars[i]) = 9 THEN sum(pars[i]) END INTO front
    FROM generate_series(1, 9) i;
    SELECT CASE WHEN count(pars[i]) = 9 THEN sum(pars[i]) END INTO back
    FROM generate_series(10, 18) i;
  END IF;

  IF p_nine = 'front' AND front IS NOT NULL THEN RETURN front; END IF;
  IF p_nine = 'back' AND back IS NOT NULL THEN RETURN back; END IF;
  IF p_nine NOT IN ('front', 'back') AND front IS NOT NULL AND back IS NOT NULL THEN
    RETURN (front + back) / 2.0;
  END IF;
  IF coalesce(front, back) IS NOT NULL THEN RETURN coalesce(front, back); END IF;

  IF p_par BETWEEN 54 AND 80 THEN RETURN p_par / 2.0; END IF;
  IF p_par BETWEEN 27 AND 40 THEN RETURN p_par; END IF;   -- a nine-hole course's par
  RETURN 36;
END;
$$;


-- ============================================================================
-- PART 4 — WHS math: adjusted gross, differential, handicap index
-- ============================================================================

-- Adjusted gross score for an 18-hole round.
--   Hole-by-hole rounds: cap each hole at net double bogey (par + 2 + strokes
--   received) when the player has an index, else at par + 5 (WHS no-index
--   rule). Quick-Score rounds: raw total (nothing to cap with).
CREATE OR REPLACE FUNCTION public.dogleg_adjusted_gross(
  p_scores        jsonb,     -- rounds.scores_by_hole (as jsonb)
  p_course_pars   jsonb,     -- rounds.course_pars    (as jsonb)
  p_stroke_index  jsonb,     -- courses.handicaps     (as jsonb)
  p_total         numeric,   -- rounds.total_score
  p_index         numeric,   -- player's handicap_index (may be NULL)
  p_slope         numeric,   -- tee slope
  p_rating        numeric,   -- tee course rating
  p_par           numeric    -- course par
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  scores  numeric[];
  pars    numeric[];
  sidx    numeric[];
  course_handicap int;
  strokes int;
  cap     numeric;
  adjusted numeric := 0;
  i int;
BEGIN
  scores := public.dogleg_nums(p_scores);
  pars   := public.dogleg_nums(p_course_pars);

  -- No usable hole-by-hole data → raw total
  IF scores IS NULL OR pars IS NULL
     OR array_length(scores, 1) IS DISTINCT FROM 18
     OR array_length(pars, 1)   IS DISTINCT FROM 18 THEN
    RETURN p_total;
  END IF;

  IF p_index IS NOT NULL AND p_slope IS NOT NULL AND p_rating IS NOT NULL THEN
    course_handicap := round(p_index * p_slope / 113.0 + (p_rating - coalesce(p_par, 72)));
    sidx := public.dogleg_nums(p_stroke_index);
    IF sidx IS NOT NULL AND array_length(sidx, 1) <> 18 THEN
      sidx := NULL;
    END IF;
  END IF;

  FOR i IN 1..18 LOOP
    IF scores[i] IS NULL OR pars[i] IS NULL THEN
      RETURN p_total;  -- incomplete hole data → don't pretend to adjust
    END IF;

    IF course_handicap IS NOT NULL AND sidx IS NOT NULL AND sidx[i] IS NOT NULL THEN
      -- strokes received on this hole from the course's stroke-index allocation
      strokes := floor(course_handicap / 18.0)
                 + CASE WHEN sidx[i] <= (course_handicap % 18) THEN 1 ELSE 0 END;
      IF strokes < 0 THEN strokes := 0; END IF;
      cap := pars[i] + 2 + strokes;
    ELSIF course_handicap IS NOT NULL THEN
      cap := pars[i] + 2 + ceil(greatest(course_handicap, 0) / 18.0);
    ELSE
      cap := pars[i] + 5;  -- WHS rule for players without an index
    END IF;

    adjusted := adjusted + least(scores[i], cap);
  END LOOP;

  RETURN adjusted;
END;
$$;

-- The raw 9-hole differential (D9) for a nine-hole round — the half of the
-- WHS 2024 conversion that needs no handicap. NULL when the round isn't a
-- clean nine or its score is implausible. Used three ways: converting nines
-- at post time (D9 + expected differential), pairing pending nines to
-- bootstrap an index for players with no handicap at all, and retro-
-- converting those nines once an index exists.
CREATE OR REPLACE FUNCTION public.dogleg_nine_differential(r public.rounds)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  rating_j jsonb;
  slope   numeric;
  rating  numeric;
  scores  numeric[];
  filled_front int;
  filled_back int;
  nine    text;
  score9  numeric;
  nine_course boolean;
BEGIN
  IF r.total_score IS NULL THEN RETURN NULL; END IF;
  IF public.dogleg_round_holes(r) IS DISTINCT FROM 9 THEN RETURN NULL; END IF;

  r := public.dogleg_with_course_data(r);   -- trusted pars for the tier-3 fallback

  -- ---- which nine was played, and what did it score? ----
  scores := public.dogleg_nums(to_jsonb(r.scores_by_hole));
  IF scores IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(scores) s WHERE s IS NOT NULL) THEN
    SELECT count(*) FILTER (WHERE i <= 9 AND scores[i] IS NOT NULL),
           count(*) FILTER (WHERE i > 9  AND scores[i] IS NOT NULL)
    INTO filled_front, filled_back
    FROM generate_series(1, 18) i;
    IF filled_front = 9 AND filled_back = 0 THEN
      nine := 'front';
      SELECT sum(scores[i]) INTO score9 FROM generate_series(1, 9) i;
    ELSIF filled_back = 9 AND filled_front = 0 THEN
      nine := 'back';
      SELECT sum(scores[i]) INTO score9 FROM generate_series(10, 18) i;
    ELSE
      RETURN NULL;  -- nine scattered holes isn't a rated nine
    END IF;
  ELSIF r.front9 IS NOT NULL AND r.back9 IS NULL THEN
    nine := 'front'; score9 := r.front9;
  ELSIF r.back9 IS NOT NULL AND r.front9 IS NULL THEN
    nine := 'back'; score9 := r.back9;
  ELSIF r.front9 IS NULL AND r.back9 IS NULL THEN
    -- A total on its own (9 holes declared, or a nine-hole course). On a
    -- nine-hole course it's "the" nine; otherwise we don't know which nine.
    SELECT coalesce(public.dogleg_to_num(c.num_holes::text) = 9, false) INTO nine_course
    FROM public.courses c WHERE c.course_id = r.course_id;
    nine := CASE WHEN coalesce(nine_course, false) THEN 'front' ELSE 'nine' END;
    score9 := r.total_score;
  ELSE
    RETURN NULL;
  END IF;

  IF score9 IS NULL OR score9 NOT BETWEEN 25 AND 90 THEN RETURN NULL; END IF;

  -- Tiers 1-2: the picked tee, else the course's median tee, for that nine
  rating_j := public.dogleg_round_rating(r.course_id::text, r.tee_id::text, nine);
  slope  := (rating_j ->> 'slope')::numeric;
  rating := (rating_j ->> 'rating')::numeric;
  -- Tier 3: that nine's par at neutral slope
  IF rating_j IS NULL THEN
    slope := 113;
    rating := public.dogleg_nine_par(to_jsonb(r.course_pars), r.par, nine);
  END IF;

  -- Unrounded on purpose: callers round once, after adding their half
  RETURN (score9 - rating) * 113.0 / slope;
END;
$$;

-- Handicap index AS OF a round: from the 20 most recent differentials
-- before it (p_played/p_created/p_id), or from all of the golfer's rounds
-- when p_played is NULL (= their current index).
-- Bootstrap: fewer than 3 counting rounds, but pending nines on the card?
-- Pair them up (oldest first) into virtual 18-hole differentials — the
-- pre-2024 WHS method for establishing an index from 9-hole play. Once an
-- index exists the pending nines get converted for real, so the virtual
-- pairs drop out on their own.
CREATE OR REPLACE FUNCTION public.dogleg_index_as_of(
  p_user_id uuid, p_played timestamptz, p_created timestamptz, p_id uuid
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  diffs numeric[];
  n int;
  nine_d9s numeric[];
  i int;
BEGIN
  SELECT array_agg(d.differential ORDER BY d.differential ASC)
  INTO diffs
  FROM (
    SELECT differential
    FROM public.rounds
    WHERE user_id = p_user_id
      AND differential IS NOT NULL
      AND (is_deleted IS NULL OR is_deleted = false)
      AND (p_played IS NULL OR (played_at, created_at, id) < (p_played, p_created, p_id))
    ORDER BY played_at DESC, created_at DESC, id DESC
    LIMIT 20
  ) d;

  n := coalesce(array_length(diffs, 1), 0);

  IF n < 3 THEN
    SELECT array_agg(s.d9 ORDER BY s.played_at, s.created_at, s.id)
    INTO nine_d9s
    FROM (
      SELECT public.dogleg_nine_differential(r) AS d9, r.played_at, r.created_at, r.id
      FROM public.rounds r
      WHERE r.user_id = p_user_id
        AND r.differential IS NULL
        AND (r.is_deleted IS NULL OR r.is_deleted = false)
        AND (p_played IS NULL OR (r.played_at, r.created_at, r.id) < (p_played, p_created, p_id))
    ) s
    WHERE s.d9 IS NOT NULL;

    IF coalesce(array_length(nine_d9s, 1), 0) >= 2 THEN
      diffs := coalesce(diffs, ARRAY[]::numeric[]);
      FOR i IN 1 .. array_length(nine_d9s, 1) / 2 LOOP
        diffs := diffs || round((nine_d9s[2*i - 1] + nine_d9s[2*i])::numeric, 1);
      END LOOP;
      SELECT array_agg(v ORDER BY v) INTO diffs FROM unnest(diffs) AS v;
    END IF;
  END IF;

  RETURN public.dogleg_index_from_diffs(diffs);
END;
$$;

-- WHS score differential for one round row, always as an 18-hole equivalent.
--   18-hole rounds: (adjusted gross - rating) x 113 / slope.
--   9-hole rounds (WHS 2024): 9-hole differential + expected differential for
--   the unplayed nine (0.52 x Handicap Index + 1.2 — reproduces the USGA's
--   published example: index 14.0, 9-hole differential 7.2 -> 15.7). The
--   manual profile handicap stands in for a missing index; with neither, the
--   round stays pending (NULL), matching WHS treatment of 9-hole scores.
-- Ratings resolve through accuracy tiers so any entry format earns a score:
--   1. the tee the golfer picked (exact WHS)
--   2. the course's median-rated tee (good estimate; course difficulty
--      captured, tee choice unknown)
--   3. par with slope 113 (rough; unrated courses only)
-- The index used is the one the golfer had when they played this round.
CREATE OR REPLACE FUNCTION public.dogleg_round_differential(r public.rounds)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  rating_j jsonb;
  slope   numeric;
  rating  numeric;
  holes   integer;
  sidx    jsonb;
  idx     numeric;
  adjusted numeric;
  d9      numeric;
  nine_course boolean;
BEGIN
  IF r.total_score IS NULL THEN RETURN NULL; END IF;

  r := public.dogleg_with_course_data(r);
  holes := public.dogleg_round_holes(r);

  IF holes = 18 THEN
    IF r.total_score NOT BETWEEN 45 AND 160 THEN RETURN NULL; END IF;

    -- Tiers 1-2: the picked tee, else the course's median tee
    rating_j := public.dogleg_round_rating(r.course_id::text, r.tee_id::text, '18');
    slope  := (rating_j ->> 'slope')::numeric;
    rating := (rating_j ->> 'rating')::numeric;
    -- Tier 3: par at neutral slope (an 18 on a nine-hole course = par x 2)
    IF rating_j IS NULL THEN
      SELECT coalesce(public.dogleg_to_num(c.num_holes::text) = 9, false),
             to_jsonb(c.handicaps)
      INTO nine_course, sidx
      FROM public.courses c WHERE c.course_id = r.course_id;
      slope := 113;
      rating := CASE
        WHEN r.par BETWEEN 54 AND 80 THEN r.par
        WHEN coalesce(nine_course, false) AND r.par BETWEEN 27 AND 40 THEN r.par * 2
        ELSE 72
      END;
    ELSE
      SELECT to_jsonb(c.handicaps) INTO sidx FROM public.courses c WHERE c.course_id = r.course_id;
    END IF;

    -- Net double bogey needs the index — only worth looking up when there
    -- are hole-by-hole scores to cap
    IF r.scores_by_hole IS NOT NULL THEN
      idx := public.dogleg_index_as_of(r.user_id, r.played_at, r.created_at, r.id);
    END IF;

    adjusted := public.dogleg_adjusted_gross(
      to_jsonb(r.scores_by_hole), to_jsonb(r.course_pars), sidx,
      r.total_score, idx, slope, rating, r.par);

    RETURN public.dogleg_sane_differential((adjusted - rating) * 113.0 / slope);
  END IF;

  IF holes IS DISTINCT FROM 9 THEN RETURN NULL; END IF;

  -- ---- 9-hole round: D9 + expected differential for the unplayed nine ----
  d9 := public.dogleg_nine_differential(r);
  IF d9 IS NULL THEN RETURN NULL; END IF;

  -- The expected half needs an index; the manual handicap stands in during
  -- cold start. Neither -> pending, until the pairing bootstrap produces an
  -- index and the nine is retro-converted.
  idx := public.dogleg_index_as_of(r.user_id, r.played_at, r.created_at, r.id);
  IF idx IS NULL THEN
    SELECT p.handicap INTO idx FROM public.profiles p WHERE p.id = r.user_id;
  END IF;
  IF idx IS NULL THEN RETURN NULL; END IF;

  RETURN public.dogleg_nine_to_18(d9, idx);
END;
$$;


-- ============================================================================
-- PART 5 — Dogleg Score and achievements
--   baseline = median differential of the player's last 20 rounds BEFORE this
--   one (their typical day). No earlier rounds → seed from the manually
--   entered profile handicap (typical differential ≈ handicap + 3), else NULL
--   ("establishing your baseline").
--   score = clamp(6.0 + 0.4 × (baseline − differential), 0, 10)
-- ============================================================================

-- The old 3-argument version compared dates only, so two rounds on the same
-- day didn't see each other (STATS-5). Replaced by the version below.
DROP FUNCTION IF EXISTS public.dogleg_baseline(uuid, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.dogleg_baseline(
  p_user_id uuid, p_played timestamptz, p_created timestamptz, p_id uuid
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  med double precision;
  n int;
  manual numeric;
BEGIN
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.differential::double precision),
         count(*)
  INTO med, n
  FROM (
    SELECT differential
    FROM public.rounds
    WHERE user_id = p_user_id
      AND differential IS NOT NULL
      AND (is_deleted IS NULL OR is_deleted = false)
      AND (played_at, created_at, id) < (p_played, p_created, p_id)
    ORDER BY played_at DESC, created_at DESC, id DESC
    LIMIT 20
  ) d;

  -- Any prior differential is enough for a baseline (was >= 3): early scores
  -- are rougher but visible, and the median self-corrects within a few rounds.
  -- This is a Dogleg Score choice, not a WHS one — the handicap index still
  -- requires 3 counting rounds.
  IF n >= 1 THEN
    RETURN round(med::numeric, 1);
  END IF;

  -- True cold start (first-ever counting round): seed from the manually
  -- entered handicap when there is one
  SELECT handicap INTO manual FROM public.profiles WHERE id = p_user_id;
  IF manual IS NOT NULL THEN
    RETURN manual + 3;
  END IF;

  RETURN NULL;
END;
$$;

-- What the golfer had done BEFORE round r, in one jsonb:
--   count        rounds before this one (any kind)
--   best         lowest 18-hole total (rounds that count for records)
--   best_vs_par  lowest 18-hole total relative to par
--   course_best  {course_id: lowest 18-hole total there}
--   max_birdies  most birdies in an 18-hole hole-by-hole round
-- Re-scoring a whole history keeps this up to date as it goes
-- (dogleg_add_to_records) instead of re-querying for every round.
CREATE OR REPLACE FUNCTION public.dogleg_prior_records(r public.rounds)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH prior AS (
    SELECT p.course_id, p.total_score, p.par, p.scores_by_hole, p.course_pars,
           public.dogleg_counts_for_records(p.holes_played, p.differential, p.total_score) AS counts
    FROM public.rounds p
    WHERE p.user_id = r.user_id
      AND (p.is_deleted IS NULL OR p.is_deleted = false)
      AND (p.played_at, p.created_at, p.id) < (r.played_at, r.created_at, r.id)
  )
  SELECT jsonb_build_object(
    'count',       (SELECT count(*) FROM prior),
    'best',        (SELECT min(total_score) FROM prior WHERE counts),
    'best_vs_par', (SELECT min(total_score - coalesce(par, 72)) FROM prior WHERE counts),
    'course_best', coalesce((SELECT jsonb_object_agg(cb.course_id, cb.best)
                             FROM (SELECT course_id::text AS course_id, min(total_score) AS best
                                   FROM prior WHERE counts AND course_id IS NOT NULL
                                   GROUP BY 1) cb), '{}'::jsonb),
    'max_birdies', (SELECT max(public.dogleg_birdies(to_jsonb(scores_by_hole), to_jsonb(course_pars)))
                    FROM prior WHERE counts AND scores_by_hole IS NOT NULL)
  );
$$;

-- Add round r (with its stats already computed) to a dogleg_prior_records
-- summary, so the next round sees it as "before".
CREATE OR REPLACE FUNCTION public.dogleg_add_to_records(p jsonb, r public.rounds)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cid text := r.course_id::text;
BEGIN
  p := coalesce(p, '{}'::jsonb) || jsonb_build_object('count', coalesce((p ->> 'count')::int, 0) + 1);
  IF NOT coalesce(p ? 'course_best', false) THEN
    p := p || jsonb_build_object('course_best', '{}'::jsonb);
  END IF;

  IF public.dogleg_counts_for_records(r.holes_played, r.differential, r.total_score) THEN
    p := p || jsonb_build_object(
      'best',        least((p ->> 'best')::numeric, r.total_score),
      'best_vs_par', least((p ->> 'best_vs_par')::numeric, r.total_score - coalesce(r.par, 72)));
    IF cid IS NOT NULL THEN
      p := jsonb_set(p, ARRAY['course_best', cid],
                     to_jsonb(least((p -> 'course_best' ->> cid)::numeric, r.total_score)));
    END IF;
    IF r.scores_by_hole IS NOT NULL THEN
      p := p || jsonb_build_object('max_birdies', greatest((p ->> 'max_birdies')::numeric,
                 public.dogleg_birdies(to_jsonb(r.scores_by_hole), to_jsonb(r.course_pars))));
    END IF;
  END IF;
  RETURN p;
END;
$$;

-- Achievements for round r (holes_played and differential already computed),
-- given what came before it (dogleg_prior_records). Every label is a plain
-- string made here — never text from the browser.
-- The old 10-argument version is replaced by this one.
DROP FUNCTION IF EXISTS public.dogleg_detect_achievements(uuid, uuid, timestamptz, timestamptz, numeric, numeric, text, integer, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.dogleg_achievements(r public.rounds, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a jsonb := '[]'::jsonb;
  prior_count int := coalesce((p ->> 'count')::int, 0);
  prior_best numeric := (p ->> 'best')::numeric;
  prior_best_vspar numeric := (p ->> 'best_vs_par')::numeric;
  prior_course_best numeric := (p -> 'course_best' ->> r.course_id::text)::numeric;
  prior_max_birdies numeric := (p ->> 'max_birdies')::numeric;
  birdies int;
  threshold int;
BEGIN
  IF prior_count = 0 THEN
    RETURN a || jsonb_build_array(jsonb_build_object(
      'type', 'first_round', 'label', '🎉 First round on Dogleg'));
  END IF;

  -- Round-count milestones (this round is number prior_count + 1)
  IF (prior_count + 1) IN (10, 25, 50, 100, 250, 500) THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'rounds_milestone',
      'label', '📅 Round #' || (prior_count + 1)::text));
  END IF;

  -- The rest only make sense for full 18-hole rounds with a plausible score
  IF NOT public.dogleg_counts_for_records(r.holes_played, r.differential, r.total_score) THEN
    RETURN a;
  END IF;

  -- New personal best (all-time low 18-hole score)
  IF prior_best IS NOT NULL AND r.total_score < prior_best THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'personal_best', 'label', '🏆 New personal best'));
  -- Otherwise: best score relative to par (harder courses get their due)
  ELSIF prior_best_vspar IS NOT NULL
        AND (r.total_score - coalesce(r.par, 72)) < prior_best_vspar THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'best_vs_par', 'label', '🏆 Best round vs par'));
  END IF;

  -- First time breaking 100 / 90 / 80 / 70 (only the lowest one broken)
  FOREACH threshold IN ARRAY ARRAY[70, 80, 90, 100] LOOP
    IF r.total_score < threshold
       AND (prior_best IS NULL OR prior_best >= threshold) THEN
      a := a || jsonb_build_array(jsonb_build_object(
        'type', 'broke_' || threshold::text,
        'label', '💯 First time breaking ' || threshold::text));
      EXIT;  -- report only the most impressive newly broken barrier
    END IF;
  END LOOP;

  -- Course PR (needs at least one earlier 18-hole round at this course)
  IF prior_course_best IS NOT NULL AND r.total_score < prior_course_best THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'course_pr', 'label', '⛳ Course PR'));
  END IF;

  -- Most birdies-or-better in a round (hole-by-hole rounds only)
  birdies := public.dogleg_birdies(to_jsonb(r.scores_by_hole), to_jsonb(r.course_pars));
  IF birdies > 0 AND prior_max_birdies IS NOT NULL AND birdies > prior_max_birdies THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'most_birdies',
      'label', '🔥 Most birdies in a round (' || birdies::text || ')'));
  END IF;

  RETURN a;
END;
$$;

-- Everything the server computes for one round, from the round's own data
-- and the golfer's rounds before it. Returns the round with holes_played,
-- differential, dogleg_score, strokes_vs_usual and achievements filled in
-- (and par / course_pars from public.courses). p_prior: a summary from
-- dogleg_prior_records, or NULL to look it up.
CREATE OR REPLACE FUNCTION public.dogleg_compute_round(r public.rounds, p_prior jsonb)
RETURNS public.rounds
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  baseline numeric;
BEGIN
  r := public.dogleg_with_course_data(r);
  r.holes_played := public.dogleg_round_holes(r);
  r.differential := public.dogleg_round_differential(r);
  r.dogleg_score := NULL;
  r.strokes_vs_usual := NULL;

  IF r.differential IS NOT NULL THEN
    baseline := public.dogleg_baseline(r.user_id, r.played_at, r.created_at, r.id);
    IF baseline IS NOT NULL THEN
      -- clamped so a corrupt old differential can't overflow numeric(4,1)
      r.strokes_vs_usual := greatest(-999.9, least(999.9, round(baseline - r.differential, 1)));
      r.dogleg_score := public.dogleg_score_value(baseline, r.differential);
    END IF;
  END IF;

  r.achievements := public.dogleg_achievements(r, coalesce(p_prior, public.dogleg_prior_records(r)));
  RETURN r;
END;
$$;

-- Recompute Dogleg Scores across a user's timeline (oldest first, baselines
-- as of each round). Needed after retro-conversion: converted nines gain
-- scores, and rounds after them see richer baselines. Achievements are not
-- touched (nines never count for records).
CREATE OR REPLACE FUNCTION public.dogleg_rescore_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  baseline numeric;
  new_score numeric;
  new_svu numeric;
BEGIN
  FOR rec IN
    SELECT id, user_id, played_at, created_at, differential
    FROM public.rounds
    WHERE user_id = p_user_id
      AND (is_deleted IS NULL OR is_deleted = false)
    ORDER BY played_at ASC, created_at ASC, id ASC
  LOOP
    new_score := NULL;
    new_svu := NULL;
    IF rec.differential IS NOT NULL THEN
      baseline := public.dogleg_baseline(rec.user_id, rec.played_at, rec.created_at, rec.id);
      IF baseline IS NOT NULL THEN
        new_svu := greatest(-999.9, least(999.9, round(baseline - rec.differential, 1)));
        new_score := public.dogleg_score_value(baseline, rec.differential);
      END IF;
    END IF;
    UPDATE public.rounds
    SET dogleg_score = new_score, strokes_vs_usual = new_svu
    WHERE id = rec.id
      AND (dogleg_score IS DISTINCT FROM new_score
        OR strokes_vs_usual IS DISTINCT FROM new_svu);
  END LOOP;
END;
$$;

-- Convert pending nines (no differential yet) played before the given point
-- (all of them when p_played is NULL) using handicap p_index. Returns how many
-- were converted. Does not rescore; callers do.
CREATE OR REPLACE FUNCTION public.dogleg_convert_nines(
  p_user_id uuid, p_index numeric, p_played timestamptz, p_created timestamptz, p_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  r public.rounds;
  d9 numeric;
  new_diff numeric;
  converted int := 0;
BEGIN
  IF p_index IS NULL THEN RETURN 0; END IF;

  FOR rec IN
    SELECT id FROM public.rounds
    WHERE user_id = p_user_id
      AND differential IS NULL
      AND (is_deleted IS NULL OR is_deleted = false)
      AND (p_played IS NULL OR (played_at, created_at, id) < (p_played, p_created, p_id))
    ORDER BY played_at ASC, created_at ASC, id ASC
  LOOP
    SELECT * INTO r FROM public.rounds WHERE id = rec.id;
    d9 := public.dogleg_nine_differential(r);
    CONTINUE WHEN d9 IS NULL;
    new_diff := public.dogleg_nine_to_18(d9, p_index);
    CONTINUE WHEN new_diff IS NULL;
    UPDATE public.rounds SET differential = new_diff WHERE id = rec.id;
    converted := converted + 1;
  END LOOP;

  RETURN converted;
END;
$$;

-- Retro-conversion: fill in differentials for nines posted before the player
-- had any handicap signal, then rescore their whole timeline. The current
-- index (or manual handicap) stands in for "index as of then" on those
-- rounds — they predate any index, so there is no better value.
-- A transaction-local flag stops it from re-entering itself.
CREATE OR REPLACE FUNCTION public.dogleg_convert_pending_nines(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  idx numeric;
  converted int := 0;
BEGIN
  IF current_setting('dogleg.in_convert', true) = 'on' THEN RETURN 0; END IF;
  PERFORM set_config('dogleg.in_convert', 'on', true);

  SELECT coalesce(p.handicap_index, p.handicap) INTO idx
  FROM public.profiles p WHERE p.id = p_user_id;

  converted := public.dogleg_convert_nines(p_user_id, idx, NULL, NULL, NULL);
  IF converted > 0 THEN
    PERFORM public.dogleg_rescore_user(p_user_id);
  END IF;

  PERFORM set_config('dogleg.in_convert', 'off', true);
  RETURN converted;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('dogleg.in_convert', 'off', true);
  RAISE;
END;
$$;

-- Recalculate one user's handicap index from their latest 20 differentials,
-- then convert any nines that were waiting for an index (which can change the
-- index again, so it is recomputed once more after converting).
CREATE OR REPLACE FUNCTION public.dogleg_recompute_handicap(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_index numeric;
BEGIN
  new_index := public.dogleg_index_as_of(p_user_id, NULL, NULL, NULL);
  UPDATE public.profiles SET handicap_index = new_index
  WHERE id = p_user_id AND handicap_index IS DISTINCT FROM new_index;

  IF public.dogleg_convert_pending_nines(p_user_id) > 0 THEN
    new_index := public.dogleg_index_as_of(p_user_id, NULL, NULL, NULL);
    UPDATE public.profiles SET handicap_index = new_index
    WHERE id = p_user_id AND handicap_index IS DISTINCT FROM new_index;
  END IF;
END;
$$;

-- Re-score a golfer's rounds from p_from (a date; NULL = all of them),
-- oldest first, exactly as if they had been posted in date order:
-- holes_played, differential (with the index as of each round), Dogleg
-- Score, achievements; then the handicap index. Nines waiting for an index
-- are converted at the point an index first exists, as live posting does.
-- Used after a backdated post, a delete, hiding/restoring a round, and by
-- stats_backfill.sql. Returns how many rounds changed.
CREATE OR REPLACE FUNCTION public.dogleg_rebuild_user(p_user_id uuid, p_from timestamptz)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  r public.rounds;
  c public.rounds;
  prior jsonb;
  idx numeric;
  manual numeric;
  changed int := 0;
  prev_flag text;
BEGIN
  -- One user's re-score at a time (see trg_dogleg_round_before_insert)
  PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || p_user_id::text, 0));

  -- The UPDATEs below must not set off the after-change trigger for every row
  prev_flag := current_setting('dogleg.in_rebuild', true);
  PERFORM set_config('dogleg.in_rebuild', 'on', true);

  SELECT handicap INTO manual FROM public.profiles WHERE id = p_user_id;

  FOR rec IN
    SELECT id FROM public.rounds
    WHERE user_id = p_user_id
      AND (is_deleted IS NULL OR is_deleted = false)
      AND (p_from IS NULL OR played_at >= p_from)
    ORDER BY played_at ASC, created_at ASC, id ASC
  LOOP
    SELECT * INTO r FROM public.rounds WHERE id = rec.id;

    -- Live posting converts waiting nines right after the round that gives
    -- the golfer an index; do the same here before scoring this round.
    IF EXISTS (SELECT 1 FROM public.rounds w
               WHERE w.user_id = p_user_id
                 AND w.differential IS NULL
                 AND (w.holes_played = 9 OR w.holes_played IS NULL)
                 AND (w.is_deleted IS NULL OR w.is_deleted = false)
                 AND (w.played_at, w.created_at, w.id) < (r.played_at, r.created_at, r.id)) THEN
      idx := coalesce(public.dogleg_index_as_of(p_user_id, r.played_at, r.created_at, r.id), manual);
      IF public.dogleg_convert_nines(p_user_id, idx, r.played_at, r.created_at, r.id) > 0 THEN
        PERFORM public.dogleg_rescore_user(p_user_id);
        SELECT * INTO r FROM public.rounds WHERE id = rec.id;
      END IF;
    END IF;

    -- Everything that happened before this round, once; then kept up to date
    IF prior IS NULL THEN
      prior := public.dogleg_prior_records(r);
    END IF;

    BEGIN
      c := public.dogleg_compute_round(r, prior);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dogleg_rebuild_user: round % could not be scored: %', r.id, SQLERRM;
      c := r;
      c.holes_played := NULL; c.differential := NULL; c.dogleg_score := NULL;
      c.strokes_vs_usual := NULL; c.achievements := NULL;
    END;

    IF (r.holes_played, r.differential, r.dogleg_score, r.strokes_vs_usual, r.achievements)
       IS DISTINCT FROM
       (c.holes_played, c.differential, c.dogleg_score, c.strokes_vs_usual, c.achievements) THEN
      UPDATE public.rounds
      SET holes_played = c.holes_played, differential = c.differential,
          dogleg_score = c.dogleg_score, strokes_vs_usual = c.strokes_vs_usual,
          achievements = c.achievements
      WHERE id = r.id;
      changed := changed + 1;
    END IF;

    -- The stored row with its new stats is "before" the next round
    r.holes_played := c.holes_played;
    r.differential := c.differential;
    prior := public.dogleg_add_to_records(prior, r);
  END LOOP;

  PERFORM set_config('dogleg.in_rebuild', coalesce(nullif(prev_flag, ''), 'off'), true);

  PERFORM public.dogleg_recompute_handicap(p_user_id);
  RETURN changed;
END;
$$;


-- ============================================================================
-- PART 6 — Triggers
-- ============================================================================

-- Score sanity limits (C8). Rejects impossible scores with SQLSTATE 23514
-- and a message the app can show. A separate trigger, outside the stats
-- trigger's catch-everything handler, so the error actually reaches the
-- user. On UPDATE only the values that changed are checked, so an old
-- out-of-range round can still be hidden by a moderator.
-- Named "check" so it runs before trg_dogleg_round_before_insert (triggers
-- run in name order) and no stats work is wasted on a rejected round.
CREATE OR REPLACE FUNCTION public.dogleg_round_validate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_new boolean := (TG_OP = 'INSERT');
  holes jsonb;
  hole record;
  v numeric;
BEGIN
  IF NEW.total_score IS NOT NULL
     AND (is_new OR NEW.total_score IS DISTINCT FROM OLD.total_score)
     AND NEW.total_score NOT BETWEEN 9 AND 200 THEN
    RAISE EXCEPTION 'Total score must be between 9 and 200 (got %).', NEW.total_score
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.front9 IS NOT NULL
     AND (is_new OR NEW.front9 IS DISTINCT FROM OLD.front9)
     AND NEW.front9 NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Front 9 score must be between 1 and 120 (got %).', NEW.front9
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.back9 IS NOT NULL
     AND (is_new OR NEW.back9 IS DISTINCT FROM OLD.back9)
     AND NEW.back9 NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Back 9 score must be between 1 and 120 (got %).', NEW.back9
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.scores_by_hole IS NOT NULL
     AND (is_new OR NEW.scores_by_hole IS DISTINCT FROM OLD.scores_by_hole) THEN
    holes := to_jsonb(NEW.scores_by_hole);
    IF jsonb_typeof(holes) <> 'array' THEN
      RAISE EXCEPTION 'Hole-by-hole scores must be a list of numbers.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_array_length(holes) > 18 THEN
      RAISE EXCEPTION 'A round has at most 18 holes (got %).', jsonb_array_length(holes)
        USING ERRCODE = 'check_violation';
    END IF;
    FOR hole IN SELECT e, i FROM jsonb_array_elements(holes) WITH ORDINALITY AS t(e, i) LOOP
      CONTINUE WHEN jsonb_typeof(hole.e) = 'null';   -- a hole left blank
      v := public.dogleg_to_num(hole.e #>> '{}');
      IF v IS NULL OR v <> trunc(v) OR v NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'Hole % score must be a whole number from 1 to 20 (got %).',
          hole.i, hole.e #>> '{}'
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  -- "1 day" of slack: the app sends the golfer's local date, which can be
  -- ahead of the server's UTC date
  IF NEW.played_at IS NOT NULL
     AND (is_new OR NEW.played_at IS DISTINCT FROM OLD.played_at)
     AND NEW.played_at::timestamptz > now() + interval '1 day' THEN
    RAISE EXCEPTION 'The date played can''t be in the future (got %).', NEW.played_at::date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_check_round ON public.rounds;
CREATE TRIGGER trg_dogleg_check_round
  BEFORE INSERT OR UPDATE OF total_score, front9, back9, scores_by_hole, played_at
  ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_round_validate();

-- BEFORE INSERT: compute holes_played, differential, Dogleg Score,
-- achievements. Never blocks the insert — on any error the computed
-- columns are NULL. Never keeps values the browser sent for them.
CREATE OR REPLACE FUNCTION public.dogleg_round_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- One user's posts are scored one at a time, so two posts sent at once
  -- can't both miss each other (STATS-10). Taken outside the handler below
  -- so it is held until the post is saved.
  PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || NEW.user_id::text, 0));

  -- 1. These are the server's to compute: discard whatever was sent
  NEW.holes_played := NULL;
  NEW.differential := NULL;
  NEW.dogleg_score := NULL;
  NEW.strokes_vs_usual := NULL;
  NEW.achievements := NULL;

  -- 2. created_at breaks ties between same-day rounds, so for posts from
  -- the app (signed-in or anonymous API calls) it is the server's clock
  IF NEW.created_at IS NULL OR coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.created_at := now();
  END IF;
  IF NEW.played_at IS NULL THEN
    NEW.played_at := NEW.created_at;
  END IF;

  BEGIN
    IF NEW.total_putts IS NULL THEN
      NEW.total_putts := public.dogleg_putts_total(
        to_jsonb(NEW.scores_by_hole), to_jsonb(NEW.stats_by_hole));
    END IF;

    -- 3. Compute everything (also copies par / course_pars from public.courses)
    NEW := public.dogleg_compute_round(NEW, NULL);
  EXCEPTION WHEN OTHERS THEN
    -- Stats must never block posting a round. PL/pgSQL keeps whatever NEW
    -- held when the error hit, so clear the computed columns again.
    RAISE WARNING 'dogleg_round_before_insert failed for round %: %', NEW.id, SQLERRM;
    NEW.holes_played := NULL;
    NEW.differential := NULL;
    NEW.dogleg_score := NULL;
    NEW.strokes_vs_usual := NULL;
    NEW.achievements := NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_round_before_insert ON public.rounds;
CREATE TRIGGER trg_dogleg_round_before_insert
  BEFORE INSERT ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_round_before_insert();

-- AFTER a post, delete, hide/restore or score edit: keep the golfer's later
-- rounds and handicap index right.
--   * a normal post (newest round)        -> recompute the handicap index
--   * a backdated post (older than another round), a delete, hiding or
--     restoring a round, or a change to a score/date/course -> re-score the
--     golfer's rounds from that date on, then the index
-- The trigger only fires for statements run directly (pg_trigger_depth() = 0):
-- the re-score's own UPDATEs must not set it off again.
CREATE OR REPLACE FUNCTION public.dogleg_round_after_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('dogleg.in_rebuild', true) = 'on' THEN
    RETURN NULL;   -- a re-score is already running and will finish the job
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.rounds o
               WHERE o.user_id = NEW.user_id
                 AND o.id <> NEW.id
                 AND (o.is_deleted IS NULL OR o.is_deleted = false)
                 AND (o.played_at, o.created_at, o.id) > (NEW.played_at, NEW.created_at, NEW.id)) THEN
      PERFORM public.dogleg_rebuild_user(NEW.user_id, NEW.played_at);
    ELSE
      PERFORM public.dogleg_recompute_handicap(NEW.user_id);
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || OLD.user_id::text, 0));
    IF coalesce(OLD.is_deleted, false) THEN
      PERFORM public.dogleg_recompute_handicap(OLD.user_id);  -- it didn't count anyway
    ELSE
      PERFORM public.dogleg_rebuild_user(OLD.user_id, OLD.played_at);
    END IF;

  ELSE  -- UPDATE
    PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || NEW.user_id::text, 0));
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.total_score IS DISTINCT FROM OLD.total_score
       OR NEW.scores_by_hole IS DISTINCT FROM OLD.scores_by_hole
       OR NEW.front9 IS DISTINCT FROM OLD.front9
       OR NEW.back9 IS DISTINCT FROM OLD.back9
       OR NEW.holes_declared IS DISTINCT FROM OLD.holes_declared
       OR NEW.played_at IS DISTINCT FROM OLD.played_at
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
       OR NEW.tee_id IS DISTINCT FROM OLD.tee_id THEN
      PERFORM public.dogleg_rebuild_user(NEW.user_id, least(OLD.played_at, NEW.played_at));
    ELSIF NEW.differential IS DISTINCT FROM OLD.differential THEN
      PERFORM public.dogleg_recompute_handicap(NEW.user_id);
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Stats must never block a post or a delete
  RAISE WARNING 'dogleg_round_after_change failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_round_after_change ON public.rounds;
CREATE TRIGGER trg_dogleg_round_after_change
  AFTER INSERT OR DELETE
     OR UPDATE OF is_deleted, differential, total_score, scores_by_hole, front9, back9,
                  holes_declared, played_at, course_id, tee_id
  ON public.rounds
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.dogleg_round_after_change();

-- Manual handicap set or changed in profile settings: recompute (which also
-- retro-converts any pending nines and rescores). Recompute writes only
-- handicap_index, so this UPDATE OF handicap trigger can't re-fire itself.
CREATE OR REPLACE FUNCTION public.dogleg_profile_handicap_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.handicap IS DISTINCT FROM OLD.handicap THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || NEW.id::text, 0));
    PERFORM public.dogleg_recompute_handicap(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dogleg_profile_handicap_change failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_profile_handicap ON public.profiles;
CREATE TRIGGER trg_dogleg_profile_handicap
  AFTER UPDATE OF handicap ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_profile_handicap_change();

-- No longer used: tee ratings now come from dogleg_round_rating
DROP FUNCTION IF EXISTS public.dogleg_course_default_tee(text);


-- ============================================================================
-- PART 7 — RPC: get_user_stats(uuid)
--   One call returns everything the Stats tab needs. SECURITY DEFINER because
--   stats aggregate the user's own rounds (and are shown on public profiles,
--   which already expose rounds through the feed).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH my_rounds AS (
    SELECT *,
           public.dogleg_nums(to_jsonb(scores_by_hole)) AS scores_arr,
           public.dogleg_nums(to_jsonb(course_pars))    AS pars_arr
    FROM public.rounds
    WHERE user_id = p_user_id
      AND (is_deleted IS NULL OR is_deleted = false)
      -- private rounds only count when you're looking at your own stats
      AND (user_id = auth.uid() OR NOT coalesce(is_private, false))
  ),
  eighteen AS (
    -- full 18-hole rounds with a plausible score (no nines scored as 18s,
    -- no eighteen 1s): the same rule as the personal-best badges
    SELECT * FROM my_rounds
    WHERE public.dogleg_counts_for_records(holes_played, differential, total_score)
  ),
  best AS (
    SELECT id, short_code, total_score, par, played_at, course_name, club_name,
           dogleg_score
    FROM eighteen
    ORDER BY total_score ASC, played_at DESC
    LIMIT 1
  ),
  last5  AS (SELECT total_score FROM eighteen ORDER BY played_at DESC LIMIT 5),
  last10 AS (SELECT total_score FROM eighteen ORDER BY played_at DESC LIMIT 10),
  monthly AS (
    SELECT to_char(date_trunc('month', played_at), 'YYYY-MM') AS month,
           count(*) AS rounds
    FROM my_rounds
    WHERE played_at >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1 ORDER BY 1
  ),
  top_courses AS (
    SELECT course_id, max(course_name) AS course_name, max(club_name) AS club_name,
           count(*) AS rounds,
           min(total_score) FILTER (WHERE public.dogleg_counts_for_records(holes_played, differential, total_score)) AS best_score
    FROM my_rounds
    GROUP BY course_id
    ORDER BY count(*) DESC, max(played_at) DESC
    LIMIT 5
  ),
  series AS (  -- most recent 100 rounds, oldest → newest for charting
    SELECT * FROM (
      SELECT id, short_code, played_at, created_at,
             played_at::date AS date, total_score, par,
             (total_score - coalesce(par, 72)) AS vs_par,
             differential, dogleg_score, strokes_vs_usual, holes_played,
             total_putts
      FROM my_rounds
      WHERE total_score IS NOT NULL
      ORDER BY played_at DESC, created_at DESC
      LIMIT 100
    ) latest
  ),
  holes AS (  -- one row per scored hole across all hole-by-hole rounds
    SELECT r.id AS round_id, i AS hole_no,
           r.scores_arr[i] AS score, r.pars_arr[i] AS hole_par,
           public.dogleg_to_num((to_jsonb(r.stats_by_hole) -> (i - 1)) ->> 'putts') AS putts
    FROM my_rounds r
    CROSS JOIN generate_series(1, 18) i
    WHERE r.scores_arr IS NOT NULL AND r.pars_arr IS NOT NULL
      AND array_length(r.scores_arr, 1) = 18 AND array_length(r.pars_arr, 1) = 18
      AND r.scores_arr[i] IS NOT NULL AND r.pars_arr[i] IS NOT NULL
  ),
  hole_stats AS (
    SELECT
      round(avg(score) FILTER (WHERE hole_par = 3), 2) AS par3_avg,
      round(avg(score) FILTER (WHERE hole_par = 4), 2) AS par4_avg,
      round(avg(score) FILTER (WHERE hole_par = 5), 2) AS par5_avg,
      round(avg(score) FILTER (WHERE hole_no <= 9), 2)  AS front9_avg_per_hole,
      round(avg(score) FILTER (WHERE hole_no > 9), 2)   AS back9_avg_per_hole,
      count(*) FILTER (WHERE score <= hole_par - 2)     AS eagles_or_better,
      count(*) FILTER (WHERE score =  hole_par - 1)     AS birdies,
      count(*) FILTER (WHERE score =  hole_par)         AS pars,
      count(*) FILTER (WHERE score =  hole_par + 1)     AS bogeys,
      count(*) FILTER (WHERE score >= hole_par + 2)     AS doubles_or_worse,
      count(*)                                          AS holes_recorded,
      round(avg(putts), 2)                              AS putts_avg,
      count(putts)                                      AS holes_with_putts
    FROM holes
  )
  SELECT jsonb_build_object(
    'rounds_count',        (SELECT count(*) FROM my_rounds),
    'rounds_18',           (SELECT count(*) FROM eighteen),
    'rounds_9',            (SELECT count(*) FROM my_rounds WHERE holes_played = 9),
    'avg_score',           (SELECT round(avg(total_score), 1) FROM eighteen),
    'avg_last5',           (SELECT round(avg(total_score), 1) FROM last5),
    'avg_last10',          (SELECT round(avg(total_score), 1) FROM last10),
    'avg_vs_par',          (SELECT round(avg(total_score - coalesce(par, 72)), 1) FROM eighteen),
    'best_round',          (SELECT to_jsonb(best) FROM best),
    'handicap_index',      (SELECT handicap_index FROM public.profiles WHERE id = p_user_id),
    'manual_handicap',     (SELECT handicap FROM public.profiles WHERE id = p_user_id),
    'handicap_rounds',     (SELECT count(*) FROM my_rounds WHERE differential IS NOT NULL),
    'latest_dogleg_score', (SELECT dogleg_score FROM my_rounds
                            WHERE dogleg_score IS NOT NULL
                            ORDER BY played_at DESC, created_at DESC LIMIT 1),
    'best_dogleg_score',   (SELECT max(dogleg_score) FROM my_rounds),
    'putts_rounds',        (SELECT count(*) FROM my_rounds WHERE total_putts IS NOT NULL),
    'putts_per_round',     (SELECT round(avg(total_putts), 1) FROM my_rounds WHERE total_putts IS NOT NULL),
    'rounds_per_month',    coalesce((SELECT jsonb_agg(to_jsonb(monthly) ORDER BY monthly.month) FROM monthly), '[]'::jsonb),
    'top_courses',         coalesce((SELECT jsonb_agg(to_jsonb(top_courses) ORDER BY top_courses.rounds DESC) FROM top_courses), '[]'::jsonb),
    'series',              coalesce((SELECT jsonb_agg(
                             (to_jsonb(series) - 'played_at' - 'created_at')
                             ORDER BY series.played_at ASC, series.created_at ASC) FROM series), '[]'::jsonb),
    'hole_stats',          (SELECT to_jsonb(hole_stats) FROM hole_stats)
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_stats(uuid) TO authenticated;


-- ============================================================================
-- PART 8 — RPC: get_course_page(text)
--   Course header stats, leaderboard (each player's best 18-hole round) and
--   recent rounds, for the /courses/:courseId page.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_course_page(p_course_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH course_rounds AS (
    SELECT r.*, p.username, p.avatar_url, p.full_name
    FROM public.rounds r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.course_id = p_course_id
      AND (r.is_deleted IS NULL OR r.is_deleted = false)
      AND r.total_score IS NOT NULL
      -- course pages are a public surface: no private rounds, no banned users
      AND NOT coalesce(r.is_private, false)
      AND NOT coalesce(p.is_banned, false)
  ),
  -- full 18-hole rounds with a plausible score: a nine typed as a total or
  -- eighteen 1s can't take the course record
  eighteen AS (
    SELECT * FROM course_rounds
    WHERE public.dogleg_counts_for_records(holes_played, differential, total_score)
  ),
  leaderboard AS (
    SELECT DISTINCT ON (user_id)
           user_id, username, avatar_url, full_name,
           total_score, par, played_at::date AS date, short_code, dogleg_score
    FROM eighteen
    ORDER BY user_id, total_score ASC, played_at DESC
  ),
  leaderboard_ranked AS (
    SELECT * FROM leaderboard ORDER BY total_score ASC, date ASC LIMIT 10
  ),
  recent AS (
    SELECT user_id, username, avatar_url, total_score, par,
           played_at::date AS date, short_code, holes_played, dogleg_score
    FROM course_rounds
    ORDER BY played_at DESC, created_at DESC
    LIMIT 10
  ),
  course_info AS (
    SELECT c.course_id, c.course_name, c.total_par, c.num_holes,
           cl.club_name, cl.city, cl.state, cl.country
    FROM public.courses c
    LEFT JOIN public.clubs cl ON cl.club_id = c.club_id
    WHERE c.course_id = p_course_id
  )
  SELECT jsonb_build_object(
    'course',        (SELECT to_jsonb(course_info) FROM course_info),
    'rounds_count',  (SELECT count(*) FROM course_rounds),
    'players_count', (SELECT count(DISTINCT user_id) FROM course_rounds),
    'avg_score',     (SELECT round(avg(total_score), 1) FROM eighteen),
    'avg_vs_par',    (SELECT round(avg(total_score - coalesce(par, 72)), 1) FROM eighteen),
    'course_record', (SELECT min(total_score) FROM eighteen),
    'leaderboard',   coalesce((SELECT jsonb_agg(to_jsonb(leaderboard_ranked)
                         ORDER BY leaderboard_ranked.total_score ASC, leaderboard_ranked.date ASC)
                         FROM leaderboard_ranked), '[]'::jsonb),
    'recent_rounds', coalesce((SELECT jsonb_agg(to_jsonb(recent)
                         ORDER BY recent.date DESC)
                         FROM recent), '[]'::jsonb),
    'my_best',       (SELECT min(total_score) FROM eighteen WHERE user_id = auth.uid())
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_course_page(text) TO authenticated;


-- ============================================================================
-- PART 9 — Backfill: moved out
-- The one-time recompute of every historical round now lives in
-- database/stats_backfill.sql, so re-running this file never rewrites
-- anyone's history.
-- ============================================================================


-- ============================================================================
-- PART 10 — Hardening (from Supabase security advisors)
-- Internal machinery is not directly callable by app roles; only the two
-- app-facing RPCs stay callable, and only by authenticated users.
-- (Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, so revoking from PUBLIC alone is not enough.)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.dogleg_baseline(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_index_as_of(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_prior_records(public.rounds) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_compute_round(public.rounds, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_recompute_handicap(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_convert_nines(uuid, numeric, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_convert_pending_nines(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_rescore_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_rebuild_user(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_round_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_round_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_round_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_profile_handicap_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_course_page(text) FROM PUBLIC, anon;

COMMIT;
