-- ============================================================================
-- Dogleg — Admin: Stats Engine observability + user diagnostic + retention
-- ============================================================================
-- Run AFTER database/stats_layer.sql (uses its helper functions).
-- Safe to re-run: everything is CREATE OR REPLACE / IF NOT EXISTS.
--
-- Every function here follows the audited *_admin pattern: SECURITY DEFINER
-- with `IF NOT is_admin() THEN RAISE EXCEPTION` as the first statement, so
-- the client-side gate remains defense-in-depth only.
-- ============================================================================


-- ============================================================================
-- PART 1 — One definition of "admin" (closes the audit's open item)
-- Previously is_admin() checked a hardcoded JWT email while is_admin(uid)
-- checked profiles.is_admin — two sources that could drift. Now both read
-- the profiles.is_admin column.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Make sure the admin account is flagged before the email check goes away
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE public.profiles p SET is_admin = true
    FROM auth.users u
    WHERE u.id = p.id AND u.email = 'markgreenfield1@gmail.com';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false)
$$;


-- ============================================================================
-- PART 2 — Stats engine health: get_stats_engine_admin()
-- One call powering the admin "Stats Engine" panel.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_stats_engine_admin()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  WITH live AS (
    SELECT r.*,
      coalesce(
        CASE
          WHEN coalesce(r.holes_played, 18) = 18 THEN
            (public.dogleg_to_num(to_jsonb(r.tee_data) ->> 'slope') BETWEEN 55 AND 155
             AND public.dogleg_to_num(to_jsonb(r.tee_data) ->> 'course_rating') IS NOT NULL)
          ELSE
            (public.dogleg_to_num(to_jsonb(r.tee_data) ->> 'slope_front9') BETWEEN 55 AND 155
             OR public.dogleg_to_num(to_jsonb(r.tee_data) ->> 'slope_back9') BETWEEN 55 AND 155)
        END, false) AS picked_tee
    FROM public.rounds r
    WHERE (r.is_deleted IS NULL OR r.is_deleted = false)
  ),
  rounds_agg AS (
    SELECT
      count(*)                                                                    AS rounds_total,
      count(*) FILTER (WHERE differential IS NOT NULL)                            AS rounds_counting,
      count(*) FILTER (WHERE differential IS NULL
                         AND coalesce(holes_played, 18) = 9)                      AS pending_nines,
      count(*) FILTER (WHERE differential IS NULL
                         AND coalesce(holes_played, 18) = 18
                         AND total_score IS NOT NULL)                             AS stuck_18s,
      count(*) FILTER (WHERE coalesce(holes_played, 18) = 9)                      AS rounds_9,
      count(*) FILTER (WHERE scores_by_hole IS NOT NULL)                          AS rounds_hole_by_hole,
      count(*) FILTER (WHERE total_putts IS NOT NULL)                             AS rounds_putts_tracked,
      count(*) FILTER (WHERE picked_tee AND differential IS NOT NULL)             AS counting_picked_tee,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dogleg_score::float)::numeric, 1)
                                                                                  AS dogleg_median,
      count(*) FILTER (WHERE dogleg_score IS NOT NULL)                            AS dogleg_scored
    FROM live
  ),
  users_agg AS (
    SELECT count(DISTINCT user_id) AS users_with_rounds FROM live
  ),
  profs AS (
    SELECT
      count(*) FILTER (WHERE handicap_index IS NOT NULL) AS users_with_index,
      count(*) FILTER (WHERE handicap IS NOT NULL)       AS users_with_manual
    FROM public.profiles
  ),
  dist AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'count', c) ORDER BY b),
                    '[]'::jsonb) AS d
    FROM (
      SELECT least(floor(dogleg_score)::int, 9) AS b, count(*) AS c
      FROM live WHERE dogleg_score IS NOT NULL GROUP BY 1
    ) x
  ),
  pending_users AS (
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pending DESC), '[]'::jsonb) AS u
    FROM (
      SELECT p.username,
             count(*) FILTER (WHERE l.differential IS NULL
                                AND coalesce(l.holes_played, 18) = 9)  AS pending,
             count(*) FILTER (WHERE l.differential IS NOT NULL)        AS counting,
             (p.handicap IS NOT NULL)                                  AS has_manual,
             p.handicap_index
      FROM live l
      JOIN public.profiles p ON p.id = l.user_id
      GROUP BY p.id, p.username, p.handicap, p.handicap_index
      HAVING count(*) FILTER (WHERE l.differential IS NULL
                                AND coalesce(l.holes_played, 18) = 9) > 0
      ORDER BY 2 DESC
      LIMIT 20
    ) t
  )
  SELECT jsonb_build_object(
    'rounds_total',         ra.rounds_total,
    'rounds_counting',      ra.rounds_counting,
    'pending_nines',        ra.pending_nines,
    'stuck_18s',            ra.stuck_18s,
    'rounds_9',             ra.rounds_9,
    'rounds_hole_by_hole',  ra.rounds_hole_by_hole,
    'rounds_putts_tracked', ra.rounds_putts_tracked,
    'counting_picked_tee',  ra.counting_picked_tee,
    'dogleg_median',        ra.dogleg_median,
    'dogleg_scored',        ra.dogleg_scored,
    'users_with_rounds',    ua.users_with_rounds,
    'users_with_index',     pr.users_with_index,
    'users_with_manual',    pr.users_with_manual,
    'dogleg_distribution',  d.d,
    'pending_users',        pu.u
  )
  INTO result
  FROM rounds_agg ra, users_agg ua, profs pr, dist d, pending_users pu;

  RETURN result;
