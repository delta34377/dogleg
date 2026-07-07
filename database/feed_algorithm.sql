-- ============================================================================
-- Dogleg — Feed algorithm (exported from production 2026-07-07)
-- ============================================================================
-- Source of truth for the feed RPCs, exported verbatim via
-- pg_get_functiondef so the algorithm lives in version control. Until this
-- file existed, these functions lived only in the production database.
--
-- WHICH ONE IS LIVE:
--   * get_feed_chronological_mixed — THE LIVE FEED. The app calls only this
--     (frontend/src/services/roundsService.js getFeedWithDiscovery hardcodes
--     it). Pure chronological; discovery rounds are *filtered in* by mode,
--     not quota'd.
--   * get_feed_with_discovery — LEGACY, unused. The older scored/ranked
--     variant (0.6·recency + 0.3·log-engagement + 0.1·course-affinity with
--     per-source quotas). Kept for history; superseded when the feed went
--     chronological.
--   * get_feed_with_discovery_chronological — LEGACY, unused. Intermediate
--     variant between the two above. NOTE: it lacks the soft-delete filters
--     the other two gained — do not resurrect it as-is.
--   * get_feed_with_everything — LEGACY, unused by the UI. An idle wrapper
--     survives (roundsService.getFeedWithEverything) but no component calls
--     it. Early single-query feed (following + own rounds only, no
--     discovery).
--
-- KNOBS (admin → Feed Algorithm panel → app_settings key 'feed'):
--   * mode ('following' | 'mixed' | 'discover')  → USED: gates which sources
--     are eligible in the live function.
--   * feedLimit                                   → USED: page size.
--   * discoveryRatio                              → NOT USED by the live
--     function: p_discover_ratio is accepted but never referenced in
--     get_feed_chronological_mixed's body. The admin slider currently has
--     no effect. (The legacy variants did use it for per-source quotas.)
--   * popularThreshold                            → NOT USED: the panel edits
--     it but feedSettingsService doesn't persist it, and the live SQL
--     hardcodes "≥3 reactions or ≥2 comments" for 'Popular round'.
--
-- Planned upgrades (approved direction, not yet built): adaptive per-user
-- discovery backfill (discovery only when following content runs thin) and
-- stat-aware discovery ranking (heaters/milestones from nearby courses).
-- ============================================================================


-- ============================================================================
-- LIVE: get_feed_chronological_mixed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_chronological_mixed(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_mode text DEFAULT 'mixed'::text, p_discover_ratio numeric DEFAULT 0.3)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH me AS (SELECT auth.uid() AS id),

my_following AS (
  SELECT following_id FROM follows WHERE follower_id = (SELECT id FROM me)
),

my_courses AS (
  SELECT DISTINCT COALESCE(course_id, '-1') AS course_id, club_name
  FROM rounds
  WHERE user_id = (SELECT id FROM me)
    AND (is_deleted IS NULL OR is_deleted = FALSE)  -- ADDED SOFT DELETE FILTER
),

-- Get ALL rounds in chronological order with source
all_rounds_with_source AS (
  SELECT
    r.*,
    CASE
      WHEN r.user_id IN (SELECT following_id FROM my_following) THEN 'following'
      ELSE 'discover'
    END AS source,
    CASE
      WHEN r.user_id IN (SELECT following_id FROM my_following) THEN NULL
      WHEN r.course_id IN (SELECT course_id FROM my_courses WHERE course_id <> '-1')
           OR r.club_name IN (SELECT club_name FROM my_courses) THEN 'Near courses you''ve played'
      WHEN (SELECT COUNT(*) FROM reactions WHERE round_id = r.id) >= 3
           OR (SELECT COUNT(*) FROM comments WHERE round_id = r.id AND is_deleted = FALSE) >= 2 THEN 'Popular round'
      ELSE NULL
    END AS reason
  FROM rounds r
  WHERE
    -- CRITICAL: Filter out soft deleted rounds
    (r.is_deleted IS NULL OR r.is_deleted = FALSE)
    AND (
      -- Following rounds
      (p_mode IN ('mixed', 'following') AND r.user_id IN (SELECT following_id FROM my_following))
      OR
      -- Discovery rounds (only popular or nearby)
      (p_mode IN ('mixed', 'discover')
       AND r.user_id <> (SELECT id FROM me)
       AND r.user_id NOT IN (SELECT following_id FROM my_following)
       AND (
         (r.course_id IN (SELECT course_id FROM my_courses WHERE course_id <> '-1')
          OR r.club_name IN (SELECT club_name FROM my_courses))
         OR
         ((SELECT COUNT(*) FROM reactions WHERE round_id = r.id) >= 3
          OR (SELECT COUNT(*) FROM comments WHERE round_id = r.id AND is_deleted = FALSE) >= 2)
       ))
    )
  ORDER BY r.played_at DESC, r.created_at DESC, r.id DESC
),

