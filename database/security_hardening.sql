-- ============================================================================
-- Dogleg — Security hardening (2026-11)
-- ============================================================================
-- WHAT THIS FIXES (deep-dive report IDs in brackets)
--   1. Any signed-in user could make themselves an admin, lift their own ban
--      or fake their handicap index: Supabase lets the browser write EVERY
--      column of the user's own profiles row, and is_admin() trusts
--      profiles.is_admin. [AUTH-1, ADMIN-1, SECURITY-1, PROFILES-1, STATS-3]
--      -> The browser may still write every profiles column EXCEPT is_admin,
--         is_banned, handicap_index (and, where those columns exist,
--         follower_count, following_count, banned_at, banned_by, ban_reason).
--         Server code (SECURITY DEFINER functions, the SQL editor) still can.
--   2. The browser could send, or later rewrite, the columns the server
--      computes (holes_played, differential, dogleg_score, strokes_vs_usual,
--      achievements, short_code) and un-hide a round or comment a moderator
--      hid (is_deleted). [ENTRY-4, STATS-2] -> server-only now.
--   3. Writing as someone else, and bans that blocked nothing. [SOCIAL-1,
--      SECURITY-8, ADMIN-3, SECURITY-4] -> for rounds, reactions, comments
--      and follows the database itself now insists "only your own rows" and
--      "banned users can't post", whatever other policies exist.
--   4. Private rounds and banned users' rounds were shown to everyone.
--      [SOCIAL-4, SECURITY-13, PROFILES-4] -> hidden from other users.
--   5. A leftover "update own notifications" policy nobody uses. [SOCIAL-6]
--   6. Shared round links for signed-out visitors: get_public_round(code)
--      returns ONLY a public round, with its author, reaction counts and
--      comments (contract C3).
--   7. Internal stats helpers (dogleg_*) are no longer callable over the API
--      (Supabase security advisor hygiene).
--   8. Clean-up of the hole itself (only while it is still open, i.e. on the
--      first run): every admin flag except the founder's is reset, and
--      handicap indexes that don't match the golfer's rounds are recomputed.
--
-- HOW TO RUN (details, checks and rollback: database/README.md)
--   Run order: stats_layer.sql -> feed_algorithm.sql -> security_hardening.sql.
--   Supabase dashboard -> SQL Editor -> New query -> paste this ENTIRE file
--   -> Run. At the end it shows a short report table.
--   One transaction: if anything fails, NOTHING changes.
--   Safe to re-run. Re-run it after adding any column to profiles, rounds or
--   comments: it recomputes which columns the app may write.
--
-- THE RULE FOR NEW COLUMNS
--   profiles, rounds and comments no longer use "the app may write every
--   column". If the app must write a NEW column, either re-run this file or
--   run   GRANT INSERT (new_col), UPDATE (new_col) ON public.<table> TO authenticated;
--   otherwise the app gets "permission denied for column new_col".
--
-- WHY THESE TOOLS (for whoever maintains this)
--   * Column GRANTs, not a trigger: a grant list also covers columns added
--     later, and SECURITY DEFINER code (which runs as the table owner) is
--     unaffected, so the stats engine and the admin RPCs keep working.
--   * RESTRICTIVE policies: an extra condition that must ALSO be true on top
--     of whatever policies production already has (their names are not in
--     git). A restrictive policy can only ever take access away.
--   * Everything is found dynamically (columns from the catalog), so columns
--     that exist only in production keep working.
-- ============================================================================

BEGIN;


-- ============================================================================
-- PART 0 — Setup and preflight. Nothing is changed until all checks pass.
-- ============================================================================

-- What this run did, shown as a table at the very end (the SQL editor does
-- not always show NOTICE messages).
DROP TABLE IF EXISTS pg_temp.dogleg_security_report;
CREATE TEMP TABLE dogleg_security_report (
  n      int GENERATED ALWAYS AS IDENTITY,
  item   text,
  result text
);