END;
$$;


-- ============================================================================
-- PART 3 — Per-user diagnostic: get_user_stats_diagnostic_admin(username)
-- The "why doesn't X have a handicap" answer as one call: every round with
-- a verdict, plus the index math.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_stats_diagnostic_admin(p_username text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  rounds_json jsonb;
  summary jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT id INTO uid FROM public.profiles
  WHERE lower(username) = lower(trim(p_username));

  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'No user with that username');
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.played_at, t.created_at), '[]'::jsonb)
  INTO rounds_json
  FROM (
    SELECT r.short_code, r.played_at, r.created_at, r.total_score, r.holes_played,
           r.differential, r.dogleg_score,
           CASE
             WHEN coalesce(r.is_deleted, false) THEN 'deleted — never counts'
             WHEN r.differential IS NOT NULL THEN 'counts toward index'
             WHEN r.total_score IS NULL THEN 'no total score'
             WHEN coalesce(r.holes_played, 18) = 9 THEN
               CASE WHEN public.dogleg_nine_differential(r) IS NULL
                    THEN 'nine with unusable ratings or score'
                    ELSE 'pending nine — converts once a handicap signal or a second nine exists'
               END
             ELSE 'no differential (unusual total or missing ratings/par)'
           END AS verdict
    FROM public.rounds r
    WHERE r.user_id = uid
  ) t;

  SELECT jsonb_build_object(
    'counting',      count(*) FILTER (WHERE differential IS NOT NULL),
    'pending_nines', count(*) FILTER (WHERE differential IS NULL
                                        AND coalesce(holes_played, 18) = 9),
    'pairs_available', count(*) FILTER (WHERE differential IS NULL
                                          AND coalesce(holes_played, 18) = 9
                                          AND public.dogleg_nine_differential(r) IS NOT NULL) / 2,
    'needed_for_index', greatest(0,
        3 - (count(*) FILTER (WHERE differential IS NOT NULL)
             + count(*) FILTER (WHERE differential IS NULL
                                  AND coalesce(holes_played, 18) = 9
                                  AND public.dogleg_nine_differential(r) IS NOT NULL) / 2))
  )
  INTO summary
  FROM public.rounds r
  WHERE r.user_id = uid AND (r.is_deleted IS NULL OR r.is_deleted = false);

  RETURN jsonb_build_object(
    'profile', (SELECT jsonb_build_object(
                  'username', username,
                  'manual_handicap', handicap,
                  'handicap_index', handicap_index,
                  'is_banned', coalesce(is_banned, false))
                FROM public.profiles WHERE id = uid),
    'rounds', rounds_json,
    'summary', summary
  );
END;
$$;


-- ============================================================================
-- PART 4 — Retention cohorts: get_retention_cohorts_admin(weeks)
-- For each signup week: how many of that cohort posted a round in week
-- 0..7 after signing up. The chart that tests the stats-retention thesis.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_retention_cohorts_admin(p_weeks int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN coalesce((
    WITH cohort_users AS (
      SELECT id, date_trunc('week', created_at)::date AS cohort_week
      FROM public.profiles
      WHERE created_at IS NOT NULL
        AND created_at >= date_trunc('week', now()) - (p_weeks || ' weeks')::interval
    ),
    activity AS (
      SELECT DISTINCT r.user_id, date_trunc('week', r.created_at)::date AS active_week
      FROM public.rounds r
      WHERE (r.is_deleted IS NULL OR r.is_deleted = false)
    ),
    cells AS (
      SELECT cu.cohort_week, wk.offs,
             count(DISTINCT cu.id)                                          AS cohort_size,
             count(DISTINCT cu.id) FILTER (WHERE a.user_id IS NOT NULL)     AS active
      FROM cohort_users cu
      CROSS JOIN generate_series(0, 7) AS wk(offs)
      LEFT JOIN activity a
        ON a.user_id = cu.id
       AND a.active_week = cu.cohort_week + (wk.offs * 7)
      WHERE cu.cohort_week + (wk.offs * 7) <= date_trunc('week', now())::date
      GROUP BY 1, 2
    )
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cohort_week DESC)
    FROM (
      SELECT c.cohort_week,
             max(c.cohort_size) AS cohort_size,
             jsonb_agg(jsonb_build_object(
               'week', c.offs,
               'pct', round(100.0 * c.active / nullif(c.cohort_size, 0))
             ) ORDER BY c.offs) AS retention
      FROM cells c
      GROUP BY c.cohort_week
    ) t
  ), '[]'::jsonb);
END;
$$;


-- ============================================================================
-- PART 5 — Grants (matches the existing *_admin pattern: callable by
-- authenticated, rejected inside unless is_admin())
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_stats_engine_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_stats_diagnostic_admin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_retention_cohorts_admin(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stats_engine_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_stats_diagnostic_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_retention_cohorts_admin(int) TO authenticated;
