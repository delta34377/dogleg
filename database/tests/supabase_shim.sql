-- ============================================================================
-- Dogleg SQL test harness — Supabase shim
-- ============================================================================
-- Recreates the small slice of a Supabase database that our SQL depends on,
-- on a plain PostgreSQL 16 server:
--   * the API roles anon / authenticated / service_role
--   * schema auth: auth.users, auth.uid(), auth.role(), auth.jwt()
--   * Supabase's DEFAULT PRIVILEGES: every new table, sequence and function in
--     schema public is fully granted to anon, authenticated and service_role.
--     This matters: those table-wide grants are exactly what lets a signed-in
--     user write columns like profiles.is_admin today. RLS limits which ROWS
--     a role can touch; only GRANT/REVOKE limits which COLUMNS.
--   * schema tests: helpers for writing test scripts (see the bottom).
--
-- run.sh applies this first, into a brand-new database. Not for production.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. API roles (cluster-wide, so tolerate them already existing — several
--    test runs may share one server, even at the same moment)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        -- NOLOGIN + NOINHERIT, as on Supabase. service_role bypasses RLS there.
        EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT%s', r,
                       CASE WHEN r = 'service_role' THEN ' BYPASSRLS' ELSE '' END);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;  -- a concurrent run created it first; that's fine
      END;
    END IF;
    -- Let the connecting (super)user SET ROLE to it in test scripts.
    BEGIN
      EXECUTE format('GRANT %I TO %I', r, current_user);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- already a member, or a concurrent grant; superusers can SET ROLE anyway
    END;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Schema auth (owned by Supabase's auth service in production)
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Only the columns our SQL and tests use. App roles cannot read it (as on
-- Supabase); SECURITY DEFINER functions owned by postgres can.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  phone              text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now()
);
REVOKE ALL ON auth.users FROM PUBLIC;

-- These three mirror Supabase's own definitions: PostgREST stores the
-- verified JWT payload in the request.jwt.claims setting for each request.
-- (The older request.jwt.claim.* settings are still honoured, like Supabase.)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Supabase's default privileges on schema public
--    (applies to objects created from here on by this same user, i.e. by
--    mock_schema.sql and every migration the harness applies)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;


-- ============================================================================
-- 4. Schema tests — helpers for test_*.sql scripts
-- ============================================================================
-- THE PATTERN (see README.md for a full worked example):
--
--   SELECT tests.create_user('alice@example.test') AS alice \gset
--   SELECT tests.login_as(:'alice');     -- sets the JWT claims (sub, role)
--   SET ROLE authenticated;              -- now you ARE a signed-in browser
--   INSERT INTO public.rounds (...) VALUES (...);        -- RLS + grants apply
--   SELECT tests.expect_error('UPDATE ...', '42501');    -- must be refused
--   RESET ROLE;                          -- back to the superuser
--   SELECT tests.assert_eq((SELECT ...), 42, 'what this checks');
--
-- SET ROLE cannot run inside a function, so the script does it itself.
-- Any failed assertion raises an error, which stops the file (ON_ERROR_STOP)
-- and marks it FAIL in run.sh.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tests;
-- The helpers must be callable while the script is acting as anon/authenticated.
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;

-- Create a user the way the app does: an auth.users row (Supabase Auth's job)
-- plus the profiles row the browser inserts on first sign-in
-- (frontend/src/context/AuthContext.js createProfile). The username defaults
-- to the part of the email before the "@".
CREATE OR REPLACE FUNCTION tests.create_user(p_email text, p_username text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  uname text := coalesce(p_username,
                         regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9_]', '_', 'g'));
BEGIN
  INSERT INTO auth.users (email, raw_user_meta_data)
  VALUES (p_email, jsonb_build_object('username', uname))
  RETURNING id INTO new_id;

  INSERT INTO public.profiles (id, username, full_name, avatar_url, phone, wants_newsletter, created_at)
  VALUES (new_id, uname, initcap(replace(uname, '_', ' ')), NULL, NULL, false, now());

  RETURN new_id;
END;
$$;

-- Look up a test user's id by email (handy inside DO blocks, where psql
-- :variables are not substituted).
CREATE OR REPLACE FUNCTION tests.user_id(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = p_email
$$;

-- Make a user an admin the legitimate way (as the database owner).
-- (plpgsql, not sql: profiles doesn't exist yet when this file runs, and
-- only sql-language bodies are checked at creation time.)
CREATE OR REPLACE FUNCTION tests.make_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET is_admin = true WHERE id = p_user_id;
END;
$$;

-- Pretend to be a signed-in user: sets the JWT claims PostgREST would set.
-- Follow with SET ROLE authenticated in the script.
CREATE OR REPLACE FUNCTION tests.login_as(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tests.login_as: no auth.users row with id %', p_user_id;
  END IF;
  -- is_local = false: the claims last for the rest of the session (each
  -- psql statement runs in its own transaction, like each API request)
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated',
                       'email', user_email, 'aud', 'authenticated')::text,
    false);
END;
$$;

-- Pretend to be a signed-out visitor. Follow with SET ROLE anon.
CREATE OR REPLACE FUNCTION tests.login_anon()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, false);
  SELECT NULL::void;
