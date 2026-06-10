-- ============================================================================
-- Dogleg — Admin security audit
-- ============================================================================
-- Audited: 2026-06-10
--
-- CONCLUSION: No exploitable server-side admin hole was found.
--   * Every *_admin function is SECURITY DEFINER and rejects non-admins with
--     `IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access
--     required'; END IF;` as its first statement. Verified for:
--       ban_user_admin, toggle_user_ban_admin,
--       delete_round_admin, delete_comment_admin, delete_user_content_admin,
--       get_all_users_admin, get_all_rounds_admin, get_all_comments_admin,
--       count_all_users_admin, count_all_rounds_admin, count_all_comments_admin
--     (get_all_users_admin also builds dynamic SQL, but the sort column/order
--     are whitelisted via CASE and the search term is a bound parameter — safe.)
--   * app_settings has RLS ENABLED with: public SELECT, and INSERT/UPDATE
--     restricted to admins (is_admin(auth.uid())). A normal user cannot change
--     the global feed algorithm.
--
-- The browser-side gating (frontend/src/utils/admin.js + <AdminGate>) is
-- therefore defense-in-depth only, which is correct.
--
-- ----------------------------------------------------------------------------
-- OPEN ITEM (verified 2026-06-10: profiles.is_admin = TRUE for the admin
-- account, so both definitions currently agree — no action required) —
-- two different definitions of "admin" exist (reconcile to avoid a latent
-- footgun if either side ever changes):
--   * is_admin()        -> auth.jwt() ->> 'email' = 'markgreenfield1@gmail.com'
--                          (used by all the *_admin RPCs)
--   * is_admin(uid)     -> profiles.is_admin column for that uid
--                          (used by the app_settings RLS policies)
-- These can disagree. For the admin account BOTH must be true: the RPCs work
-- off the JWT email, but saving feed settings works off the profiles.is_admin
-- column. Confirm the column is set (PART 2), and ideally standardize on one
-- definition.
-- ============================================================================


-- ============================================================================
-- PART 1 — Re-verify anytime (read-only; safe)
-- ============================================================================

-- 1a. Is RLS enabled on the sensitive tables? (relrowsecurity = true)
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('rounds','comments','profiles','app_settings',
                    'follows','reactions','moderation_log')
ORDER BY c.relname;

-- 1b. What RLS policies exist, and what do they require?
SELECT tablename, policyname, cmd, roles,
       qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 1c. Full definition of every admin function + whether it is SECURITY DEFINER.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE '%admin%'
ORDER BY p.proname;


-- ============================================================================
-- PART 2 — Reconcile the two is_admin definitions
-- ============================================================================

-- 2a. Confirm the admin account's profiles.is_admin column is set. The
--     app_settings write policies depend on it; if it is not TRUE for the admin,
--     saving feed settings fails with "Error saving settings: ...".
SELECT p.id, au.email, p.is_admin
FROM profiles p
JOIN auth.users au ON au.id = p.id
WHERE au.email = 'markgreenfield1@gmail.com' OR p.is_admin = TRUE;

-- 2b. If the admin row shows is_admin = false / null, set it:
--     UPDATE profiles SET is_admin = TRUE WHERE id = '<admin uuid from 2a>';

-- 2c. OPTIONAL consolidation — standardize on the profiles.is_admin column so
--     "admin" has a single source of truth and you can add admins without
--     hardcoding an email. ORDER MATTERS: make sure 2a/2b show is_admin = TRUE
--     for yourself FIRST, or this will lock you out of every admin RPC.
--
--     CREATE OR REPLACE FUNCTION public.is_admin()
--     RETURNS boolean
--     LANGUAGE sql
--     STABLE
--     SECURITY DEFINER
--     SET search_path = public, pg_temp
--     AS $$
--       SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), FALSE);
--     $$;
--
--     (After this, both the RPCs and the app_settings policies use the column,
--     and you can drop the hardcoded email. The frontend email check in
--     utils/admin.js remains a UI hint only — not a security boundary.)


-- ============================================================================
-- PART 3 — Lower-priority hardening (optional)
-- ============================================================================
-- Supabase's linter flags SECURITY DEFINER functions without a pinned
-- search_path ("Function Search Path Mutable"). Low risk here since they call
-- schema-qualified auth.jwt(), but adding `SET search_path = public, pg_temp`
-- to each SECURITY DEFINER admin function is good hygiene.
