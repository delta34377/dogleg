-- ============================================================================
-- Dogleg SQL test harness — mock of the production base schema
-- ============================================================================
-- The real base schema (tables, RLS policies, triggers and about 19 RPCs)
-- lives only in the production Supabase project, not in git. This file is a
-- best-effort reconstruction so database/*.sql can be applied and tested
-- locally. Sources: every .from()/.insert()/.update()/.rpc() in
-- frontend/src, scripts/import-golf-data.js, docs/, and what database/*.sql
-- reads and replaces.
--
-- GUIDING RULE: where production is unknown, model the RISKIER plausible
-- choice (e.g. a rounds UPDATE policy exists, the notification trigger runs
-- with the caller's rights, RLS lets everyone read rounds). A migration that
-- passes here should then also be safe on the more locked-down variant.
-- Every guess is marked "UNCERTAIN" and listed in README.md.
--
-- Columns that database/*.sql adds itself are deliberately NOT here
-- (rounds.differential, dogleg_score, strokes_vs_usual, achievements,
-- stats_by_hole, total_putts; profiles.handicap_index), so the harness proves
-- those migrations really add them. profiles.is_admin IS here: production had
-- it before admin_stats_engine.sql (see admin_security_audit.sql), whose
-- ADD COLUMN IF NOT EXISTS is then a no-op, as in production.
--
-- Column-type variants: run.sh passes psql variables so the suite can also
-- run against the other plausible production types:
--   MOCK_SCORES_TYPE    rounds.scores_by_hole / course_pars  (default integer[]; try jsonb, json)
--   MOCK_PLAYED_AT_TYPE rounds.played_at                     (default timestamptz; try date, timestamp)
-- ============================================================================

\if :{?mock_scores_type}
\else
  \set mock_scores_type 'integer[]'
\endif
\if :{?mock_played_at_type}
\else
  \set mock_played_at_type 'timestamptz'
\endif


-- ============================================================================
-- 1. Golf reference data (imported by scripts/import-golf-data.js with the
--    service key; read-only for app users)
-- ============================================================================

CREATE TABLE public.clubs (
  club_id     text PRIMARY KEY,
  club_name   text,
  address     text,
  city        text,
  postal_code text,          -- text: ZIP codes with leading zeros
  state       text,
  country     text,
  latitude    numeric,
  longitude   numeric,
  website     text,
  email       text,
  telephone   text,
  continent   text
);

CREATE TABLE public.courses (
  course_id         text PRIMARY KEY,
  club_id           text REFERENCES public.clubs (club_id),
  long_course_id    text,
  course_name       text,
  num_holes         integer,
  measure_meters    boolean,
  -- UNCERTAIN: text[] because ScoreEntry.js says pars "come as strings"
  -- (it parseInt()s them). stats_layer.sql reads them via to_jsonb(), so
  -- int[] / jsonb would work too.
  pars              text[],
  handicaps         text[],  -- stroke index per hole
  pars_women        text[],
  handicaps_women   text[],
  match_indices     text[],
  split_indices     text[],
  total_par         integer,
  timestamp_updated text
);

CREATE TABLE public.tees (
  tee_id             text PRIMARY KEY,   -- text ids ("String(row.TeeID)")
  course_id          text REFERENCES public.courses (course_id),
  tee_name           text,
  tee_color          text,
  -- UNCERTAIN: numeric for all ratings and slopes (slopes may be integer)
  slope              numeric,
  slope_front9       numeric,
  slope_back9        numeric,
  course_rating      numeric,
  cr_front9          numeric,
  cr_back9           numeric,
  slope_women        numeric,
  slope_women_front9 numeric,
  slope_women_back9  numeric,
  cr_women           numeric,
  cr_women_front9    numeric,
  cr_women_back9     numeric,
  measure_unit       text,
  hole_lengths       integer[],
  total_length       integer
);


-- ============================================================================
-- 2. Profiles (one row per user; the browser inserts it on first sign-in)
-- ============================================================================

CREATE TABLE public.profiles (
  id                       uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username                 text UNIQUE,   -- UNCERTAIN: unique, case-sensitive
  full_name                text,
  avatar_url               text,
  avatar_path              text,
  bio                      text,
  handicap                 numeric,       -- UNCERTAIN: integer or numeric (manual handicap)
  location                 text,
  phone                    text,
  wants_newsletter         boolean DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz,
  last_notifications_check timestamptz,
  follower_count           integer DEFAULT 0,   -- maintained by update_follow_counts()
  following_count          integer DEFAULT 0,
  is_banned                boolean DEFAULT false,
  is_admin                 boolean DEFAULT false
);


-- ============================================================================
-- 3. Rounds
-- ============================================================================

CREATE TABLE public.rounds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK to profiles (PostgREST embeds use "profiles!rounds_user_id_fkey").
  -- UNCERTAIN: no FK from course_id to courses (custom courses / '-1' exist in SQL).
  user_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  course_id      text,
  course_name    text,
  club_name      text,
  city           text,
  state          text,
  tee_id         text,
  tee_data       jsonb,      -- the whole selected tees row, sent by the browser
  -- UNCERTAIN: timestamptz (ENTRY-9); the client sends 'YYYY-MM-DDT00:00:00'
  played_at      :mock_played_at_type DEFAULT now(),
  front9         integer,
  back9          integer,
  total_score    integer,
  -- UNCERTAIN: int[], jsonb or json; stats_layer.sql reads and compares them
  -- only through to_jsonb() (json has no "=" operator)
  scores_by_hole :mock_scores_type,
  par            integer,
  course_pars    :mock_scores_type,
  caption        text,
  photo_url      text,
  created_at     timestamptz DEFAULT now(),
  is_deleted     boolean DEFAULT false,
  is_private     boolean DEFAULT false,
  short_code     text UNIQUE,
  -- already in production before stats_layer.sql ("integer, default 18")
  holes_played   integer DEFAULT 18
);

CREATE INDEX rounds_user_id_idx ON public.rounds (user_id);
CREATE INDEX rounds_played_at_idx ON public.rounds (played_at DESC);

-- Short codes for share links (/rounds/K7FX9M): 6 characters from an
-- alphabet without look-alikes (docs/readme.md "Round URL System").
-- UNCERTAIN: production's trigger name and timing. Modelled as the common
-- BEFORE INSERT, caller's-rights trigger, so the code is already on the row
-- returned by insert(...).select(). If production instead UPDATEs the row
-- AFTER INSERT, column-level REVOKEs on short_code would break inserts there.
CREATE OR REPLACE FUNCTION public.generate_short_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_round_short_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  tries int := 0;
BEGIN
  IF NEW.short_code IS NULL THEN
    LOOP
      candidate := public.generate_short_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rounds WHERE short_code = candidate);
      tries := tries + 1;
      IF tries > 20 THEN
        RAISE EXCEPTION 'could not generate a unique short code';
      END IF;
    END LOOP;
    NEW.short_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_round_short_code
  BEFORE INSERT ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_round_short_code();


-- ============================================================================
-- 4. Social: reactions, comments, follows, notifications
-- ============================================================================

-- UNCERTAIN: no UNIQUE (user_id, round_id, reaction_type) — the app toggles
-- with check-then-insert (SOCIAL-2), so duplicates are plausible.
CREATE TABLE public.reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      uuid NOT NULL REFERENCES public.rounds (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reaction_type text NOT NULL,   -- fire, clap, dart, goat, vomit, clown, skull, laugh
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE public.comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   uuid NOT NULL REFERENCES public.rounds (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_deleted boolean DEFAULT false   -- soft delete by moderation
);

CREATE TABLE public.follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id)   -- UNCERTAIN (SOCIAL-13); no self-follow CHECK
);

-- FK names matter: notificationsService embeds
-- profiles!notifications_actor_id_fkey and comments!notifications_comment_id_fkey.
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,  -- recipient
  type       text NOT NULL,                                                  -- reaction | comment | follow
  actor_id   uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  round_id   uuid REFERENCES public.rounds (id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments (id) ON DELETE CASCADE,
  message    text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Follower counts (docs/readme.md: "update_follow_counts() auto-maintains
-- follower counts"). SECURITY DEFINER because it writes other users' rows.
CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET follower_count  = coalesce(follower_count, 0) + 1 WHERE id = NEW.following_id;
    UPDATE public.profiles SET following_count = coalesce(following_count, 0) + 1 WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET follower_count  = greatest(coalesce(follower_count, 0) - 1, 0) WHERE id = OLD.following_id;
    UPDATE public.profiles SET following_count = greatest(coalesce(following_count, 0) - 1, 0) WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_follow_counts_trigger
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();

-- The ORIGINAL notification writer, as notifications_hardening.sql describes
-- it: NOT security definer (runs with the reacting user's rights, which is
-- why the "anyone can insert" policies below existed) and no dedup.
-- notifications_hardening.sql replaces this function.
-- UNCERTAIN: trigger names.
CREATE OR REPLACE FUNCTION public.create_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'reactions' THEN
        INSERT INTO notifications (user_id, type, actor_id, round_id, message)
        SELECT r.user_id, 'reaction', NEW.user_id, NEW.round_id,
               p.username || ' reacted to your round'
        FROM rounds r
        JOIN profiles p ON p.id = NEW.user_id
        WHERE r.id = NEW.round_id AND r.user_id != NEW.user_id;
    ELSIF TG_TABLE_NAME = 'comments' THEN
        INSERT INTO notifications (user_id, type, actor_id, round_id, comment_id, message)
        SELECT r.user_id, 'comment', NEW.user_id, NEW.round_id, NEW.id,
               p.username || ' commented on your round'
        FROM rounds r
        JOIN profiles p ON p.id = NEW.user_id
        WHERE r.id = NEW.round_id AND r.user_id != NEW.user_id;
    ELSIF TG_TABLE_NAME = 'follows' THEN
        INSERT INTO notifications (user_id, type, actor_id, message)
        SELECT NEW.following_id, 'follow', NEW.follower_id,
               p.username || ' started following you'
        FROM profiles p
        WHERE p.id = NEW.follower_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER reaction_notification AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();
CREATE TRIGGER comment_notification AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();
CREATE TRIGGER follow_notification AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();


-- ============================================================================
-- 5. Admin / settings / moderation / analytics tables
-- ============================================================================

CREATE TABLE public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_by uuid,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.app_settings (key, value)
VALUES ('feed', '{"mode": "mixed", "feedLimit": 10, "discoveryRatio": 0.3}');

-- docs/admin_plan.md
CREATE TABLE public.moderation_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id      uuid,
  action_type       text,
  target_user_id    uuid,
  target_content_id uuid,
  reason            text,
  metadata          jsonb,
  created_at        timestamptz DEFAULT now()
);

-- frontend/src/services/analyticsService.js
CREATE TABLE public.analytics_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  event_type text,
  event_data jsonb,
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.analytics_sessions (
  id               text PRIMARY KEY,   -- generated in the browser
  user_id          uuid,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  device_info      jsonb
);

CREATE TABLE public.analytics_user_metrics (
  user_id               uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  total_rounds          integer,
  total_reactions_given integer,
  total_comments_made   integer,
  engagement_score      numeric,
  user_segment          text,
  updated_at            timestamptz DEFAULT now()
);


-- ============================================================================
-- 6. "Who is an admin" — the definitions production had BEFORE
--    admin_stats_engine.sql (see admin_security_audit.sql)
-- ============================================================================

-- Legacy no-argument version: compared the JWT email with the founder's
-- address (a placeholder here). admin_stats_engine.sql replaces it.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') = 'founder@example.invalid'
$$;

-- One-argument version used by the app_settings policies.
-- UNCERTAIN: parameter name (CREATE OR REPLACE cannot rename parameters, so
-- never redefine this function in production SQL without checking).
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_admin FROM public.profiles WHERE id = uid), false)
$$;


-- ============================================================================
-- 7. Row Level Security — modelled on typical Supabase-tutorial policies.
--    RLS limits ROWS only; every table is still fully GRANTed to anon and
--    authenticated by the shim's default privileges, like production.
-- ============================================================================

ALTER TABLE public.clubs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tees                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_user_metrics ENABLE ROW LEVEL SECURITY;

-- Reference data: readable by everyone, writable by nobody (service key only)
CREATE POLICY "Clubs are viewable by everyone"   ON public.clubs   FOR SELECT USING (true);
CREATE POLICY "Courses are viewable by everyone" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Tees are viewable by everyone"    ON public.tees    FOR SELECT USING (true);

-- Profiles: the classic Supabase starter. Note the UPDATE policy pins the ROW
-- (your own) but not the COLUMNS — that is production's is_admin hole, which
-- security_hardening.sql closes with column grants (applied last).
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Rounds. UNCERTAIN: whether SELECT hides private/deleted rows (modelled: it
-- doesn't — SOCIAL-4) and whether an UPDATE policy exists (modelled: it does
-- — ENTRY-4).
CREATE POLICY "Rounds are viewable by everyone" ON public.rounds
  FOR SELECT USING (true);
CREATE POLICY "Users can insert own rounds" ON public.rounds
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rounds" ON public.rounds
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rounds" ON public.rounds
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Reactions are viewable by everyone" ON public.reactions
  FOR SELECT USING (true);
CREATE POLICY "Users can add own reactions" ON public.reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions" ON public.reactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Comments are viewable by everyone" ON public.comments
  FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Follows are viewable by everyone" ON public.follows
  FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Notifications: exactly the policy set notifications_hardening.sql found
-- and cleans up (two wide-open INSERT policies, three duplicate SELECTs).
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- app_settings: public read, admin-only writes (admin_security_audit.sql)
CREATE POLICY "App settings are viewable by everyone" ON public.app_settings
  FOR SELECT USING (true);
CREATE POLICY "Only admins can insert app settings" ON public.app_settings
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Only admins can update app settings" ON public.app_settings
  FOR UPDATE USING (public.is_admin(auth.uid()));

-- UNCERTAIN: moderation/analytics policies (written by SECURITY DEFINER RPCs
-- or fire-and-forget from the browser)
CREATE POLICY "Admins can view moderation log" ON public.moderation_log
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can insert analytics events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view analytics events" ON public.analytics_events
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can insert analytics sessions" ON public.analytics_sessions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update analytics sessions" ON public.analytics_sessions
  FOR UPDATE USING (true);
CREATE POLICY "Admins can view user metrics" ON public.analytics_user_metrics
  FOR SELECT USING (public.is_admin(auth.uid()));


-- ============================================================================
-- 8. Stubs for production RPCs that are not in git
--    Signatures (names, parameter names) come from the frontend's .rpc()
--    calls; bodies are GUESSES that only aim to behave plausibly. Do not
--    write tests that depend on these bodies, and never reference these
--    signatures from production SQL without checking them there first
--    (SELECT oid::regprocedure FROM pg_proc WHERE proname = '...').
--    The *_admin ones follow the audited pattern: SECURITY DEFINER and
--    "IF NOT is_admin() THEN RAISE EXCEPTION" first — and, like production
--    (admin_security_audit.sql PART 3), no pinned search_path.
--    Not modelled at all (unknown signatures, not referenced by any SQL):
--    ban_user_admin, count_all_*_admin, get_dashboard_overview,
--    get_activity_metrics, get_user_growth_metrics[_range],
--    get_engagement_metrics[_range], get_top_rounds, get_emoji_breakdown,
--    update_user_segments.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_user_ban_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  now_banned boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  UPDATE public.profiles SET is_banned = NOT coalesce(is_banned, false)
  WHERE id = p_user_id
  RETURNING is_banned INTO now_banned;
  INSERT INTO public.moderation_log (moderator_id, action_type, target_user_id)
  VALUES (auth.uid(), CASE WHEN now_banned THEN 'ban_user' ELSE 'unban_user' END, p_user_id);
  RETURN now_banned;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_round_admin(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  UPDATE public.rounds SET is_deleted = true WHERE id = p_round_id;  -- soft delete
  INSERT INTO public.moderation_log (moderator_id, action_type, target_content_id)
  VALUES (auth.uid(), 'delete_round', p_round_id);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_comment_admin(comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  UPDATE public.comments c SET is_deleted = true WHERE c.id = delete_comment_admin.comment_id;
  INSERT INTO public.moderation_log (moderator_id, action_type, target_content_id)
  VALUES (auth.uid(), 'delete_comment', delete_comment_admin.comment_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_content_admin(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  n_rounds int;
  n_comments int;
  n_reactions int;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  UPDATE public.rounds SET is_deleted = true
  WHERE user_id = p_user_id AND coalesce(is_deleted, false) = false;
  GET DIAGNOSTICS n_rounds = ROW_COUNT;
  UPDATE public.comments SET is_deleted = true
  WHERE user_id = p_user_id AND coalesce(is_deleted, false) = false;
  GET DIAGNOSTICS n_comments = ROW_COUNT;
  DELETE FROM public.reactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS n_reactions = ROW_COUNT;
  INSERT INTO public.moderation_log (moderator_id, action_type, target_user_id)
  VALUES (auth.uid(), 'delete_user_content', p_user_id);
  RETURN jsonb_build_object('rounds_deleted', n_rounds,
                            'comments_deleted', n_comments,
                            'reactions_deleted', n_reactions);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_users_admin(
  search_query text DEFAULT '', limit_num integer DEFAULT 20, offset_num integer DEFAULT 0,
  sort_by text DEFAULT 'created_at', sort_order text DEFAULT 'desc')
RETURNS TABLE (id uuid, username text, full_name text, email text, avatar_url text,
               created_at timestamptz, is_banned boolean, rounds_count bigint)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, u.email::text, p.avatar_url, p.created_at,
         coalesce(p.is_banned, false),
         (SELECT count(*) FROM public.rounds r WHERE r.user_id = p.id)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE coalesce(search_query, '') = ''
     OR p.username ILIKE '%' || search_query || '%'
     OR p.full_name ILIKE '%' || search_query || '%'
     OR u.email ILIKE '%' || search_query || '%'
  ORDER BY p.created_at DESC
  LIMIT limit_num OFFSET offset_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_rounds_admin(
  search_query text DEFAULT '', limit_num integer DEFAULT 20, offset_num integer DEFAULT 0)
RETURNS TABLE (id uuid, user_id uuid, username text, course_name text, total_score integer,
               played_at timestamptz, created_at timestamptz, is_deleted boolean)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY
  SELECT r.id, r.user_id, p.username, r.course_name, r.total_score,
         r.played_at::timestamptz, r.created_at, coalesce(r.is_deleted, false)
  FROM public.rounds r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE coalesce(search_query, '') = ''
     OR p.username ILIKE '%' || search_query || '%'
     OR r.course_name ILIKE '%' || search_query || '%'
  ORDER BY r.created_at DESC
  LIMIT limit_num OFFSET offset_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_comments_admin(
  search_query text DEFAULT '', limit_num integer DEFAULT 20, offset_num integer DEFAULT 0)
RETURNS TABLE (id uuid, round_id uuid, user_id uuid, username text, content text,
               created_at timestamptz, is_deleted boolean)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY
  SELECT c.id, c.round_id, c.user_id, p.username, c.content, c.created_at, coalesce(c.is_deleted, false)
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE coalesce(search_query, '') = ''
     OR c.content ILIKE '%' || search_query || '%'
     OR p.username ILIKE '%' || search_query || '%'
  ORDER BY c.created_at DESC
  LIMIT limit_num OFFSET offset_num;
END;
$$;

-- UNCERTAIN: SECURITY INVOKER (AUTH-1 notes say verify prosecdef). Modelled
-- as invoker — the riskier case — so it needs UPDATE rights on
-- profiles.last_notifications_check; a column allow-list must keep that.
CREATE OR REPLACE FUNCTION public.mark_notifications_checked()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.profiles SET last_notifications_check = now() WHERE id = auth.uid()
$$;

-- My Rounds tab. Shape mirrors get_feed_with_everything (feed_algorithm.sql).
CREATE OR REPLACE FUNCTION public.get_my_rounds_with_everything(
  user_id_param uuid, limit_num integer DEFAULT 10, offset_num integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  rounds_json json;
BEGIN
  WITH my_rounds AS (
    SELECT r.*, row_to_json(p.*) AS profiles
    FROM public.rounds r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = user_id_param
      AND (r.is_deleted IS NULL OR r.is_deleted = false)
    ORDER BY r.played_at DESC
    LIMIT limit_num OFFSET offset_num
  )
  SELECT json_build_object(
    'rounds', (SELECT json_agg(mr.*) FROM my_rounds mr),
    'reactions', (SELECT json_agg(re.*) FROM public.reactions re
                  WHERE re.round_id IN (SELECT id FROM my_rounds)),
    'comments', (SELECT json_agg(json_build_object(
                    'id', c.id, 'round_id', c.round_id, 'user_id', c.user_id,
                    'content', c.content, 'created_at', c.created_at,
                    'profiles', row_to_json(cp.*)))
                 FROM public.comments c
                 LEFT JOIN public.profiles cp ON cp.id = c.user_id
                 WHERE c.round_id IN (SELECT id FROM my_rounds)
                   AND c.is_deleted = false),
    'user_reactions', (SELECT json_agg(ur.*) FROM public.reactions ur
                       WHERE ur.round_id IN (SELECT id FROM my_rounds)
                         AND ur.user_id = user_id_param)
  ) INTO rounds_json;
  RETURN rounds_json;
END;
$$;

-- "Find nearby" on the Add Round tab (great-circle distance in miles).
CREATE OR REPLACE FUNCTION public.search_golf_courses(
  search_text text DEFAULT '', user_lat double precision DEFAULT NULL,
  user_lng double precision DEFAULT NULL, max_distance_miles double precision DEFAULT 15)
RETURNS TABLE (club_id text, club_name text, course_id text, course_name text,
               city text, state text, num_holes integer, total_par integer,
               distance_miles double precision)
LANGUAGE sql STABLE
AS $$
  SELECT * FROM (
    SELECT cl.club_id, cl.club_name, c.course_id, c.course_name, cl.city, cl.state,
           c.num_holes, c.total_par,
           3958.8 * 2 * asin(sqrt(
             power(sin(radians(cl.latitude::float8 - user_lat) / 2), 2)
             + cos(radians(user_lat)) * cos(radians(cl.latitude::float8))
             * power(sin(radians(cl.longitude::float8 - user_lng) / 2), 2))) AS distance_miles
    FROM public.clubs cl
    JOIN public.courses c ON c.club_id = cl.club_id
    WHERE (coalesce(search_text, '') = '' OR cl.club_name ILIKE '%' || search_text || '%'
           OR c.course_name ILIKE '%' || search_text || '%')
      AND cl.latitude IS NOT NULL AND cl.longitude IS NOT NULL
  ) s
  WHERE user_lat IS NULL OR s.distance_miles <= max_distance_miles
  ORDER BY s.distance_miles NULLS LAST
  LIMIT 50
$$;
