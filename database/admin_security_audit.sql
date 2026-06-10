-- ============================================================================
-- Dogleg — Admin security audit & hardening
-- ============================================================================
-- WHY THIS FILE EXISTS
-- The app only hides the admin UI in the browser (an email check in React).
-- That stops nothing: any logged-in user can open the browser console and call
-- your admin RPCs directly with their own session, e.g.
--
--     await supabase.rpc('get_all_users_admin', { ... })   // every user's email
--     await supabase.rpc('delete_round_admin', { p_round_id: '<any id>' })
--
-- The ONLY thing that actually stops that is server-side enforcement:
--   (a) RLS policies on the tables, and/or
--   (b) an admin check INSIDE each SECURITY DEFINER function.
--
-- Run PART 1 first to see what you currently have. Then use PART 2 to fix any
-- gaps. PART 1 is read-only and safe. PART 2 changes permissions — read each
-- block before running it.
--
-- How to run: Supabase Dashboard -> SQL Editor -> paste a section -> Run.
-- ============================================================================


-- ============================================================================
-- PART 1 — VERIFY (read-only; safe to run anytime)
-- ============================================================================

-- 1a. Is Row Level Security actually ENABLED on the sensitive tables?
--     relrowsecurity = true  means RLS is on. If false, the table is wide open
--     to any authenticated user regardless of any policies below.
SELECT c.relname                AS table_name,
       c.relrowsecurity         AS rls_enabled,
       c.relforcerowsecurity    AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'rounds', 'comments', 'profiles', 'app_settings',
    'follows', 'reactions', 'moderation_log'
  )
ORDER BY c.relname;


-- 1b. What RLS policies exist, and what do they require?
--     Look especially at app_settings (feed algorithm) and any write policies
--     (cmd = INSERT/UPDATE/DELETE) — they should require an admin check, not
--     just "authenticated".
SELECT tablename,
       policyname,
       cmd,                 -- SELECT / INSERT / UPDATE / DELETE / ALL
       roles,
       qual        AS using_expression,      -- row visibility (read/update/delete)
       with_check  AS with_check_expression  -- allowed new rows (insert/update)
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- 1c. Show the full definition of every admin function, and whether it runs as
--     SECURITY DEFINER (runs with the owner's rights, bypassing RLS — these
--     MUST contain their own admin check). Read each `definition` and confirm
--     it rejects non-admins (look for something like
--     `auth.jwt() ->> 'email'` or `is_admin()` near the top).
SELECT p.proname                                        AS function_name,
       pg_get_function_identity_arguments(p.oid)        AS arguments,
       p.prosecdef                                      AS security_definer,
       pg_get_functiondef(p.oid)                        AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE '%admin%'
ORDER BY p.proname;

-- If a function you expect is missing from 1c, broaden the filter, e.g.
-- replace the LIKE line with:  AND p.proname IN
--   ('get_all_users_admin','get_all_rounds_admin','get_all_comments_admin',
--    'delete_round_admin','delete_comment_admin','delete_user_content_admin',
--    'toggle_user_ban_admin','get_dashboard_overview')


-- ============================================================================
-- PART 2 — HARDEN (review each block, then run)
-- ============================================================================
-- These are templates. The is_admin() helper and the app_settings policies are
-- safe to apply as-is. The RPC guard (2c) is a PATTERN you must paste into your
-- existing function bodies — this file does not have those bodies, so it can't
-- rewrite them for you.

-- ----------------------------------------------------------------------------
-- 2a. One reusable admin check, driven by the signed-in user's JWT email.
--     Keep this email in sync with frontend/src/utils/admin.js.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') = 'markgreenfield1@gmail.com';
$$;


-- ----------------------------------------------------------------------------
-- 2b. Lock down app_settings (the global feed-algorithm row).
--     Everyone signed in may READ it (the feed needs it); only admins may WRITE.
--     Without this, any user can change the feed algorithm for the whole app.
-- ----------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write
  ON public.app_settings
  FOR ALL                       -- INSERT / UPDATE / DELETE
  TO authenticated
  USING (public.is_admin())     -- which rows an admin may update/delete
  WITH CHECK (public.is_admin());  -- rows an admin may insert/update


-- ----------------------------------------------------------------------------
-- 2c. PATTERN — add an admin check to each admin SECURITY DEFINER function.
--     Copy your existing CREATE OR REPLACE FUNCTION for each admin RPC from the
--     PART 1c output, then insert the guard as the FIRST statement in the body.
--     Repeat for: get_all_users_admin, get_all_rounds_admin,
--     get_all_comments_admin, delete_round_admin, delete_comment_admin,
--     delete_user_content_admin, toggle_user_ban_admin, get_dashboard_overview.
--
--     Example shape (replace the signature/body with your real one):
--
--     CREATE OR REPLACE FUNCTION public.delete_round_admin(p_round_id uuid)
--     RETURNS void
--     LANGUAGE plpgsql
--     SECURITY DEFINER
--     SET search_path = public
--     AS $$
--     BEGIN
--       IF NOT public.is_admin() THEN
--         RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
--       END IF;
--
--       -- ... your existing function body ...
--     END;
--     $$;
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 2d. After hardening, confirm a NON-admin is blocked.
--     Easiest check: log into the app as a normal (non-admin) account, open the
--     browser console on the site, and run:
--
--       await supabase.rpc('get_all_users_admin')        // expect an error / no rows
--       await supabase.from('app_settings')
--             .update({ value: {} }).eq('key', 'feed')    // expect an error / 0 rows
--
--     Both should now fail. As the admin account, both should still work.
-- ----------------------------------------------------------------------------