-- For mixed mode, interleave following and discovery rounds
all_rounds AS (
  SELECT * FROM all_rounds_with_source
  ORDER BY played_at DESC, created_at DESC, id DESC
  LIMIT p_limit
  OFFSET p_offset
),

-- Rest stays the same
rx_counts AS (
  SELECT round_id,
    COUNT(*) FILTER (WHERE reaction_type = 'fire') AS fire,
    COUNT(*) FILTER (WHERE reaction_type = 'clap') AS clap,
    COUNT(*) FILTER (WHERE reaction_type = 'dart') AS dart,
    COUNT(*) FILTER (WHERE reaction_type = 'goat') AS goat,
    COUNT(*) FILTER (WHERE reaction_type = 'vomit') AS vomit,
    COUNT(*) FILTER (WHERE reaction_type = 'clown') AS clown,
    COUNT(*) FILTER (WHERE reaction_type = 'skull') AS skull,
    COUNT(*) FILTER (WHERE reaction_type = 'laugh') AS laugh
  FROM reactions
  WHERE round_id IN (SELECT id FROM all_rounds)
  GROUP BY round_id
),

my_rx AS (
  SELECT round_id, array_agg(reaction_type) AS user_reacted
  FROM reactions
  WHERE user_id = (SELECT id FROM me)
    AND round_id IN (SELECT id FROM all_rounds)
  GROUP BY round_id
),

last3_comments AS (
  SELECT c.round_id,
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'text', c.content,
        'author', p.username,
        'author_avatar', p.avatar_url,
        'date', c.created_at,
        'user_id', c.user_id
      )
      ORDER BY c.created_at ASC
    ) AS comments
  FROM (
    SELECT c.*,
      row_number() OVER (PARTITION BY c.round_id ORDER BY c.created_at DESC) AS rn
    FROM comments c
    WHERE c.round_id IN (SELECT id FROM all_rounds)
      AND c.is_deleted = FALSE  -- ADDED SOFT DELETE FILTER FOR COMMENTS
  ) c
  JOIN profiles p ON p.id = c.user_id
  WHERE c.rn <= 3
  GROUP BY c.round_id
)

SELECT jsonb_build_object(
  'rounds',
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ar.id,
        'user_id', ar.user_id,
        'course_id', ar.course_id,
        'course_name', ar.course_name,
        'club_name', ar.club_name,
        'city', ar.city,
        'state', ar.state,
        'played_at', ar.played_at,
        'front9', ar.front9,
        'back9', ar.back9,
        'total_score', ar.total_score,
        'scores_by_hole', ar.scores_by_hole,
        'par', ar.par,
        'course_pars', ar.course_pars,
        'tee_data', ar.tee_data,
        'caption', ar.caption,
        'photo_url', ar.photo_url,
        'source', ar.source,
        'reason', ar.reason,
        'profiles', jsonb_build_object(
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url
        ),
        'reactions', COALESCE((SELECT to_jsonb(rx_counts.*) FROM rx_counts WHERE round_id = ar.id), '{}'::jsonb),
        'userReacted', COALESCE((SELECT my_rx.user_reacted FROM my_rx WHERE round_id = ar.id), ARRAY[]::text[]),
        'comments', COALESCE((SELECT last3_comments.comments FROM last3_comments WHERE round_id = ar.id), '[]'::jsonb)
      )
      ORDER BY ar.played_at DESC
    ),
    '[]'::jsonb
  )
)
FROM all_rounds ar
LEFT JOIN profiles pr ON pr.id = ar.user_id;
$function$;


