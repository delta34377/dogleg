# Dogleg SQL test harness

A throwaway local PostgreSQL 16 database that looks enough like production
Supabase to try `database/*.sql` **before** anyone pastes it into the Supabase
SQL editor. It catches syntax errors, files that are not safe to re-run, and,
most importantly, security mistakes: it has Supabase's roles (`anon`,
`authenticated`), its `auth.uid()`, and its table-wide default grants, so a
test can act as a signed-in user and check what that user can and cannot do.

It is a model, not a copy. The real base schema and RLS policies are not in
git. Read [Known differences from production](#known-differences-from-production)
before trusting a green run for anything that depends on them.

| File | What it is |
|---|---|
| `start_local_pg.sh` | Starts (and on first use creates) the local test server on port 54329. Safe to run repeatedly. |
| `run.sh` | Runs the whole suite and prints PASS/FAIL per file. |
| `supabase_shim.sql` | Supabase roles, `auth.users`, `auth.uid()/role()/jwt()`, default grants, and the `tests.*` helpers. |
| `mock_schema.sql` | Our reconstruction of the production tables, triggers, RLS policies and the RPCs that are not in git. |
| `apply_order.txt` | The real migrations, in the order they are applied (same order as in production). |
| `test_*.sql` | The tests. They run in sorted order: `test_00_smoke.sql`, `test_10_...`, ... |

## Running it locally

```bash
database/tests/start_local_pg.sh   # once per machine boot; prints DATABASE_URL
database/tests/run.sh              # the whole suite, about 2 seconds
database/tests/run.sh smoke        # only test files whose name contains "smoke"
```

`run.sh` starts the server itself if `DATABASE_URL` is not set and nothing is
listening on port 54329. You need PostgreSQL 16: on Ubuntu,
`apt-get install postgresql-16`; on a Mac, `brew install postgresql@16`. The
script looks in `/usr/lib/postgresql/16/bin`, then for `pg_config`, then on
`PATH`. Set `PG_BIN` to point it somewhere else. The data lives in
`$TMPDIR/dogleg-pg-harness`, or in `PGHARNESS_DIR`, which may be a symlink.
When the script runs as root, the server runs as the `postgres` OS user, and
that user must be able to reach the real data folder, so keep it under `/tmp`.

What `run.sh` does, in a new database with a unique name (so parallel runs
never collide):

1. applies `supabase_shim.sql`, then `mock_schema.sql`;
2. applies every file in `apply_order.txt`;
3. applies those files **again**. Each migration must be safe to re-run,
   because the founder may paste one twice. Skip this step with `IDEMPOTENCY_CHECK=0`;
4. runs each `test_*.sql` in **its own copy** of that migrated database, so
   tests never see each other's data;
5. drops everything, prints a summary, and exits non-zero if anything failed.

Every file runs with `psql -X -q -v ON_ERROR_STOP=1`. The first error stops
that file and marks it FAIL, and the failing `file:line` and message are printed.

| Variable | Effect |
|---|---|
| `DATABASE_URL` | Admin connection. Default `postgres://postgres@localhost:54329/postgres`. Must be a superuser. |
| `KEEP_DB=1` | Keep the databases and print their URLs, so you can inspect them with `psql <url>`. |
| `VERBOSE=1` | Show all output, including NOTICEs and query results. |
| `MOCK_SCORES_TYPE=jsonb` | Make `rounds.scores_by_hole` and `course_pars` `jsonb` instead of `integer[]`. |
| `MOCK_PLAYED_AT_TYPE=date` | Make `rounds.played_at` a `date` (or `timestamp`) instead of `timestamptz`. |

Production's real types for these columns are unknown. Before shipping SQL
that reads them, run the suite in each variant:

```bash
for s in 'integer[]' jsonb; do for p in timestamptz date timestamp; do
  MOCK_SCORES_TYPE=$s MOCK_PLAYED_AT_TYPE=$p database/tests/run.sh || echo "FAILED: $s / $p"
done; done
```

## Running it in GitHub Actions

Only the `psql` client is needed, and it is preinstalled on `ubuntu-latest`.
Here is an example job. It is not committed, because `.github/` is outside
this folder:

```yaml
name: sql-tests
on: [push, pull_request]
jobs:
  sql:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - run: database/tests/run.sh
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
      - run: database/tests/run.sh
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
          MOCK_SCORES_TYPE: jsonb
          MOCK_PLAYED_AT_TYPE: date
```

## Adding a migration

Put the file in `database/` and add its repo-relative path to
`apply_order.txt`, in the position the founder will run it. From then on every
test runs against a database that has it applied twice.

## Writing a test

A test is a plain SQL script named `test_NN_topic.sql`. You act as a user by
setting the JWT claims and switching role, just as PostgREST does for each
browser request:

```sql
SELECT tests.login_as(:'alice');   -- sets request.jwt.claims (sub, role, email)
SET ROLE authenticated;            -- from here on, grants and RLS apply
...                                -- what Alice's browser could do
RESET ROLE;                        -- back to the all-powerful owner
SELECT tests.logout();
```

`SET ROLE` cannot run inside a function, so the script does it itself. For a
signed-out visitor use `tests.login_anon()` with `SET ROLE anon`. For a
server holding the service key use `tests.login_service_role()` with
`SET ROLE service_role`.

### Worked example

```sql
-- test_30_comments.sql — only the author can delete a comment
SELECT tests.create_user('alice@example.test') AS alice \gset
SELECT tests.create_user('bob@example.test')   AS bob   \gset
SELECT tests.create_course('c1') AS course \gset

-- Alice posts a round and comments on it (as the browser would)
SELECT tests.login_as(:'alice');
SET ROLE authenticated;
SELECT tests.api_insert('public.rounds', jsonb_build_object(
         'user_id', :'alice', 'course_id', :'course', 'total_score', 90,
         'played_at', '2026-08-01T00:00:00')) ->> 'id' AS round_id \gset
SELECT tests.api_insert('public.comments', jsonb_build_object(
         'user_id', :'alice', 'round_id', :'round_id', 'content', 'Great day')) ->> 'id' AS comment_id \gset
RESET ROLE;

-- Bob tries to delete it: RLS doesn't raise an error, it just matches 0 rows
SELECT tests.login_as(:'bob');
SET ROLE authenticated;
SELECT tests.assert_eq(
  tests.exec_count(format('DELETE FROM public.comments WHERE id = %L', :'comment_id')), 0,
  'Bob cannot delete Alice''s comment');
-- ...and he cannot post a comment pretending to be Alice
SELECT tests.expect_error(
  format($q$INSERT INTO public.comments (user_id, round_id, content) VALUES (%L, %L, 'fake')$q$,
         :'alice', :'round_id'),
  '42501');
RESET ROLE;

-- Check the real state as the database owner
SELECT tests.assert_eq((SELECT count(*) FROM public.comments WHERE id = :'comment_id'), 1,
                       'the comment is still there');
```

`test_00_smoke.sql` is a longer example. It posts rounds through the stats
trigger, uses the feed, reactions and notifications, and documents the
current `is_admin` hole.

### Helpers (schema `tests`)

| Helper | Use |
|---|---|
| `tests.create_user(email [, username])` → uuid | `auth.users` row plus the `profiles` row the app creates on first sign-in. The username defaults to the part of the email before `@`. |
| `tests.user_id(email)` → uuid | Look up a test user, for example inside a `DO` block. |
| `tests.make_admin(uuid)` | Set `profiles.is_admin` the legitimate way, as the owner. |
| `tests.create_course([course_id [, num_holes]])` → course_id | A club, a par-72 course (stroke index 1-18) and the tee `<course_id>-white`, rated 71.5/130 (front nine 35.8/128, back nine 35.7/132). With `num_holes = 9`, only the front nine has pars and ratings. |
| `tests.login_as(uuid)` / `login_anon()` / `login_service_role()` / `logout()` | Set or clear `request.jwt.claims`. |
| `tests.api_insert(table, row_jsonb)` → jsonb | Insert exactly as `supabase.from(t).insert(row).select().single()` does. Only the keys you pass become columns, so column grants are checked for exactly those. Returns the stored row after triggers. |
| `tests.api_update(table, changes_jsonb, where_sql)` → bigint | `supabase.from(t).update(changes).eq(...)`. Returns rows changed: 0 means RLS filtered the rows out. |
| `tests.expect_error(sql, sqlstate [, message_like])` | Runs `sql` as the **current** role and requires it to fail with that SQLSTATE (and an `ILIKE` message match, if given). |
| `tests.exec_count(sql)` → bigint | Rows touched by an INSERT, UPDATE or DELETE run as the current role. |
| `tests.query_count(sql)` → bigint | Rows a SELECT returns for the current role. |
| `tests.assert_true / assert_false (cond, msg)` | NULL counts as a failure. |
| `tests.assert_eq(actual, expected, msg)` | NULL-safe. Compares across numeric types, so `count(*)` can be checked against `3`. |
| `tests.assert_null / assert_not_null (value, msg)` | |

Useful SQLSTATEs:

| SQLSTATE | Meaning |
|---|---|
| `42501` | Permission denied, or a new row violates an RLS policy. |
| `23514` | CHECK violation. |
| `23505` | Unique violation. |
| `23502` | NOT NULL violation. |
| `P0001` | Plain `RAISE EXCEPTION`, such as "Admin access required". |
| `PGRST204` | Not a SQLSTATE. It is PostgREST's "unknown column" error. Here an unknown column raises `42703`. |

### Tips and gotchas

- **psql variables are not substituted inside quotes or `$$` bodies.** Build
  SQL text with `format('... %L', :'alice')`, or call `tests.user_id('alice@...')`
  inside `DO` blocks. Capture values with `SELECT ... AS name \gset`.
- **RLS filters, it doesn't raise.** A blocked UPDATE or DELETE affects 0 rows
  with no error. Check `exec_count` or `api_update`. Only INSERTs (WITH CHECK)
  and missing GRANTs raise `42501`.
- **Assert the true state after `RESET ROLE`.** As the owner you see every
  row. As a user you see what RLS shows that user, which is useful too.
- **Each statement autocommits**, like one API request each. Put rounds that
  must be in order in separate statements.
- **Re-running a migration inside a test:** `\ir ../stats_layer.sql`. The path
  is relative to the test file.
- A `WARNING` (for example the stats trigger's "dogleg_round_before_insert
  failed") does not fail a file, but `run.sh` counts warnings next to PASS.
  Run with `VERBOSE=1` to read them.
- **Documenting a known hole:** label the assertion `VULNERABLE TODAY: ...`,
  as in section 4 of `test_00_smoke.sql`, so the fix's author knows to flip it
  to an `expect_error`.

## Known differences from production

Everything marked `UNCERTAIN` in `mock_schema.sql` is a guess. Where
production is unknown, the mock deliberately takes the **riskier** plausible
choice, so SQL that passes here should also be safe on a stricter setup.

1. **The base schema is reconstructed**, from the frontend's queries, the
   import script, `docs/` and what `database/*.sql` reads. Production may have
   other columns, constraints, indexes, triggers or policies. Notable guesses:
   - `rounds`: `played_at timestamptz` (variants available), `scores_by_hole`
     and `course_pars integer[]` (variant `jsonb`), `tee_data jsonb`, no FK
     from `course_id`, `holes_played integer DEFAULT 18` already present.
   - `courses.pars` and `handicaps` are `text[]` ("pars come as strings").
     Tee ratings are `numeric`.
   - `profiles.username` is UNIQUE (case-sensitive) and `profiles.handicap` is
     `numeric`. `profiles.is_admin` exists before the migrations, as
     `admin_security_audit.sql` shows it did. `handicap_index` does not, because
     `stats_layer.sql` adds it.
   - FKs from reactions, comments and notifications to rounds use `ON DELETE
     CASCADE`. `follows` has UNIQUE(follower_id, following_id). `reactions` has
     no unique constraint.
   - The shape of nine-hole course data in `courses`/`tees` is unknown
     (STATS-6). Adjust the row from `tests.create_course(..., 9)` in your test
     to the shape you want to cover.
2. **RLS policies are modelled on the Supabase tutorial.** Everything is
   readable by everyone, including private and soft-deleted rounds, and each
   user can insert, update or delete their own rows. That includes a rounds
   UPDATE policy, which may not exist in production (ENTRY-4). Notifications
   have exactly the policies `notifications_hardening.sql` cleans up, and
   app_settings writes are admin-only. Policy **names** are guesses, so SQL that
   `DROP POLICY`s production policies by name proves little here. Prefer
   GRANT/REVOKE, which do not depend on names.
3. **Triggers and RPCs that are not in git are stubs.** The short-code
   generator is modelled as a BEFORE INSERT trigger that runs with the
   caller's rights. If production uses an AFTER INSERT UPDATE instead,
   column REVOKEs on `short_code` would break inserts there, and only there.
   The original `create_notification()` runs with the caller's rights.
   `update_follow_counts()` is SECURITY DEFINER. `mark_notifications_checked()`
   is modelled as SECURITY INVOKER, so it needs UPDATE on
   `profiles.last_notifications_check`. The admin RPCs (`get_all_*_admin`,
   `delete_*_admin`, `toggle_user_ban_admin`), `get_my_rounds_with_everything`
   and `search_golf_courses` take their **signatures from the frontend's
   `.rpc()` calls, and their bodies are guesses**. `is_admin(uuid)`'s parameter
   name is unknown. Not modelled at all: `ban_user_admin`, `count_all_*_admin`
   and the analytics RPCs.
   **Never reference a not-in-git function by signature in production SQL**
   (REVOKE, ALTER, or CREATE OR REPLACE, which cannot rename parameters)
   without checking its real signature there first. Such a statement would
   pass here and abort the whole migration in production.
4. **Owner privileges.** The harness applies everything as a real superuser.
   In Supabase the SQL editor's `postgres` role is *not* a superuser, though
   it does bypass RLS as table owner. SQL that needs superuser powers
   (event triggers, `ALTER SYSTEM`, changing objects in `auth` or `storage`)
   passes here and fails there.
5. **No PostgREST, Auth or Storage servers.** `tests.api_insert/api_update`
   imitate PostgREST's column handling, but PostgREST's error codes (`PGRST...`),
   `return=representation` details and schema cache do not exist here. There is
   no `storage` schema, so bucket policies are untested, and there are no
   Supabase Auth triggers. JWT claims are set per session rather than per
   transaction.
6. **Server settings.** TimeZone is UTC, like Supabase. The collation is `C`,
   so text ordering and `lower()` on non-ASCII text may differ. `fsync` is off.
7. **Data volume.** Tests run on a handful of rows, so performance problems
   (STATS-8, SOCIAL-11) do not show up here.

### Before pasting a migration into production

The assumptions that matter for your change can be checked read-only in the
Supabase SQL editor:

```sql
-- column types the harness had to guess
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name in ('rounds','profiles','courses','tees')
order by table_name, ordinal_position;
-- RLS policies (compare with mock_schema.sql section 7)
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' order by tablename, cmd;
-- triggers on rounds/profiles, and whether each runs as definer
select c.relname, t.tgname, p.proname, p.prosecdef
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and c.relname in ('rounds','profiles','reactions','comments','follows');
-- real signatures of functions that are not in git
select oid::regprocedure, prosecdef from pg_proc
where pronamespace = 'public'::regnamespace
  and (proname like '%admin%' or proname in ('mark_notifications_checked', 'get_my_rounds_with_everything'));
```