-- The columns only the server may write: ONE list, used by the preflight,
-- the lockdown and the final checks. Columns that don't exist are skipped.
CREATE TEMP TABLE dogleg_protected_columns ON COMMIT DROP AS
SELECT v.tbl, v.col
FROM (VALUES
  -- who is an admin / banned, and the computed index
  ('profiles', 'is_admin'), ('profiles', 'is_banned'), ('profiles', 'handicap_index'),
  -- kept by triggers; ban details (only if production has them)
  ('profiles', 'follower_count'), ('profiles', 'following_count'),
  ('profiles', 'banned_at'), ('profiles', 'banned_by'), ('profiles', 'ban_reason'),
  -- computed by the stats trigger / the short-code generator
  ('rounds', 'holes_played'), ('rounds', 'differential'), ('rounds', 'dogleg_score'),
  ('rounds', 'strokes_vs_usual'), ('rounds', 'achievements'), ('rounds', 'short_code'),
  -- moderation: only the admin RPCs hide or restore content
  ('rounds', 'is_deleted'), ('rounds', 'deleted_at'), ('rounds', 'deleted_by'),
  ('rounds', 'deleted_reason'), ('rounds', 'delete_reason'), ('rounds', 'moderated_at'),
  ('rounds', 'moderated_by'), ('rounds', 'moderation_reason'), ('rounds', 'moderation_status'),
  ('comments', 'is_deleted'), ('comments', 'deleted_at'), ('comments', 'deleted_by'),
  ('comments', 'deleted_reason'), ('comments', 'delete_reason'), ('comments', 'moderated_at'),
  ('comments', 'moderated_by'), ('comments', 'moderation_reason'), ('comments', 'moderation_status')
) AS v(tbl, col)
JOIN pg_attribute a
  ON a.attrelid = to_regclass('public.' || v.tbl)
 AND a.attname = v.col
 AND a.attnum > 0
 AND NOT a.attisdropped;


-- 0a. The earlier migrations must be in place (this file relies on them).
DO $prereq$
DECLARE
  missing text[] := ARRAY[]::text[];
  item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'profiles.is_admin', 'profiles.is_banned', 'profiles.handicap_index',
    'rounds.user_id', 'rounds.is_private', 'rounds.is_deleted', 'rounds.short_code',
    'rounds.holes_declared', 'reactions.user_id', 'comments.user_id', 'comments.is_deleted',
    'follows.follower_id', 'notifications.user_id'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.' || split_part(item, '.', 1))
        AND attname = split_part(item, '.', 2) AND attnum > 0 AND NOT attisdropped
    ) THEN
      missing := missing || item;
    END IF;
  END LOOP;

  IF to_regprocedure('public.dogleg_recompute_handicap(uuid)') IS NULL THEN
    missing := missing || 'function dogleg_recompute_handicap(uuid)'::text;
  END IF;
  IF to_regprocedure('public.dogleg_index_as_of(uuid, timestamptz, timestamptz, uuid)') IS NULL THEN
    missing := missing || 'function dogleg_index_as_of(...)'::text;
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'security_hardening.sql: nothing was changed. Run database/stats_layer.sql first (then feed_algorithm.sql), then this file again. Missing: %',
      array_to_string(missing, ', ');
  END IF;
END $prereq$;


-- 0b. PREFLIGHT: a function that writes a server-only column but runs with
-- the CALLER's rights (not SECURITY DEFINER) would start failing with
-- "permission denied" after the lockdown. Stop before changing anything.
-- How it looks: per statement of each function body, a write (UPDATE,
-- INSERT INTO or MERGE INTO) to the table plus the column's name. A BEFORE
-- trigger setting NEW.column is fine (triggers are not checked against
-- column grants), so that is not flagged.
-- Escape hatch for a function you KNOW only you or the service key run (see
-- README): SET dogleg.preflight_ignore = 'function_name,other_name'; before
-- running this file.
DO $preflight$
DECLARE
  ignored text[] := string_to_array(
    replace(coalesce(current_setting('dogleg.preflight_ignore', true), ''), ' ', ''), ',');
  offenders text;