-- ============================================================================
-- LEGACY (unused): get_feed_with_discovery — scored/ranked variant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_with_discovery(p_limit integer, p_offset integer, p_mode text DEFAULT 'mixed'::text, p_discover_ratio numeric DEFAULT 0.3)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with me as (select auth.uid() as id),

my_following as (
  select following_id
  from follows
  where follower_id = (select id from me)
),

my_courses as (
  select distinct coalesce(course_id, '-1') as course_id, club_name
  from rounds
  where user_id = (select id from me)
    AND (is_deleted IS NULL OR is_deleted = FALSE)  -- Added soft delete filter
),

-- following rounds
base_follow as (
  select r.*, 'following'::text as source, null::text as reason
  from rounds r
  where r.user_id in (select following_id from my_following)
    AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)  -- Added soft delete filter
),

-- discovery rounds (non-followed, not me)
base_discover as (
  select r.*, 'discover'::text as source,
         case
           when r.course_id in (select course_id from my_courses where course_id <> '-1')
                or r.club_name in (select club_name from my_courses)
             then 'Near courses you''ve played'
           else 'Popular round'
         end as reason
  from rounds r
  where r.user_id <> (select id from me)
    and r.user_id not in (select following_id from my_following)
    AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)  -- Added soft delete filter
),

-- engagement summary for scoring
eng as (
  select round_id,
         count(*)                                         as rx_total,
         count(*) filter (where reaction_type in ('fire','clap','dart','goat')) as rx_pos
  from reactions
  where round_id in (
    select id from base_follow
    union all
    select id from base_discover
  )
  group by round_id
),

-- score for ordering
scored as (
  select r.*,
         coalesce(e.rx_total, 0) as rx_total,
         extract(epoch from (now() - r.played_at))/3600 as age_hours,
         (
           0.6 * exp(-extract(epoch from (now() - r.played_at))/3600 / 24.0) -- recency
           + 0.3 * ln(1 + coalesce(e.rx_total, 0))                          -- engagement
           + 0.1 * case                                                     -- affinity
               when r.course_id in (select course_id from my_courses where course_id <> '-1') then 1
               when r.club_name in (select club_name from my_courses) then 0.8
               else 0
             end
         ) as score
  from (
    select * from base_follow
    union all
    select * from base_discover
  ) r
  left join eng e on e.round_id = r.id
),

ranked as (
  select *,
         row_number() over (partition by source order by score desc, played_at desc, id desc) as rn_source
  from scored
),

-- pick per-source quotas (for 'mixed'); for 'following'/'discover' we zero the other side
mixed as (
  select *
  from ranked
  where (
      source = 'following'
      and rn_source <= ceil(p_limit * (case when p_mode = 'discover' then 0 else (1 - p_discover_ratio) end))
    )
    or (
      source = 'discover'
      and rn_source <= ceil(p_limit * (case when p_mode = 'following' then 0 else p_discover_ratio end))
    )
  order by score desc, played_at desc, id desc
  limit p_limit offset p_offset
),

-- aggregates to attach to cards
rx_counts as (
  select round_id,
         count(*) filter (where reaction_type = 'fire')  as fire,
         count(*) filter (where reaction_type = 'clap')  as clap,
         count(*) filter (where reaction_type = 'dart')  as dart,
         count(*) filter (where reaction_type = 'goat')  as goat,
         count(*) filter (where reaction_type = 'vomit') as vomit,
         count(*) filter (where reaction_type = 'clown') as clown,
         count(*) filter (where reaction_type = 'skull') as skull,
         count(*) filter (where reaction_type = 'laugh') as laugh
  from reactions
  where round_id in (select id from mixed)
  group by round_id
),

my_rx as (
  select round_id, array_agg(reaction_type) as user_reacted
  from reactions
  where user_id = (select id from me)
    and round_id in (select id from mixed)
  group by round_id
),