$$;

-- Pretend to be a server holding the service_role key (bypasses RLS).
-- Follow with SET ROLE service_role.
CREATE OR REPLACE FUNCTION tests.login_service_role()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, false);
  SELECT NULL::void;
$$;

-- Forget the claims (auth.uid() becomes NULL). Pair with RESET ROLE.
CREATE OR REPLACE FUNCTION tests.logout()
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config('request.jwt.claims', '', false);
  SELECT NULL::void;
$$;

-- Run p_sql AS THE CURRENT ROLE and require it to fail with SQLSTATE
-- p_sqlstate (optionally with a message matching p_message_like, ILIKE).
-- SECURITY INVOKER on purpose: after SET ROLE authenticated the statement is
-- checked against authenticated's grants and RLS, exactly like a browser call.
-- Common codes: 42501 permission denied / RLS violation, 23514 CHECK
-- violation, 23505 unique violation, 23502 NOT NULL violation, P0001 RAISE.
CREATE OR REPLACE FUNCTION tests.expect_error(p_sql text, p_sqlstate text, p_message_like text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      RAISE EXCEPTION 'ASSERTION FAILED: expected SQLSTATE % but got % (%) from: %',
        p_sqlstate, SQLSTATE, SQLERRM, p_sql;
    END IF;
    IF p_message_like IS NOT NULL AND SQLERRM NOT ILIKE p_message_like THEN
      RAISE EXCEPTION 'ASSERTION FAILED: got SQLSTATE % as expected, but message "%" does not match "%" from: %',
        SQLSTATE, SQLERRM, p_message_like, p_sql;
    END IF;
    RETURN;  -- failed the way we wanted; its effects were rolled back
  END;
  -- Reaching here means the statement SUCCEEDED. Raising also undoes it.
  RAISE EXCEPTION 'ASSERTION FAILED: expected SQLSTATE % but the statement succeeded (as role %): %',
    p_sqlstate, current_user, p_sql;
END;
$$;

-- Run p_sql as the current role and return how many rows it touched
-- (INSERT/UPDATE/DELETE). RLS silently filters rows instead of raising, so
-- "0 rows affected" is how you prove a write was blocked by a policy.
CREATE OR REPLACE FUNCTION tests.exec_count(p_sql text)
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Insert one row EXACTLY the way the browser does through PostgREST:
--   supabase.from('rounds').insert(row).select().single()
-- Only the keys present in p_row become INSERT columns (so column-level
-- grants are checked for exactly those, and every other column gets its
-- DEFAULT), JSON values are converted to the column types the way PostgREST
-- converts them, RLS applies, and the inserted row (after triggers) comes
-- back as jsonb. Runs as the current role.
--   SELECT tests.api_insert('public.rounds', jsonb_build_object('user_id', :'alice', ...)) ->> 'id' AS round_id \gset
CREATE OR REPLACE FUNCTION tests.api_insert(p_table regclass, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  cols text;
  result jsonb;
BEGIN
  SELECT string_agg(quote_ident(k), ', ') INTO cols FROM jsonb_object_keys(p_row) AS k;
  IF cols IS NULL THEN
    RAISE EXCEPTION 'tests.api_insert: empty row';
  END IF;
  EXECUTE format(
    'INSERT INTO %s AS _r (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) RETURNING to_jsonb(_r)',
    p_table, cols, cols, p_table)
  INTO result USING p_row;
  RETURN result;
END;
$$;

-- Update rows the way the browser does: supabase.from(t).update(changes).eq(...)
-- Only the keys in p_changes are SET (column grants checked for exactly
-- those); p_where is the filter, e.g. format('id = %L', :'alice').
-- Returns the number of rows changed: RLS silently skips rows you may not
-- touch, so 0 means "blocked by a policy" (a column REVOKE raises 42501).
CREATE OR REPLACE FUNCTION tests.api_update(p_table regclass, p_changes jsonb, p_where text)
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  sets text;
  n bigint;
BEGIN
  -- col = (SELECT col FROM jsonb_populate_record(...)) per changed column:
  -- converts the JSON value to the column's type without adding names that
  -- could clash with columns used in p_where
  SELECT string_agg(format('%1$I = (SELECT %1$I FROM jsonb_populate_record(NULL::%2$s, $1))', k, p_table), ', ')
  INTO sets FROM jsonb_object_keys(p_changes) AS k;
  IF sets IS NULL THEN
    RAISE EXCEPTION 'tests.api_update: no changes';
  END IF;
  EXECUTE format('UPDATE %s SET %s WHERE %s', p_table, sets, p_where)
  USING p_changes;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- How many rows does this SELECT return for the current role?
CREATE OR REPLACE FUNCTION tests.query_count(p_sql text)
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS q' INTO n;
  RETURN n;
END;
$$;

-- ---- assertions: each raises 'ASSERTION FAILED: <msg>' when it fails ----

CREATE OR REPLACE FUNCTION tests.assert_true(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN  -- NULL counts as a failure
    RAISE EXCEPTION 'ASSERTION FAILED: % (condition was %)', p_msg, coalesce(p_cond::text, 'NULL');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tests.assert_false(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cond IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % (condition was %)', p_msg, coalesce(p_cond::text, 'NULL');
  END IF;
END;
$$;

-- NULL-safe equality. "anycompatible" lets you compare e.g. a bigint count
-- with an integer literal, or numeric with integer.
CREATE OR REPLACE FUNCTION tests.assert_eq(p_actual anycompatible, p_expected anycompatible, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % (expected %, got %)',
      p_msg, coalesce(p_expected::text, 'NULL'), coalesce(p_actual::text, 'NULL');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tests.assert_null(p_value anyelement, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_value IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % (expected NULL, got %)', p_msg, p_value::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION tests.assert_not_null(p_value anyelement, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % (expected a value, got NULL)', p_msg;
  END IF;
END;
$$;

-- A ready-made course to post rounds against: one club, one course
-- (par 72: 4,4,3,5,4,4,3,5,4 twice; stroke index 1-18) and one tee
-- "<course_id>-white" rated 71.5 / slope 130 (front nine 35.8/128,
-- back nine 35.7/132). p_num_holes = 9 makes a nine-hole course: the back
-- nine pars/stroke indexes are empty and only front-nine ratings exist.
CREATE OR REPLACE FUNCTION tests.create_course(p_course_id text DEFAULT NULL, p_num_holes integer DEFAULT 18)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid text := coalesce(p_course_id, 'course-' || substr(md5(random()::text), 1, 8));
  pars text[] := ARRAY['4','4','3','5','4','4','3','5','4','4','4','3','5','4','4','3','5','4'];
  sidx text[] := ARRAY['7','3','15','1','11','5','17','9','13','8','4','16','2','12','6','18','10','14'];
BEGIN
  IF p_num_holes = 9 THEN
    pars := pars[1:9] || ARRAY[NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL]::text[];
    sidx := ARRAY['4','2','8','1','6','3','9','5','7', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL]::text[];
  END IF;

  INSERT INTO public.clubs (club_id, club_name, city, state, country, postal_code)
  VALUES ('club-' || cid, 'Test Club ' || cid, 'Testville', 'TX', 'USA', '75001');

  INSERT INTO public.courses (course_id, club_id, course_name, num_holes, pars, handicaps, total_par)
  VALUES (cid, 'club-' || cid, 'Test Course ' || cid, p_num_holes, pars, sidx,
          CASE WHEN p_num_holes = 9 THEN 36 ELSE 72 END);

  INSERT INTO public.tees (tee_id, course_id, tee_name, tee_color, slope, course_rating,
                           slope_front9, cr_front9, slope_back9, cr_back9,
                           measure_unit, total_length)
  VALUES (cid || '-white', cid, 'White', 'White',
          CASE WHEN p_num_holes = 9 THEN NULL ELSE 130 END,
          CASE WHEN p_num_holes = 9 THEN NULL ELSE 71.5 END,
          128, 35.8,
          CASE WHEN p_num_holes = 9 THEN NULL ELSE 132 END,
          CASE WHEN p_num_holes = 9 THEN NULL ELSE 35.7 END,
          'yards', CASE WHEN p_num_holes = 9 THEN 3100 ELSE 6300 END);

  RETURN cid;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;