BEGIN
  WITH fn AS (
    SELECT p.oid::regprocedure::text AS sig,
           -- the function's body, lower case, without -- and /* */ comments
           -- (a BEGIN ATOMIC body has no prosrc: use the whole definition)
           regexp_replace(regexp_replace(lower(coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid))),
                          '/\*.*?\*/', ' ', 'g'), '--[^\n]*', ' ', 'g') AS src
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f', 'p')
      AND NOT p.prosecdef                     -- SECURITY DEFINER runs as owner: fine
      AND l.lanname NOT IN ('c', 'internal')
      AND p.proname <> ALL (coalesce(ignored, ARRAY[]::text[]))
  ),
  stmt AS (
    SELECT fn.sig, s FROM fn, regexp_split_to_table(fn.src, ';') AS s
  )
  SELECT string_agg(DISTINCT format('  - %s writes %s.%s', stmt.sig, pc.tbl, pc.col), E'\n')
  INTO offenders
  FROM stmt
  JOIN dogleg_protected_columns pc
    ON stmt.s ~ ('\m(update|insert\s+into|merge\s+into)\s+(only\s+)?("?public"?\s*\.\s*)?"?' || pc.tbl || '\M')
   AND stmt.s ~ ('\m' || pc.col || '\M');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'PREFLIGHT FAILED - nothing was changed.\nThese functions write columns that this file makes server-only, but they run with the caller''s rights (they are not SECURITY DEFINER), so they would start failing with "permission denied":\n%', offenders
      USING HINT = 'See "If security_hardening.sql stops with PREFLIGHT FAILED" in database/README.md.';
  END IF;
END $preflight$;


-- 0c. Is the hole still open (before this run closes it)? Decides whether the
-- clean-up in PART 8 runs. On a re-run the hole is already closed, nobody
-- could have promoted themselves since, so admins added by the owner stay.
DO $hole$
BEGIN
  PERFORM set_config('dogleg.profile_hole_was_open',
    CASE WHEN EXISTS (
      SELECT 1
      FROM dogleg_protected_columns pc
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
      CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) AS p(priv)
      WHERE pc.tbl = 'profiles'
        AND pc.col IN ('is_admin', 'is_banned', 'handicap_index')
        AND has_column_privilege(r.role_name, 'public.profiles', pc.col, p.priv)
    ) THEN 'yes' ELSE 'no' END,
    true);  -- true = only for this transaction
END $hole$;


-- 0d. Policies only work on tables with Row Level Security turned on.
-- (Not turned on here: with no policies that would block the app.)
DO $rls$
DECLARE
  off text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO off
  FROM pg_class c
  WHERE c.oid IN ('public.profiles'::regclass, 'public.rounds'::regclass,
                  'public.reactions'::regclass, 'public.comments'::regclass,
                  'public.follows'::regclass, 'public.notifications'::regclass)
    AND NOT c.relrowsecurity;
  IF off IS NOT NULL THEN
    RAISE WARNING 'Row Level Security is OFF on: %. The column lockdown still works there, but the row policies in this file have no effect until RLS is enabled (see database/README.md).', off;
    INSERT INTO dogleg_security_report (item, result)
    VALUES ('WARNING: RLS is off', off || ' (row policies have no effect there; see README)');
  END IF;
END $rls$;


-- ============================================================================
-- PART 1 — Column lockdown: profiles, rounds, comments
--   Take away "may write any column", then give back every column except the
--   protected ones. Only signed-in users (authenticated) get them back;
--   signed-out visitors (anon) never write these tables.
-- ============================================================================

