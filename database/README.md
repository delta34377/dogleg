# Dogleg database files

The app has no server of its own. The browser talks straight to Supabase with
the public "anon" key plus the signed-in user's login token. So the database
itself decides what each user may read and write: its **grants** (which
columns a role may write), its **row level security policies** (which rows),
and its **functions** (RPCs). The files in this folder change those things.

You apply them **by hand**: Supabase dashboard → **SQL Editor** → **New
query** → paste the **whole** file → **Run**. Each file for this release
(`stats_layer.sql`, `feed_algorithm.sql`, `security_hardening.sql`, and the
repair/backfill files) runs as one transaction: if anything fails, nothing
changes, and you can fix the problem and run it again.

## The files

| File | What it is | When to run it |
|---|---|---|
| `stats_layer.sql` | The stats engine: score differentials, handicap index, Dogleg Score, badges, score limits, and the Stats tab / course page RPCs. | Run for this release. Safe to re-run; never rewrites old rounds. |
| `feed_algorithm.sql` | The feed RPCs. The live one is `get_feed_chronological_mixed`. | Run for this release (it now hides private rounds and banned users). Safe to re-run. |
| `security_hardening.sql` | Closes the "make yourself admin" hole and the other security gaps below. | Run for this release, **after** the two above. Safe to re-run. Re-run it after adding a column (see [The rule for new columns](#the-rule-for-new-columns)). |
| `repair_nine_hole_totals.sql` | Optional one-time repair: finds nine-hole rounds that were scored as 18 holes and lets you fix them one by one. Changes nothing until you call its fix function. | Optional, after the three above. Read its header. |
| `stats_backfill.sql` | **Rewrites every user's history**: recomputes every round's stats and badges. | Only deliberately (read its warning). Not part of this release. |
| `notifications_hardening.sql` | July 2026 fix for forged notifications. | Already applied. Safe to re-run. |
| `admin_stats_engine.sql` | The admin "Stats Engine" panel RPCs, and `is_admin()`. | Already applied. Safe to re-run. |
| `admin_security_audit.sql` | Read-only diagnostic queries from the June 2026 audit. | Any time; changes nothing. |
| `tests/` | A local test database that imitates Supabase, used to test these files before they go anywhere near production. See `tests/README.md`. | Developers only. |

## Run order for this release

Run these **before** merging the matching app changes (the new app sends
`holes_declared` and uses `get_public_round`):

1. `stats_layer.sql`
2. `feed_algorithm.sql`
3. `security_hardening.sql`
4. optional: `repair_nine_hole_totals.sql`

Then merge the frontend.

`security_hardening.sql` refuses to start if step 1 is missing, and tells you
so. Before you start, it is wise to look at **Database → Backups** in the
dashboard and note the time.

## What `security_hardening.sql` does

1. **Nobody can make themselves an admin any more.** Until now any signed-in
   user could write *every* column of their own `profiles` row, including
   `is_admin` (which `is_admin()` trusts), `is_banned` and `handicap_index`.
   Now the app may write every profile column **except** `is_admin`,
   `is_banned`, `handicap_index`, `follower_count` and `following_count` (and
   `banned_at`, `banned_by`, `ban_reason` if those exist). The stats engine and
   the admin functions still can, because they run as the database owner.
2. **The server-computed round columns are server-only**: `holes_played`,
   `differential`, `dogleg_score`, `strokes_vs_usual`, `achievements`,
   `short_code`, and `is_deleted` (also `comments.is_deleted`), so nobody can
   forge stats or un-hide something a moderator hid. Every other round column,
   including `id` and `holes_declared`, stays writable.
3. **Only your own rows, and banned users can't post.** For rounds, reactions,
   comments and follows the database now insists that you write as yourself
   and that you are not banned, whatever other policies exist. Deleting your
   own things still works when banned. Also: your profile row only.
4. **Privacy.** Other people's private rounds and rounds by banned users are
   hidden everywhere (table reads, the feed, share links). You always see your
   own.
5. **Notifications** can no longer be edited through the API (the app never
   did; a leftover policy allowed it).
6. **`get_public_round(code)`**: the one function signed-out visitors use to
   open a shared round link. It returns only a public round.
7. The internal `dogleg_*` stats helpers can no longer be called from the app.
8. **Clean-up, first run only** (while the hole is still open): every admin
   flag except yours (the account with `markgreenfield1@gmail.com`) is
   removed, and any handicap index that doesn't match the golfer's rounds is
   recomputed. If you had made someone else an admin on purpose, add them back
   afterwards (see [Admin rights](#admin-rights)). Later re-runs leave admins
   alone.

When it finishes, the SQL editor shows a small report table: which columns are
now server-only, which accounts lost the admin flag, which handicap indexes
were recomputed, and "self-check passed".

## How to check it worked

Paste each of these into a new query. All are read-only.

```sql
-- 1. Must return 0 rows: no app role may write a protected column
select r as role, c as column_name, p as privilege
from unnest(array['anon','authenticated']) r,
     unnest(array['is_admin','is_banned','handicap_index']) c,
     unnest(array['INSERT','UPDATE']) p
where has_column_privilege(r, 'public.profiles', c, p);

-- 2. Must be false (this was true before the fix)
select has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE');

-- 3. Must be true: the app can still edit profiles and post rounds
select has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE')
   and has_column_privilege('authenticated', 'public.rounds', 'holes_declared', 'INSERT');

-- 4. Who is an admin? Should be only you (plus anyone you re-added)
select id, username from public.profiles where is_admin;

-- 5. The new guard policies (expect 15 rows)
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and policyname like 'dogleg\_guard\_%' order by tablename, cmd;

-- 6. A share link works for a public round (paste a real short code)
select public.get_public_round('PASTE_A_CODE') -> 'round' ->> 'id';
```

Then try the app with a normal (non-admin) account: sign up a new account,
edit your profile and photo, post a round, react, comment, follow and unfollow,
delete a comment, delete a round, open notifications, and open a share link
while signed out. All of it should work exactly as before.

## If something goes wrong

### It stops with "Run database/stats_layer.sql first"
Nothing was changed. Run `stats_layer.sql`, then `feed_algorithm.sql`, then
this file again.

### If security_hardening.sql stops with PREFLIGHT FAILED
Nothing was changed. The message lists database functions that write one of
the newly server-only columns but run with the *caller's* rights (they are not
`SECURITY DEFINER`). After the lockdown they would fail with "permission
denied", so the file stops first. These functions exist only in production,
not in git. For each one listed, pick one:

- **It is a trigger function** (no arguments, and
  `select prorettype::regtype from pg_proc where proname = 'the_function_name';`
  says `trigger`; for example `update_follow_counts()`, which keeps follower
  counts): the app can't call those directly, so it is safe to make it run as
  the owner. Run this, then `security_hardening.sql` again:
  ```sql
  alter function public.the_function_name() security definer set search_path = public;
  ```
- **It is called from the app and already checks who is calling** (it uses
  `auth.uid()` or `is_admin()`): make it run as the owner, then run
  `security_hardening.sql` again:
  ```sql
  alter function public.the_function_name(argument types from the message)
    security definer set search_path = public;
  ```
  Only do this if the function checks who is calling: a `security definer`
  function that doesn't check can be used by anyone to do what it does.
  When unsure, paste the function's code (`select pg_get_functiondef('public.the_function_name'::regproc);`)
  to a developer first.
- **It is old and unused**: `drop function public.the_function_name(argument types);`
- **Only you (SQL editor) or a server with the service key ever runs it**: it
  will keep working (those bypass these grants). Tell the file to ignore it by
  adding this line at the very top of the query, then run again:
  ```sql
  set dogleg.preflight_ignore = 'the_function_name';   -- comma-separate several
  ```

### It stops with "self-check failed"
Nothing was changed. The message says which privilege could not be removed or
granted. This usually means some grant was made by a role other than
`postgres`. Send the message to a developer.

### Something in the app stops working afterwards
Look at the browser console for the error.

- **"permission denied for column X"**: the app writes a column this file
  didn't expect. If X is *not* one of the protected columns, re-run
  `security_hardening.sql` (it re-grants every unprotected column), or
  `grant insert (X), update (X) on public.<table> to authenticated;`.
- **"new row violates row-level security policy"**: the app wrote a row
  that isn't the user's own, or the user is banned. See the rollback list
  below for the policy involved.

## The rule for new columns

`profiles`, `rounds` and `comments` no longer use "the app may write every
column". When a new column is added to one of them and the app must write it,
either **re-run `security_hardening.sql`** (it recomputes the list), or run:

```sql
grant insert (new_column), update (new_column) on public.<table> to authenticated;
```

Otherwise the app gets **"permission denied for column new_column"**. (A new
column the app must *not* write needs nothing: it is server-only by default.
If it must be server-only forever, add it to the list at the top of
`security_hardening.sql` so a re-run keeps it that way.)

Similarly, a new `dogleg_*` function becomes callable from the app until
`security_hardening.sql` is re-run.

## Admin rights

```sql
-- give someone admin rights (or restore yours)
update public.profiles set is_admin = true where username = 'their_username';
-- take them away
update public.profiles set is_admin = false where username = 'their_username';
```

Only the SQL editor (or another admin function) can do this now.

## Bans

`toggle_user_ban_admin` (the admin dashboard) or, in the SQL editor,
`update public.profiles set is_banned = true where username = '...';`

A banned user can still sign in and delete their own things, but can't post
rounds, reactions, comments or follows, and their rounds disappear for
everyone else (feed, profile, course page, share links). Their comments still
show inside the signed-in app's feed and round pages (only the public share
page hides them); use "Delete All Content" for those. To stop them signing in
at all, also ban them in **Authentication → Users**.

## How to roll back each part

Only roll back the part that causes a problem, and tell a developer: each
rollback below re-opens the hole that part closed. Paste into the SQL editor.

```sql
-- PART 1, profiles (RE-OPENS "make yourself admin"! prefer granting the one
-- column the app needs, see "Something in the app stops working")
grant insert, update on public.profiles to authenticated;
-- PART 1, rounds / comments
grant insert, update on public.rounds to authenticated;
grant insert, update on public.comments to authenticated;

-- PART 3 + 4: one guard policy (names from check 5 above), e.g.
drop policy dogleg_guard_comments_insert on public.comments;
-- ...or all of them at once
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'dogleg\_guard\_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- PART 5, notifications
grant update on public.notifications to authenticated;
create policy "Users can update own notifications" on public.notifications
  for update using (auth.uid() = user_id);

-- PART 6, the share-link function (signed-out share links then show "not available")
drop function public.get_public_round(text);

-- PART 7, if the app ever needs one internal function back (it shouldn't)
grant execute on function public.dogleg_example(uuid) to authenticated;
```

PART 8 (the clean-up) can't be undone automatically: the report lists who
lost the admin flag (re-add them as above), and recomputed handicap indexes
are the correct values anyway.

`feed_algorithm.sql`: the previous version is in git history
(`git log -p database/feed_algorithm.sql`); paste the old function to undo the
privacy filter.

## Still to check by hand in production

These live only in production, so the files here could not cover them:

- **`get_my_rounds_with_everything`** (the My Rounds tab, SECURITY-10). Check:
  ```sql
  select prosecdef, pg_get_functiondef(oid) from pg_proc where proname = 'get_my_rounds_with_everything';
  ```
  If `prosecdef` is **true**, it skips the privacy policy, and anyone could call
  it with someone else's user id to get their private and hidden rounds.
  Either make it use `auth.uid()` instead of its `user_id_param`, or remove
  `security definer` (`alter function ... security invoker;`). If it is
  false, it is covered by the new policies.
- **The admin analytics RPCs** (`get_dashboard_overview`, `get_top_rounds`,
  `update_user_segments`, ...; ADMIN-2): check that each starts with an
  `is_admin()` check.
- **Storage bucket policies** (`round-photos`, `profile-pictures`; SECURITY-9).

Putting the real schema in git (next section) makes all of this reviewable.

## Put the real production schema in git

Today the base tables, policies, grants and about 19 RPCs exist only in
production, so nobody can review them and the test database has to guess.
Capture them in git. This needs your database password, so **run it on your
own computer**, never paste the password into a chat, and never commit it.

Find your project's **Reference ID** under **Project Settings → General**, and
the database password you chose when creating the project (reset it under
**Project Settings → Database** if you don't have it).

**Option A: Supabase CLI** (needs Node.js and Docker Desktop running):

```bash
cd dogleg
npx supabase login                               # opens the browser once
npx supabase init                                # only the first time; creates supabase/
npx supabase link --project-ref YOUR_PROJECT_REF # asks for the database password
npx supabase db pull                             # writes supabase/migrations/<time>_remote_schema.sql
git add supabase && git commit -m "Production schema snapshot"
```

**Option B: pg_dump** (needs the PostgreSQL client tools, version 17 or newer:
`brew install postgresql@17` on a Mac). Copy the **Session pooler** connection
string from the dashboard's **Connect** button and put your password in it:

```bash
cd dogleg
export DB_URL='postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres'
mkdir -p database/schema
pg_dump "$DB_URL" --schema-only --schema=public --no-owner \
  > database/schema/production_public.sql          # tables, policies, grants, functions
psql "$DB_URL" -c "select * from pg_policies where schemaname = 'storage'" \
  > database/schema/production_storage_policies.txt  # the photo bucket rules
unset DB_URL
git add database/schema && git commit -m "Production schema snapshot"
```

Re-take the snapshot after each change you make in the dashboard. Better
still, make SQL files in this folder the only way the database changes.