last3_comments as (
  select c.round_id,
         jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'text', c.content,
             'author', p.username,
             'author_avatar', p.avatar_url,
             'date', c.created_at,
             'user_id', c.user_id
           )
           order by c.created_at asc
         ) as comments
  from (
    select c.*,
           row_number() over (partition by c.round_id order by c.created_at desc) as rn
    from comments c
    where c.round_id in (select id from mixed)
      AND c.is_deleted = FALSE  -- Added soft delete filter
  ) c
  join profiles p on p.id = c.user_id
  where c.rn <= 3
  group by c.round_id
)

select jsonb_build_object(
  'rounds',
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'user_id', m.user_id,
        'course_id', m.course_id,
        'course_name', m.course_name,
        'club_name', m.club_name,
        'city', m.city,
        'state', m.state,
        'played_at', m.played_at,
        'front9', m.front9,
        'back9', m.back9,
        'total_score', m.total_score,
        'scores_by_hole', m.scores_by_hole,
        'par', m.par,
        'course_pars', m.course_pars,
        'tee_data', m.tee_data,
        'caption', m.caption,
        'photo_url', m.photo_url,
        'source', m.source,
        'reason', m.reason,
        'profiles', jsonb_build_object(
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url
        ),
        'reactions', coalesce((select to_jsonb(rx_counts.*) from rx_counts where round_id = m.id), '{}'::jsonb),
        'userReacted', coalesce((select my_rx.user_reacted from my_rx where round_id = m.id), ARRAY[]::text[]),
        'comments', coalesce((select last3_comments.comments from last3_comments where round_id = m.id), '[]'::jsonb)
      )
      order by m.score desc, m.played_at desc, m.id desc
    ),
    '[]'::jsonb
  )
)
from mixed m
left join profiles pr on pr.id = m.user_id;
$function$;


-- ============================================================================
-- LEGACY (unused): get_feed_with_discovery_chronological — intermediate
-- variant. WARNING: no soft-delete filters; do not resurrect as-is.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_with_discovery_chronological(p_limit integer, p_offset integer, p_mode text DEFAULT 'mixed'::text, p_discover_ratio numeric DEFAULT 0.3)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
-- (entire function stays the same until the final mixed CTE)
with me as (select auth.uid() as id),

my_following as (
  select following_id
  from follows
  where follower_id = (select id from me)
),

my_courses as (
  select distinct coalesce(course_id, '-1') as course_id, club_name
  from rounds
  where user_id = (select id from me)
),

base_follow as (
  select r.*, 'following'::text as source, null::text as reason
  from rounds r
  where r.user_id in (select following_id from my_following)
),

base_discover as (
  select r.*, 'discover'::text as source,
         case
           when r.course_id in (select course_id from my_courses where course_id <> '-1')
                or r.club_name in (select club_name from my_courses)
             then 'Near courses you''ve played'
           else 'Popular round'
         end as reason
  from rounds r
  where r.user_id <> (select id from me)
    and r.user_id not in (select following_id from my_following)
),

-- CHANGED: Order by played_at DESC instead of score
mixed as (
  select * from (
    select * from base_follow
    where p_mode in ('mixed', 'following')
    order by played_at desc
    limit ceil(p_limit * (case when p_mode = 'discover' then 0 else (1 - p_discover_ratio) end))
  ) f
  union all
  select * from (
    select * from base_discover
    where p_mode in ('mixed', 'discover')
    order by played_at desc
    limit ceil(p_limit * (case when p_mode = 'following' then 0 else p_discover_ratio end))
  ) d
  order by played_at desc, id desc  -- PURE CHRONOLOGICAL ORDER
  limit p_limit offset p_offset
),

-- Rest of the function remains the same...
rx_counts as (
  select round_id,
         count(*) filter (where reaction_type = 'fire')  as fire,
         count(*) filter (where reaction_type = 'clap')  as clap,
         count(*) filter (where reaction_type = 'dart')  as dart,
         count(*) filter (where reaction_type = 'goat')  as goat,
         count(*) filter (where reaction_type = 'vomit') as vomit,
         count(*) filter (where reaction_type = 'clown') as clown,
         count(*) filter (where reaction_type = 'skull') as skull,
         count(*) filter (where reaction_type = 'laugh') as laugh
  from reactions
  where round_id in (select id from mixed)
  group by round_id
),