DO $lockdown$
DECLARE
  t text;
  cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'rounds', 'comments'] LOOP
    -- (revoking the table-wide right also clears any older column grants,
    -- so re-running starts from a clean slate)
    EXECUTE format('REVOKE INSERT, UPDATE ON public.%I FROM PUBLIC, anon, authenticated', t);

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO cols
    FROM pg_attribute a
    WHERE a.attrelid = format('public.%I', t)::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND NOT EXISTS (SELECT 1 FROM dogleg_protected_columns pc
                      WHERE pc.tbl = t AND pc.col = a.attname);

    EXECUTE format('GRANT INSERT (%1$s), UPDATE (%1$s) ON public.%2$I TO authenticated', cols, t);

    INSERT INTO dogleg_security_report (item, result)
    SELECT 'server-only columns on ' || t,
           coalesce(string_agg(pc.col, ', ' ORDER BY pc.col), '(none)')
    FROM dogleg_protected_columns pc WHERE pc.tbl = t;
  END LOOP;
END $lockdown$;


-- ============================================================================
-- PART 1b — Second lock on is_admin / is_banned / handicap_index
--   The founder installed this trigger in production on 2026-11-20 as a
--   same-day stopgap, before this file existed. It stays as a second lock:
--   if a future "GRANT ALL ... TO authenticated" (a common tutorial line, or a
--   dashboard click) ever brings back the table-wide write right that PART 1
--   took away, a signed-in user still cannot make themselves an admin, lift a
--   ban or set their own index. Server code (SECURITY DEFINER functions, the
--   SQL editor, the service key) runs as another role and is not affected.
--   This definition is identical to the stopgap, so re-creating it changes
--   nothing in production; it is here so git matches the live database.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dogleg_guard_profile_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_admin := false; NEW.is_banned := false; NEW.handicap_index := NULL;
    ELSIF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
       OR NEW.handicap_index IS DISTINCT FROM OLD.handicap_index THEN
      RAISE EXCEPTION 'These profile fields can only be changed by Dogleg' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- A trigger function is not an API endpoint (PostgREST cannot call it).
REVOKE ALL ON FUNCTION public.dogleg_guard_profile_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dogleg_guard_profile_columns ON public.profiles;
CREATE TRIGGER trg_dogleg_guard_profile_columns BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.dogleg_guard_profile_columns();

INSERT INTO dogleg_security_report (item, result)
VALUES ('second lock on profiles', 'trigger trg_dogleg_guard_profile_columns in place');


-- ============================================================================
-- PART 2 — Helper: is this user banned?
--   Used inside the policies below. SECURITY DEFINER so it can read
--   profiles.is_banned whatever profiles' own policies say; it only answers
--   true/false (is_banned is readable on profiles anyway). anon and
--   authenticated must be able to call it, because policies run as the user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dogleg_is_banned(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_banned FROM public.profiles WHERE id = p_user_id), false)
$$;

REVOKE ALL ON FUNCTION public.dogleg_is_banned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dogleg_is_banned(uuid) TO anon, authenticated;


-- ============================================================================
-- PART 3 — RESTRICTIVE policies: own rows only, and banned users can't post
--   Checked by hand in the app (frontend/src): every insert, update and
--   delete on these tables is the user's own row. Nobody deletes or edits
--   another user's comment, reaction or follow (moderation goes through the
--   SECURITY DEFINER *_admin RPCs, which these policies don't affect).
--   (SELECT auth.uid()) instead of auth.uid(): same value, but Postgres
--   works it out once per query instead of once per row.
--   Deleting your own rows stays allowed even when banned.
-- ============================================================================

