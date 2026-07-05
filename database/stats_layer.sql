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
--   4. rounds.achievements — auto-detected PRs & milestones, stamped at post
--      time (personal best, broke 100/90/80/70, course PR, most birdies...).
--   5. rounds.stats_by_hole — optional per-hole putts (entered in the app).
--   6. RPCs: get_user_stats(uuid), get_course_page(text) — everything the
--      Stats tab and Course pages need in one call each.
--   7. Backfill: computes all of the above for every existing round, oldest
--      first, then recalculates every user's handicap index.
--
-- HOW TO RUN (one time)
--   1. Open Supabase dashboard → SQL Editor → New query
--   2. Paste this ENTIRE file and click "Run"
--   3. You should see "Success. No rows returned" (the backfill NOTICEs are
--      normal). Safe to re-run — everything is idempotent.
--
-- DESIGN NOTES
--   * A stats bug must NEVER block posting a round: the trigger wraps all
--     computation in an exception handler and simply leaves the new columns
--     NULL if anything unexpected happens.
--   * Soft-deleted rounds (is_deleted = true) are excluded everywhere.
--   * 9-hole rounds (WHS 2024 method): the 9-hole differential is combined
--     with an expected differential for the unplayed nine (0.52 x index + 1.2,
--     which reproduces the USGA's published example exactly). Requires the
--     tee's front/back-9 ratings and an index (or the manually entered
--     handicap as a cold-start stand-in) — otherwise the round stays pending
--     (NULL), matching how WHS holds 9-hole scores until an index exists.
--     Plain doubling was rejected: it doubles the variance of the entry, and
--     best-8-of-20 selection then systematically favors those entries,
--     biasing the index low for players who post many nines.
--   * Adjusted gross ("net double bogey") applies to hole-by-hole rounds:
--     with an index we cap each hole at par + 2 + strokes received (using the
--     course's stroke-index allocation); without one we use the WHS par + 5
--     rule. Quick-Score rounds use the raw total (documented accuracy tier).
--   * scores_by_hole / course_pars / courses.handicaps may be stored as
--     int[], text[] or jsonb depending on how the table was created — every
--     reader goes through to_jsonb() + dogleg_nums() so all cases work.
-- ============================================================================


-- ============================================================================
-- PART 1 — New columns
-- ============================================================================

ALTER TABLE public.rounds
  -- holes_played already exists in production (integer, default 18); the
  -- backfill below recomputes it honestly for every round
  ADD COLUMN IF NOT EXISTS holes_played     integer,
  ADD COLUMN IF NOT EXISTS differential     numeric(5,1),
  ADD COLUMN IF NOT EXISTS dogleg_score     numeric(3,1),
  ADD COLUMN IF NOT EXISTS strokes_vs_usual numeric(4,1),
  ADD COLUMN IF NOT EXISTS achievements     jsonb,
  ADD COLUMN IF NOT EXISTS stats_by_hole    jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handicap_index numeric(4,1);

CREATE INDEX IF NOT EXISTS idx_rounds_user_played
  ON public.rounds (user_id, played_at DESC)
  WHERE (is_deleted IS NULL OR is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_rounds_course_score
  ON public.rounds (course_id, total_score ASC)
  WHERE (is_deleted IS NULL OR is_deleted = false);


-- ============================================================================
-- PART 2 — Small helpers
-- ============================================================================

-- Text → numeric that never throws (returns NULL for junk like '' or 'abc')
CREATE OR REPLACE FUNCTION public.dogleg_to_num(t text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN nullif(trim(t), '')::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
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

-- How many holes does this round cover? (18, 9, or NULL = can't tell)
-- Uses hole-by-hole data when present, else the front9/back9/total fields.
CREATE OR REPLACE FUNCTION public.dogleg_holes_played(
  p_scores jsonb, p_front9 numeric, p_back9 numeric, p_total numeric
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  scores numeric[];
  filled int;
BEGIN
  scores := public.dogleg_nums(p_scores);
  IF scores IS NOT NULL THEN
    SELECT count(*) INTO filled FROM unnest(scores) s WHERE s IS NOT NULL;
    IF filled = 18 THEN RETURN 18; END IF;
    IF filled = 9 THEN RETURN 9; END IF;
    IF filled > 0 THEN RETURN filled; END IF;  -- partial round
    -- fall through when the array exists but is empty
  END IF;

  IF p_front9 IS NOT NULL AND p_back9 IS NOT NULL THEN RETURN 18; END IF;
  -- One nine entered and it IS the total → a 9-hole round
  IF p_front9 IS NOT NULL AND p_back9 IS NULL AND p_total = p_front9 THEN RETURN 9; END IF;
  IF p_back9 IS NOT NULL AND p_front9 IS NULL AND p_total = p_back9 THEN RETURN 9; END IF;
  -- Total only: assume a full round when it's in a plausible 18-hole range
  IF p_total IS NOT NULL AND p_total BETWEEN 45 AND 160 THEN RETURN 18; END IF;
  RETURN NULL;
END;
$$;


-- ============================================================================
-- PART 3 — WHS math: adjusted gross, differential, handicap index
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

-- WHS score differential for one round row, always as an 18-hole equivalent.
--   18-hole rounds: (adjusted gross - rating) x 113 / slope.
--   9-hole rounds (WHS 2024): 9-hole differential + expected differential for
--   the unplayed nine (0.52 x Handicap Index + 1.2 — reproduces the USGA's
--   published example: index 14.0, 9-hole differential 7.2 -> 15.7). The
--   manual profile handicap stands in for a missing index; with neither, the
--   round stays pending (NULL), matching WHS treatment of 9-hole scores.
-- NULL when not computable (no tee, missing ratings, implausible total).
CREATE OR REPLACE FUNCTION public.dogleg_round_differential(r public.rounds)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  tee     jsonb;
  slope   numeric;
  rating  numeric;
  holes   integer;
  sidx    jsonb;
  idx     numeric;
  adjusted numeric;
  scores  numeric[];
  filled_front int;
  filled_back int;
  nine    text;
  score9  numeric;
  d9      numeric;
BEGIN
  IF r.total_score IS NULL THEN RETURN NULL; END IF;

  holes := public.dogleg_holes_played(to_jsonb(r.scores_by_hole), r.front9, r.back9, r.total_score);

  tee := to_jsonb(r.tee_data);
  IF tee IS NULL OR jsonb_typeof(tee) <> 'object' THEN RETURN NULL; END IF;

  IF holes = 18 THEN
    IF r.total_score NOT BETWEEN 45 AND 160 THEN RETURN NULL; END IF;
    slope  := public.dogleg_to_num(tee ->> 'slope');
    rating := public.dogleg_to_num(tee ->> 'course_rating');
    IF slope IS NULL OR slope < 55 OR slope > 155 OR rating IS NULL THEN RETURN NULL; END IF;

    SELECT to_jsonb(c.handicaps) INTO sidx FROM public.courses c WHERE c.course_id = r.course_id;
    SELECT p.handicap_index INTO idx FROM public.profiles p WHERE p.id = r.user_id;

    adjusted := public.dogleg_adjusted_gross(
      to_jsonb(r.scores_by_hole), to_jsonb(r.course_pars), sidx,
      r.total_score, idx, slope, rating, r.par);

    RETURN round(((adjusted - rating) * 113.0 / slope)::numeric, 1);
  END IF;

  IF holes IS DISTINCT FROM 9 THEN RETURN NULL; END IF;

  -- ---- 9-hole round: which nine was played, and what did it score? ----
  scores := public.dogleg_nums(to_jsonb(r.scores_by_hole));
  IF scores IS NOT NULL AND array_length(scores, 1) = 18 THEN
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
  ELSE
    RETURN NULL;
  END IF;

  IF score9 IS NULL OR score9 NOT BETWEEN 25 AND 90 THEN RETURN NULL; END IF;

  -- The played nine's own slope and rating (84% of imported tees have them)
  IF nine = 'front' THEN
    slope  := public.dogleg_to_num(tee ->> 'slope_front9');
    rating := public.dogleg_to_num(tee ->> 'cr_front9');
  ELSE
    slope  := public.dogleg_to_num(tee ->> 'slope_back9');
    rating := public.dogleg_to_num(tee ->> 'cr_back9');
  END IF;
  IF slope IS NULL OR slope < 55 OR slope > 155 OR rating IS NULL THEN RETURN NULL; END IF;

  -- Expected differential for the unplayed nine needs an index; the manual
  -- handicap stands in during cold start. Neither -> pending, like WHS.
  SELECT coalesce(p.handicap_index, p.handicap) INTO idx
  FROM public.profiles p WHERE p.id = r.user_id;
  IF idx IS NULL THEN RETURN NULL; END IF;

  d9 := (score9 - rating) * 113.0 / slope;
  RETURN round((d9 + 0.52 * idx + 1.2)::numeric, 1);
END;
$$;

-- Recalculate one user's handicap index from their latest 20 differentials.
-- Implements the WHS small-sample table; needs at least 3 counting rounds.
CREATE OR REPLACE FUNCTION public.dogleg_recompute_handicap(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  diffs numeric[];
  n int;
  new_index numeric;
BEGIN
  SELECT array_agg(d.differential ORDER BY d.differential ASC)
  INTO diffs
  FROM (
    SELECT differential
    FROM public.rounds
    WHERE user_id = p_user_id
      AND differential IS NOT NULL
      AND (is_deleted IS NULL OR is_deleted = false)
    ORDER BY played_at DESC, created_at DESC
    LIMIT 20
  ) d;

  n := coalesce(array_length(diffs, 1), 0);

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

  UPDATE public.profiles SET handicap_index = new_index WHERE id = p_user_id;
END;
$$;


-- ============================================================================
-- PART 4 — Dogleg Score (see docs/stats_pivot_plan.md for the full rationale)
--   baseline = median differential of the player's last 20 rounds BEFORE this
--   one (their typical day). Fewer than 3 priors → seed from the manually
--   entered profile handicap (typical differential ≈ handicap + 3), else NULL
--   ("establishing your baseline").
--   score = clamp(6.0 + 0.4 × (baseline − differential), 0, 10)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dogleg_baseline(
  p_user_id uuid, p_before timestamptz, p_exclude_id uuid
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
      AND (p_exclude_id IS NULL OR id <> p_exclude_id)
      AND played_at < p_before
    ORDER BY played_at DESC, created_at DESC
    LIMIT 20
  ) d;

  IF n >= 3 THEN
    RETURN round(med::numeric, 1);
  END IF;

  -- Cold start: seed from the manually entered handicap when there is one
  SELECT handicap INTO manual FROM public.profiles WHERE id = p_user_id;
  IF manual IS NOT NULL THEN
    RETURN manual + 3;
  END IF;

  RETURN NULL;
END;
$$;


-- ============================================================================
-- PART 5 — Achievements (stamped once, at post time)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dogleg_detect_achievements(
  p_user_id uuid, p_round_id uuid, p_before timestamptz, p_created timestamptz,
  p_total numeric, p_par numeric, p_course_id text, p_holes integer,
  p_scores jsonb, p_course_pars jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a jsonb := '[]'::jsonb;
  prior_count int;
  prior_best numeric;
  prior_best_vspar numeric;
  prior_course_best numeric;
  prior_max_birdies int;
  birdies int;
  scores numeric[];
  pars numeric[];
  threshold int;
BEGIN
  -- "Prior" = played earlier; same-day rounds break the tie on created_at
  SELECT count(*) INTO prior_count
  FROM public.rounds
  WHERE user_id = p_user_id
    AND (is_deleted IS NULL OR is_deleted = false)
    AND (p_round_id IS NULL OR id <> p_round_id)
    AND (played_at < p_before
         OR (played_at = p_before AND created_at < coalesce(p_created, now())));

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

  -- The rest only make sense for full 18-hole rounds with a total
  IF p_holes IS DISTINCT FROM 18 OR p_total IS NULL THEN
    RETURN a;
  END IF;

  SELECT min(total_score) INTO prior_best
  FROM public.rounds
  WHERE user_id = p_user_id AND (is_deleted IS NULL OR is_deleted = false)
    AND (p_round_id IS NULL OR id <> p_round_id) AND played_at < p_before
    AND holes_played = 18 AND total_score IS NOT NULL;

  SELECT min(total_score - coalesce(par, 72)) INTO prior_best_vspar
  FROM public.rounds
  WHERE user_id = p_user_id AND (is_deleted IS NULL OR is_deleted = false)
    AND (p_round_id IS NULL OR id <> p_round_id) AND played_at < p_before
    AND holes_played = 18 AND total_score IS NOT NULL;

  -- New personal best (all-time low 18-hole score)
  IF prior_best IS NOT NULL AND p_total < prior_best THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'personal_best', 'label', '🏆 New personal best'));
  -- Otherwise: best score relative to par (harder courses get their due)
  ELSIF prior_best_vspar IS NOT NULL
        AND (p_total - coalesce(p_par, 72)) < prior_best_vspar THEN
    a := a || jsonb_build_array(jsonb_build_object(
      'type', 'best_vs_par', 'label', '🏆 Best round vs par'));
  END IF;

  -- First time breaking 100 / 90 / 80 / 70 (only the lowest one broken)
  FOREACH threshold IN ARRAY ARRAY[70, 80, 90, 100] LOOP
    IF p_total < threshold
       AND (prior_best IS NULL OR prior_best >= threshold) THEN
      a := a || jsonb_build_array(jsonb_build_object(
        'type', 'broke_' || threshold::text,
        'label', '💯 First time breaking ' || threshold::text));
      EXIT;  -- report only the most impressive newly broken barrier
    END IF;
  END LOOP;

  -- Course PR (needs at least one prior 18-hole round at this course)
  IF p_course_id IS NOT NULL THEN
    SELECT min(total_score) INTO prior_course_best
    FROM public.rounds
    WHERE user_id = p_user_id AND (is_deleted IS NULL OR is_deleted = false)
      AND (p_round_id IS NULL OR id <> p_round_id) AND played_at < p_before
      AND course_id = p_course_id
      AND holes_played = 18 AND total_score IS NOT NULL;
    IF prior_course_best IS NOT NULL AND p_total < prior_course_best THEN
      a := a || jsonb_build_array(jsonb_build_object(
        'type', 'course_pr', 'label', '⛳ Course PR'));
    END IF;
  END IF;

  -- Most birdies-or-better in a round (hole-by-hole rounds only)
  scores := public.dogleg_nums(p_scores);
  pars   := public.dogleg_nums(p_course_pars);
  IF scores IS NOT NULL AND pars IS NOT NULL
     AND array_length(scores, 1) = 18 AND array_length(pars, 1) = 18 THEN
    SELECT count(*) INTO birdies
    FROM generate_series(1, 18) i
    WHERE scores[i] IS NOT NULL AND pars[i] IS NOT NULL AND scores[i] <= pars[i] - 1;

    IF birdies > 0 THEN
      SELECT max(b.cnt) INTO prior_max_birdies
      FROM (
        SELECT (
          SELECT count(*)
          FROM generate_series(1, 18) i
          WHERE (public.dogleg_nums(to_jsonb(r.scores_by_hole)))[i] IS NOT NULL
            AND (public.dogleg_nums(to_jsonb(r.course_pars)))[i] IS NOT NULL
            AND (public.dogleg_nums(to_jsonb(r.scores_by_hole)))[i]
                <= (public.dogleg_nums(to_jsonb(r.course_pars)))[i] - 1
        ) AS cnt
        FROM public.rounds r
        WHERE r.user_id = p_user_id AND (r.is_deleted IS NULL OR r.is_deleted = false)
          AND (p_round_id IS NULL OR r.id <> p_round_id) AND r.played_at < p_before
          AND r.scores_by_hole IS NOT NULL
      ) b;
      IF prior_max_birdies IS NOT NULL AND birdies > prior_max_birdies THEN
        a := a || jsonb_build_array(jsonb_build_object(
          'type', 'most_birdies',
          'label', '🔥 Most birdies in a round (' || birdies::text || ')'));
      END IF;
    END IF;
  END IF;

  RETURN a;
END;
$$;


-- ============================================================================
-- PART 6 — Triggers
-- ============================================================================

-- BEFORE INSERT: compute holes_played, differential, Dogleg Score,
-- achievements. Never blocks the insert — on any error the columns stay NULL.
CREATE OR REPLACE FUNCTION public.dogleg_round_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  baseline numeric;
  ts timestamptz;
BEGIN
  ts := coalesce(NEW.played_at, NEW.created_at, now());

  NEW.holes_played := public.dogleg_holes_played(
    to_jsonb(NEW.scores_by_hole), NEW.front9, NEW.back9, NEW.total_score);

  NEW.differential := public.dogleg_round_differential(NEW);

  IF NEW.differential IS NOT NULL THEN
    baseline := public.dogleg_baseline(NEW.user_id, ts, NEW.id);
    IF baseline IS NOT NULL THEN
      NEW.strokes_vs_usual := round(baseline - NEW.differential, 1);
      NEW.dogleg_score := greatest(0.0, least(10.0,
        round(6.0 + 0.4 * (baseline - NEW.differential), 1)));
    END IF;
  END IF;

  NEW.achievements := public.dogleg_detect_achievements(
    NEW.user_id, NEW.id, ts, coalesce(NEW.created_at, now()),
    NEW.total_score, NEW.par, NEW.course_id, NEW.holes_played,
    to_jsonb(NEW.scores_by_hole), to_jsonb(NEW.course_pars));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Stats must never block posting a round
  RAISE WARNING 'dogleg_round_before_insert failed for round %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_round_before_insert ON public.rounds;
CREATE TRIGGER trg_dogleg_round_before_insert
  BEFORE INSERT ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_round_before_insert();

-- AFTER INSERT / soft-delete / hard delete: refresh the author's handicap.
CREATE OR REPLACE FUNCTION public.dogleg_round_after_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.dogleg_recompute_handicap(OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM public.dogleg_recompute_handicap(NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dogleg_round_after_change failed: %', SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_dogleg_round_after_change ON public.rounds;
CREATE TRIGGER trg_dogleg_round_after_change
  AFTER INSERT OR DELETE OR UPDATE OF is_deleted, differential ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_round_after_change();


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
    SELECT * FROM my_rounds WHERE holes_played = 18 AND total_score IS NOT NULL
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
           min(total_score) FILTER (WHERE holes_played = 18) AS best_score
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
             differential, dogleg_score, strokes_vs_usual, holes_played
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
  eighteen AS (SELECT * FROM course_rounds WHERE holes_played = 18),
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
-- PART 9 — Backfill existing rounds (oldest first, so baselines and
-- achievements are computed exactly as they would have been at post time),
-- then recalculate every user's handicap index.
-- Safe to re-run: it recomputes from scratch each time.
-- ============================================================================

DO $$
DECLARE
  rec record;
  r public.rounds;
  baseline numeric;
  ts timestamptz;
  n int := 0;
BEGIN
  -- Start from a clean slate so re-runs converge (differentials feed
  -- baselines, so stale values would skew the chronological pass).
  UPDATE public.rounds
  SET holes_played = NULL, differential = NULL,
      dogleg_score = NULL, strokes_vs_usual = NULL, achievements = NULL;
  UPDATE public.profiles SET handicap_index = NULL;

  FOR rec IN
    SELECT id FROM public.rounds
    ORDER BY user_id, played_at ASC, created_at ASC
  LOOP
    SELECT * INTO r FROM public.rounds WHERE id = rec.id;
    ts := coalesce(r.played_at, r.created_at, now());

    r.holes_played := public.dogleg_holes_played(
      to_jsonb(r.scores_by_hole), r.front9, r.back9, r.total_score);
    r.differential := public.dogleg_round_differential(r);

    baseline := NULL;
    r.dogleg_score := NULL;
    r.strokes_vs_usual := NULL;
    IF r.differential IS NOT NULL THEN
      baseline := public.dogleg_baseline(r.user_id, ts, r.id);
      IF baseline IS NOT NULL THEN
        r.strokes_vs_usual := round(baseline - r.differential, 1);
        r.dogleg_score := greatest(0.0, least(10.0,
          round(6.0 + 0.4 * (baseline - r.differential), 1)));
      END IF;
    END IF;

    UPDATE public.rounds
    SET holes_played = r.holes_played,
        differential = r.differential,
        dogleg_score = r.dogleg_score,
        strokes_vs_usual = r.strokes_vs_usual,
        achievements = public.dogleg_detect_achievements(
          r.user_id, r.id, ts, r.created_at, r.total_score, r.par, r.course_id,
          r.holes_played, to_jsonb(r.scores_by_hole), to_jsonb(r.course_pars))
    WHERE id = rec.id;

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % rounds', n;

  PERFORM public.dogleg_recompute_handicap(p.id) FROM public.profiles p;

  RAISE NOTICE 'Recalculated handicap indexes for all users';
END;
$$;

-- Note on the backfill: the soft-deleted rounds also get holes_played /
-- differential values, but every reader (handicap, baseline, stats, course
-- pages) filters is_deleted, so they never count.


-- ============================================================================
-- PART 10 — Hardening (from Supabase security advisors)
-- Internal machinery is not directly callable by app roles; only the two
-- app-facing RPCs stay callable, and only by authenticated users.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.dogleg_baseline(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_detect_achievements(uuid, uuid, timestamptz, timestamptz, numeric, numeric, text, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_recompute_handicap(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_round_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dogleg_round_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_course_page(text) FROM PUBLIC, anon;