my_rx as (
  select round_id, array_agg(reaction_type) as user_reacted
  from reactions
  where user_id = (select id from me)
    and round_id in (select id from mixed)
  group by round_id
),

last3_comments as (
  select c.round_id,
         jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'text', c.content,
             'author', p.username,
             'author_avatar', p.avatar_url,
             'date', c.created_at,
             'user_id', c.user_id
           )
           order by c.created_at asc
         ) as comments
  from (
    select c.*,
           row_number() over (partition by c.round_id order by c.created_at desc) as rn
    from comments c
    where c.round_id in (select id from mixed)
  ) c
  join profiles p on p.id = c.user_id
  where c.rn <= 3
  group by c.round_id
)

select jsonb_build_object(
  'rounds',
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'user_id', m.user_id,
        'course_id', m.course_id,
        'course_name', m.course_name,
        'club_name', m.club_name,
        'city', m.city,
        'state', m.state,
        'played_at', m.played_at,
        'front9', m.front9,
        'back9', m.back9,
        'total_score', m.total_score,
        'scores_by_hole', m.scores_by_hole,
        'par', m.par,
        'course_pars', m.course_pars,
        'tee_data', m.tee_data,
        'caption', m.caption,
        'photo_url', m.photo_url,
        'source', m.source,
        'reason', m.reason,
        'profiles', jsonb_build_object(
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url
        ),
        'reactions', coalesce((select to_jsonb(rx_counts.*) from rx_counts where round_id = m.id), '{}'::jsonb),
        'userReacted', coalesce((select my_rx.user_reacted from my_rx where round_id = m.id), ARRAY[]::text[]),
        'comments', coalesce((select last3_comments.comments from last3_comments where round_id = m.id), '[]'::jsonb)
      )
      order by m.played_at desc, m.id desc  -- CHRONOLOGICAL ORDER IN OUTPUT
    ),
    '[]'::jsonb
  )
)
from mixed m
left join profiles pr on pr.id = m.user_id;
$function$;


-- ============================================================================
-- LEGACY (unused): get_feed_with_everything — early following-only feed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_with_everything(user_id_param uuid, limit_num integer DEFAULT 10, offset_num integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  rounds_json JSON;
BEGIN
  -- Get everything in one query
  WITH feed_rounds AS (
    SELECT
      r.*,
      row_to_json(p.*) as profiles
    FROM rounds r
    LEFT JOIN profiles p ON p.id = r.user_id
    LEFT JOIN follows f ON f.following_id = r.user_id AND f.follower_id = user_id_param
    WHERE (r.user_id = user_id_param OR f.follower_id IS NOT NULL)
      AND (r.is_deleted IS NULL OR r.is_deleted = FALSE)  -- Added soft delete filter
    ORDER BY r.played_at DESC
    LIMIT limit_num
    OFFSET offset_num
  )
  SELECT json_build_object(
    'rounds', (SELECT json_agg(fr.*) FROM feed_rounds fr),
    'reactions', (
      SELECT json_agg(re.*)
      FROM reactions re
      WHERE re.round_id IN (SELECT id FROM feed_rounds)
    ),
    'comments', (
      SELECT json_agg(
        json_build_object(
          'id', c.id,
          'round_id', c.round_id,
          'user_id', c.user_id,
          'content', c.content,
          'created_at', c.created_at,
          'profiles', row_to_json(cp.*)
        )
      )
      FROM comments c
      LEFT JOIN profiles cp ON cp.id = c.user_id
      WHERE c.round_id IN (SELECT id FROM feed_rounds)
        AND c.is_deleted = FALSE  -- Added soft delete filter
    ),
    'user_reactions', (
      SELECT json_agg(ur.*)
      FROM reactions ur
      WHERE ur.round_id IN (SELECT id FROM feed_rounds)
        AND ur.user_id = user_id_param
    )
  ) INTO rounds_json;

  RETURN rounds_json;
END;
$function$;