-- ---- profiles: your own row only --------------------------------------------
DROP POLICY IF EXISTS dogleg_guard_profiles_insert ON public.profiles;
CREATE POLICY dogleg_guard_profiles_insert ON public.profiles
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS dogleg_guard_profiles_update ON public.profiles;
CREATE POLICY dogleg_guard_profiles_update ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ---- rounds ------------------------------------------------------------------
DROP POLICY IF EXISTS dogleg_guard_rounds_insert ON public.rounds;
CREATE POLICY dogleg_guard_rounds_insert ON public.rounds
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_rounds_update ON public.rounds;
CREATE POLICY dogleg_guard_rounds_update ON public.rounds
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_rounds_delete ON public.rounds;
CREATE POLICY dogleg_guard_rounds_delete ON public.rounds
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---- reactions ---------------------------------------------------------------
DROP POLICY IF EXISTS dogleg_guard_reactions_insert ON public.reactions;
CREATE POLICY dogleg_guard_reactions_insert ON public.reactions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_reactions_update ON public.reactions;
CREATE POLICY dogleg_guard_reactions_update ON public.reactions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_reactions_delete ON public.reactions;
CREATE POLICY dogleg_guard_reactions_delete ON public.reactions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---- comments ----------------------------------------------------------------
DROP POLICY IF EXISTS dogleg_guard_comments_insert ON public.comments;
CREATE POLICY dogleg_guard_comments_insert ON public.comments
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_comments_update ON public.comments;
CREATE POLICY dogleg_guard_comments_update ON public.comments
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_comments_delete ON public.comments;
CREATE POLICY dogleg_guard_comments_delete ON public.comments
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---- follows (the actor is follower_id) --------------------------------------
DROP POLICY IF EXISTS dogleg_guard_follows_insert ON public.follows;
CREATE POLICY dogleg_guard_follows_insert ON public.follows
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (follower_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_follows_update ON public.follows;
CREATE POLICY dogleg_guard_follows_update ON public.follows
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (follower_id = (SELECT auth.uid()))
  WITH CHECK (follower_id = (SELECT auth.uid())
              AND NOT public.dogleg_is_banned((SELECT auth.uid())));

DROP POLICY IF EXISTS dogleg_guard_follows_delete ON public.follows;
CREATE POLICY dogleg_guard_follows_delete ON public.follows
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (follower_id = (SELECT auth.uid()));

INSERT INTO dogleg_security_report (item, result)
VALUES ('own-rows-only + no posting while banned',
        'rounds, reactions, comments, follows (and own profile row only)');


-- ============================================================================
-- PART 4 — Privacy: other people's private rounds and banned users' rounds
--   are invisible, on every read through the API (table reads, embeds, and
--   SECURITY INVOKER functions such as the feed). You always see your own.
--   SECURITY DEFINER functions skip RLS, so they filter by themselves
--   (get_user_stats, get_course_page, get_public_round below, and
--   get_feed_chronological_mixed in feed_algorithm.sql).
-- ============================================================================

DROP POLICY IF EXISTS dogleg_guard_rounds_select_privacy ON public.rounds;
CREATE POLICY dogleg_guard_rounds_select_privacy ON public.rounds
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (user_id = (SELECT auth.uid())
         OR (NOT coalesce(is_private, false) AND NOT public.dogleg_is_banned(user_id)));

INSERT INTO dogleg_security_report (item, result)
VALUES ('private rounds / banned users'' rounds', 'hidden from everyone but their owner');


-- ============================================================================
-- PART 5 — Notifications: nobody updates them from the app (the "mark as
--   read" button calls mark_notifications_checked, which writes profiles),
--   so drop the leftover UPDATE policy and the UPDATE right [SOCIAL-6].
--   Skipped, with a note in the report, if some function updates
--   notifications with the caller's rights.
-- ============================================================================

DO $notifications$
DECLARE
  writers text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO writers
  FROM pg_proc p
  JOIN pg_language l ON l.oid = p.prolang
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prokind IN ('f', 'p')
    AND NOT p.prosecdef
    AND l.lanname NOT IN ('c', 'internal')
    AND lower(coalesce(nullif(p.prosrc, ''), pg_get_functiondef(p.oid)))
        ~ '\m(update|merge\s+into)\s+(only\s+)?("?public"?\s*\.\s*)?"?notifications\M';

  IF writers IS NOT NULL THEN
    INSERT INTO dogleg_security_report (item, result)
    VALUES ('notifications UPDATE policy', 'KEPT: these functions update notifications with the caller''s rights: ' || writers);
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
  REVOKE UPDATE ON public.notifications FROM PUBLIC, anon, authenticated;
  INSERT INTO dogleg_security_report (item, result)
  VALUES ('notifications UPDATE policy', 'dropped; the app can no longer update notifications (it never did)');
END $notifications$;


-- ============================================================================
-- PART 6 — get_public_round(p_code): one public round for a share link
--   Contract C3. p_code is the short code ("K7FX9M") or the round id.
--   Returns NULL unless the round exists, is not hidden (is_deleted), not
--   private, and its author is not banned. Otherwise:
--     { "round": <the rounds row>, "author": {id, username, full_name, avatar_url},
--       "reactions": {"fire": 2, ...}  (only types that have reactions),
--       "comment_count": <int>,
--       "comments": [{id, content, created_at, author: {username, full_name, avatar_url}}] }
--   Comments: not hidden, not by banned users, oldest first, at most 50
--   (comment_count counts the same comments).
--   SECURITY DEFINER because signed-out visitors (anon) call it: it decides
--   by itself what is public, instead of relying on table policies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_round(p_code text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH found AS (
    SELECT r.*
    FROM public.rounds r
    JOIN public.profiles author ON author.id = r.user_id
    WHERE (r.short_code = p_code
           -- same as r.id::text = p_code, but able to use the primary key
           OR r.id = CASE WHEN p_code ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          THEN p_code::uuid END)
      AND NOT coalesce(r.is_deleted, false)
      AND NOT coalesce(r.is_private, false)
      AND NOT coalesce(author.is_banned, false)
    LIMIT 1
  ),
  visible_comments AS (
    SELECT c.id, c.content, c.created_at,
           cp.username, cp.full_name, cp.avatar_url
    FROM public.comments c
    JOIN found f ON f.id = c.round_id
    LEFT JOIN public.profiles cp ON cp.id = c.user_id
    WHERE NOT coalesce(c.is_deleted, false)
      AND NOT coalesce(cp.is_banned, false)
  )
  SELECT jsonb_build_object(
    'round', to_jsonb(f),
    'author', (SELECT jsonb_build_object('id', p.id, 'username', p.username,
                                         'full_name', p.full_name, 'avatar_url', p.avatar_url)
               FROM public.profiles p WHERE p.id = f.user_id),
    'reactions', coalesce((SELECT jsonb_object_agg(x.reaction_type, x.n)
                           FROM (SELECT reaction_type, count(*) AS n
                                 FROM public.reactions
                                 WHERE round_id = f.id AND reaction_type IS NOT NULL
                                 GROUP BY reaction_type) x), '{}'::jsonb),
    'comment_count', (SELECT count(*) FROM visible_comments),
    'comments', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', vc.id, 'content', vc.content, 'created_at', vc.created_at,
                             'author', jsonb_build_object('username', vc.username,
                                                          'full_name', vc.full_name,
                                                          'avatar_url', vc.avatar_url))
                             ORDER BY vc.created_at, vc.id)
                          FROM (SELECT * FROM visible_comments
                                ORDER BY created_at, id LIMIT 50) vc), '[]'::jsonb)
  )
  FROM found f
$$;

REVOKE ALL ON FUNCTION public.get_public_round(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_round(text) TO anon, authenticated;


-- ============================================================================
-- PART 7 — EXECUTE hygiene: the internal dogleg_* helpers are not part of
--   the API. Nothing in the app calls them; triggers and SECURITY DEFINER
--   functions use them as the owner, so they keep working. The app-facing
--   RPCs (get_user_stats, get_course_page, get_public_round, the feed,
--   is_admin, the *_admin RPCs) are not touched. dogleg_is_banned stays
--   callable because the policies above run it as the user.
--   (stats_layer.sql already revoked its SECURITY DEFINER helpers; this
--   covers the rest, including ones added later: re-run after adding some.)
-- ============================================================================

DO $execute$
DECLARE
  fn regprocedure;
  n int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.proname LIKE 'dogleg\_%'
      AND p.proname <> 'dogleg_is_banned'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    n := n + 1;
  END LOOP;

  INSERT INTO dogleg_security_report (item, result)
  VALUES ('internal dogleg_* functions', n || ' no longer callable from the app');
END $execute$;


-- ============================================================================
-- PART 8 — Clean up after the hole (only if it was open when this run began)
--   a) is_admin: everyone except the founder (the same account
--      admin_stats_engine.sql flags) loses the admin flag. If you had made
--      someone else an admin on purpose, add them back afterwards:
--        UPDATE public.profiles SET is_admin = true WHERE username = '...';
--   b) handicap_index: recomputed for every golfer whose stored index does
--      not match their rounds (a forged or stale value). Uses the stats
--      engine's own dogleg_recompute_handicap, like a new post would.
--   Neither touches round scores, differentials or badges of normal golfers.
-- ============================================================================

DO $cleanup$
DECLARE
  reset_names text;
  reset_n int;
  founder_ok boolean;
  rec record;
  fixed text[] := ARRAY[]::text[];
  failed text[] := ARRAY[]::text[];
  new_index numeric;
BEGIN
  IF current_setting('dogleg.profile_hole_was_open', true) IS DISTINCT FROM 'yes' THEN
    INSERT INTO dogleg_security_report (item, result)
    VALUES ('clean-up of admin flags / handicap indexes',
            'skipped: the profile columns were already locked before this run');
    RETURN;
  END IF;

  -- a) admin flags (an empty database has no founder yet, and nothing to fix)
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'markgreenfield1@gmail.com')
         OR NOT EXISTS (SELECT 1 FROM public.profiles)
  INTO founder_ok;

  WITH reset AS (
    UPDATE public.profiles p
    SET is_admin = false
    WHERE p.is_admin
      AND p.id NOT IN (SELECT u.id FROM auth.users u
                       WHERE lower(u.email) = 'markgreenfield1@gmail.com')
    RETURNING coalesce(p.username, p.id::text) AS who
  )
  SELECT count(*), string_agg(who, ', ' ORDER BY who) INTO reset_n, reset_names FROM reset;

  IF reset_n > 0 THEN
    RAISE NOTICE 'Removed the admin flag from % account(s): %', reset_n, reset_names;
  END IF;
  IF NOT founder_ok THEN
    RAISE WARNING 'The founder''s account (markgreenfield1@gmail.com) was not found, so nobody is an admin now. See "Give someone admin rights" in database/README.md.';
  END IF;
  INSERT INTO dogleg_security_report (item, result)
  VALUES ('admin flags removed (everyone but the founder)',
          CASE WHEN reset_n = 0 THEN 'none needed' ELSE reset_n || ': ' || reset_names END
          || CASE WHEN founder_ok THEN '' ELSE ' -- WARNING: founder account not found' END);

  -- b) handicap indexes that don't match the golfer's rounds
  FOR rec IN
    SELECT p.id, coalesce(p.username, p.id::text) AS who, p.handicap_index AS stored
    FROM public.profiles p
    ORDER BY p.username
  LOOP
    BEGIN
      CONTINUE WHEN rec.stored IS NOT DISTINCT FROM
        public.dogleg_index_as_of(rec.id, NULL::timestamptz, NULL::timestamptz, NULL::uuid);
      -- the same per-golfer lock the stats triggers take, so a post arriving
      -- right now can't interleave with the recompute
      PERFORM pg_advisory_xact_lock(hashtextextended('dogleg_user:' || rec.id::text, 0));
      PERFORM public.dogleg_recompute_handicap(rec.id);
      SELECT handicap_index INTO new_index FROM public.profiles WHERE id = rec.id;
      fixed := fixed || format('%s %s -> %s', rec.who,
                               coalesce(rec.stored::text, 'none'), coalesce(new_index::text, 'none'));
    EXCEPTION WHEN OTHERS THEN
      -- one golfer's odd data must not stop the security fix for everyone
      RAISE WARNING 'Could not recompute the handicap index of %: %', rec.who, SQLERRM;
      failed := failed || rec.who;
    END;
  END LOOP;

  IF cardinality(fixed) > 0 THEN
    RAISE NOTICE 'Recomputed % handicap index(es) that did not match the rounds: %',
      cardinality(fixed), array_to_string(fixed, '; ');
  END IF;
  INSERT INTO dogleg_security_report (item, result)
  VALUES ('handicap indexes recomputed (forged or stale)',
          CASE WHEN cardinality(fixed) = 0 THEN 'none needed'
               ELSE cardinality(fixed) || ': ' || array_to_string(fixed, '; ') END
          || CASE WHEN cardinality(failed) = 0 THEN ''
                  ELSE ' -- WARNING, could not recompute: ' || array_to_string(failed, ', ') END);
END $cleanup$;


-- ============================================================================
-- PART 9 — Self-check. If any of this is not true, the whole file is undone
--   (for example if some grant could not be revoked by the role running it).
-- ============================================================================

DO $selfcheck$
DECLARE
  rec record;
  problems text[] := ARRAY[]::text[];
  col text;
BEGIN
  -- the server-only columns really are server-only
  FOR rec IN
    SELECT pc.tbl, pc.col, r.role_name, p.priv
    FROM dogleg_protected_columns pc
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) AS p(priv)
    WHERE has_column_privilege(r.role_name, format('public.%I', pc.tbl), pc.col, p.priv)
  LOOP
    problems := problems || format('%s can still %s %s.%s', rec.role_name, rec.priv, rec.tbl, rec.col);
  END LOOP;

  -- ...and everything the app writes today still works
  FOR rec IN
    SELECT * FROM (VALUES
      ('profiles', 'UPDATE', ARRAY['username', 'full_name', 'bio', 'handicap', 'location',
                                   'avatar_url', 'avatar_path', 'wants_newsletter',
                                   'last_notifications_check']),
      ('profiles', 'INSERT', ARRAY['id', 'username', 'full_name', 'avatar_url', 'phone',
                                   'wants_newsletter', 'created_at']),
      ('rounds', 'INSERT', ARRAY['id', 'user_id', 'course_id', 'course_name', 'club_name', 'city',
                                 'state', 'tee_id', 'tee_data', 'played_at', 'front9', 'back9',
                                 'total_score', 'scores_by_hole', 'stats_by_hole', 'total_putts',
                                 'par', 'course_pars', 'caption', 'photo_url', 'created_at',
                                 'holes_declared']),
      ('comments', 'INSERT', ARRAY['user_id', 'round_id', 'content', 'created_at']),
      ('reactions', 'INSERT', ARRAY['user_id', 'round_id', 'reaction_type']),
      ('follows', 'INSERT', ARRAY['follower_id', 'following_id'])
    ) AS v(tbl, priv, cols)
  LOOP
    FOREACH col IN ARRAY rec.cols LOOP
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = format('public.%I', rec.tbl)::regclass
          AND attname = col AND attnum > 0 AND NOT attisdropped);
      IF NOT has_column_privilege('authenticated', format('public.%I', rec.tbl), col, rec.priv) THEN
        problems := problems || format('the app could no longer %s %s.%s', rec.priv, rec.tbl, col);
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.profiles'::regclass
                   AND tgname = 'trg_dogleg_guard_profile_columns' AND tgenabled <> 'D') THEN
    problems := problems || 'the second lock on profiles (trg_dogleg_guard_profile_columns) is missing or disabled'::text;
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_public_round(text)', 'EXECUTE') THEN
    problems := problems || 'signed-out visitors cannot call get_public_round'::text;
  END IF;
  IF NOT has_function_privilege('anon', 'public.dogleg_is_banned(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.dogleg_is_banned(uuid)', 'EXECUTE') THEN
    problems := problems || 'the policies could not call dogleg_is_banned'::text;
  END IF;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION E'security_hardening.sql self-check failed, nothing was changed:\n  - %',
      array_to_string(problems, E'\n  - ');
  END IF;

  INSERT INTO dogleg_security_report (item, result)
  VALUES ('self-check', 'passed: users can no longer write is_admin, is_banned or handicap_index');
END $selfcheck$;

COMMIT;

-- The report (the SQL editor shows the result of the last statement)
SELECT item, result FROM dogleg_security_report ORDER BY n;
