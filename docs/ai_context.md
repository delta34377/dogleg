# Dogleg: technical briefing

The one technical briefing for AI assistants and developers. Read it before
changing code or SQL. Last checked against the code on 2026-11-20.

Related docs: [readme.md](readme.md) (human overview),
[project_status.md](project_status.md) (what's shipped, gaps, next steps),
[../database/README.md](../database/README.md) (how to run the SQL, checks,
rollback), [stats_pivot_plan.md](stats_pivot_plan.md) (stats design and
history).

## What Dogleg is

Dogleg (dogleg.io) is a mobile-first web app for golfers. You post a round in
about 30 seconds, and the database works out a WHS-style handicap index, a
0.0–10.0 **Dogleg Score** (how good the round was for *you*), and achievement
badges. Friends follow each other and react to and comment on rounds in a feed.

**Positioning: stats-first, "The Strava for golf" (since July 2026).** The
landing page headline is "Strava for golf. Track every round. Watch your
handicap drop." (`frontend/src/pages/LandingPage.js`), and the title, meta tags
and manifest say "The Strava for Golf". Social stays as the growth loop: the
pivot changed what leads the message, it didn't remove the feed. User-facing
copy should lead with stats. The "social-first, de-emphasize Strava" text in
`google_ads.md` and `feature_ideas.md` is from June 2026 and is superseded
(both files say so at the top).

## Working with the founder

- The founder is not a professional developer. Give step-by-step
  instructions with exact file paths and full commands, and explain what each
  step does.
- SQL changes reach production only when the founder pastes a file into the
  Supabase SQL editor. Write SQL files that are safe to paste twice (see
  [Changing SQL](#changing-sql)).
- Never ask for keys or passwords in chat, and never put them in the repo.

## Stack

- **Frontend:** React 19, React Router 6, Create React App (`react-scripts`
  5), Tailwind CSS 3, Recharts 3 (Stats tab, admin charts), lucide-react
  (admin icons), `browser-image-compression`. No state library: auth state
  comes from `AuthContext`, and pages fetch their own data through
  `src/services/`.
- **Backend:** Supabase: Postgres, Auth (email/password and Google OAuth),
  Storage. There is no app server of our own.
- **Hosting:** Vercel. `frontend/` holds `vercel.json` and the one serverless
  function (`frontend/api/og/round.js`). Vercel Web Analytics
  (`<Analytics />` in `App.js`).
- **Analytics:** Google Analytics with Consent Mode v2 (see
  [Analytics and error reporting](#analytics-and-error-reporting)).
- **PWA:** a web manifest and an iOS "Add to Home Screen" prompt
  (`IOSInstallPrompt.js`). There is **no service worker**, so nothing works
  offline.

## Repo layout

```
frontend/                  React app; also the Vercel project
  src/App.js               routes
  src/components/          pages and UI (AppShell, Feed, ScoreEntry, ...)
  src/components/admin/    admin pages
  src/pages/               LandingPage, SearchUsers, PrivacyPolicy, TermsOfService
  src/services/            Supabase calls (roundsService, statsService, ...)
  src/context/AuthContext.js
  src/utils/               pure helpers, most with *.test.js next to them
  api/og/round.js          Vercel function: link previews for shared rounds
  api/_lib/                its helpers and tests ("_" folders are not endpoints)
  vercel.json              bot rewrite for link previews + SPA catch-all
database/                  SQL run by hand in Supabase; README.md explains how
database/tests/            local Postgres test harness (run.sh)
scripts/import-golf-data.js  one-off CSV import of clubs/courses/tees
.github/workflows/ci.yml   CI
config/, prototypes/       early config file and HTML prototype; the app does not use them
```

## Routes

Defined in `frontend/src/App.js`. Everything except login, password reset,
legal and admin pages renders inside one layout route (`AppLayout`), which
picks the frame:

| Path | Page | Notes |
|---|---|---|
| `/` | Feed (signed in), `LandingPage` (signed out) | `AppShell` keeps the Feed mounted (hidden) on other tabs, so Back returns to the same scroll spot |
| `/add` | `CourseSearch` then `ScoreEntry`, then `PostRoundModal` | Add Round tab |
| `/stats` | `StatsPage` | `get_user_stats` RPC |
| `/my-rounds` | `MyRounds` | `get_my_rounds_with_everything` RPC |
| `/profile` | `Profile` | your own profile: edit details, avatar, manual handicap |
| `/profile/:username` | `UserProfile` | someone else's profile, follow button |
| `/courses/:courseId` | `CoursePage` | leaderboard, `get_course_page` RPC |
| `/search-users` | `SearchUsers` | find golfers to follow |
| `/rounds/:roundId` | `SingleRound` | short code or round id. Signed in: inside `AppShell`. Signed out: `PublicShell` with read-only data from `get_public_round` |
| `/login` | `AuthScreen` | returns you to the page you came from |
| `/reset-password` | `ResetPassword` | |
| `/terms`, `/privacy` | legal pages | the Privacy page has the analytics on/off switch |
| `/admin/*` | `AdminHub`: overview, `analytics`, `stats-engine`, `feed-algorithm`, `moderation` | outside the shell; `ProtectedRoute` + `AdminGate` |

- The four tabs (Feed, Add Round, Stats, My Rounds) are URLs, defined in
  `AppShell.js`. Re-tapping Feed refreshes it, and re-tapping My Rounds
  scrolls to the top.
- When signed out, the signed-in-only paths send you to `/login` and back
  again afterwards. Any other unknown path goes to `/`. Signed in, an unknown
  path shows "Page not found" inside the shell.
- `ProtectedRoute` is the only place that redirects to `/login`. It also shows
  `UsernameSetup` to signed-in users without a username (new Google users).
- Pages are code-split with `React.lazy`. If a chunk is missing after a
  deploy, `lazyPage()` reloads the page once.

## Data model highlights

The base schema (tables, most RLS policies, about 19 RPCs) lives **only in
production**, not in git. `database/tests/mock_schema.sql` is a
reconstruction, not a copy. The parts below are the ones the code relies on.

- **Course data:** `clubs` → `courses` → `tees`, imported from CSV
  (`scripts/import-golf-data.js`). The IDs are **text**. Courses have hole
  pars and stroke indexes, and tees have slope and course rating. The app
  says "22,000+ courses in the United States". Course search uses name,
  location (city/state/zip) and nearby (geolocation, 15 miles, via the
  `search_golf_courses` RPC).
- **`profiles`:** one row per auth user (use it, not `users`). Rounds,
  comments and notifications reference it, and the app joins through
  `profiles!rounds_user_id_fkey` and similar. `handicap` is the golfer's own
  manual entry and the app writes it. `handicap_index` is computed by the
  stats engine and is server-only. `is_admin` and `is_banned` are also
  server-only. `last_notifications_check` drives the notification dot.
- **`rounds`:** written by the app: course/club/tee fields, `tee_id`,
  `tee_data` (display only), `played_at`, `total_score`, `front9`, `back9`,
  `scores_by_hole`, `course_pars`, `par`, `caption`, `photo_url`,
  `holes_declared` (9 or 18), `stats_by_hole` (putts) and `total_putts`.
  **Server-only:** `holes_played`, `differential`, `dogleg_score`,
  `strokes_vs_usual`, `achievements`, `short_code`, `is_deleted`. Also
  `is_private`, which RLS enforces, but the app has no control to set it yet.
- **`reactions`** (`reaction_type`: fire, clap, dart, goat, vomit, clown,
  skull, laugh), **`comments`** (`content`, at most 280 characters;
  `is_deleted`), **`follows`** (`follower_id`, `following_id`),
  **`notifications`** (written only by triggers; see
  `database/notifications_hardening.sql`), and **`app_settings`** (key
  `'feed'`: the global feed mode).
- **Storage:** `round-photos` (public; files at `{userId}/{roundId}.jpg`) and
  `profile-pictures`.
- **Deleting:** a user's own rounds and comments are **hard-deleted**
  (`roundsService.deleteRound` also removes the round's photo).
  `deleteComment` hard-deletes too. Moderators **hide** rounds and comments
  with `is_deleted` through the admin RPCs, and every reader filters out
  hidden content. The admin RPCs live only in production. Whether they write
  an audit trail (`moderation_log`) is **unverified**: nothing in git writes
  it, except the test mock's own guess.

## Security model

The browser uses the public anon key plus the signed-in user's JWT, and talks
straight to Supabase. **Row Level Security, column grants and RPCs are the
only security boundary.** Anything the UI hides can still be called directly,
so check every rule in the database too.

`database/security_hardening.sql` (November 2026):

- **Column grants.** The app may write every column of `profiles`, `rounds`
  and `comments` except a server-only list: `profiles.is_admin`, `is_banned`
  and `handicap_index` (plus follower/following counts and ban details where
  those exist), the computed round columns listed above, and `is_deleted`
  plus the moderation columns. The stats engine and admin RPCs still write
  them because they run as `SECURITY DEFINER`.
- **Second lock:** trigger `trg_dogleg_guard_profile_columns` blocks API-role
  changes to `is_admin`, `is_banned` and `handicap_index`, even if a later
  `GRANT ALL` brings the table-wide write right back.
- **RESTRICTIVE policies** (`dogleg_guard_*`) on `profiles`, `rounds`,
  `reactions`, `comments` and `follows`: you can only write your own rows,
  and banned users can't post. A banned user can still delete their own
  things.
- **Privacy:** other people's private rounds and rounds by banned users are
  hidden on every API read (`dogleg_guard_rounds_select_privacy`) and in the
  live feed RPC. You always see your own.
- **`get_public_round(p_code)`:** the one function signed-out visitors call.
  It returns only a public round, with its author, reaction counts and
  comments.
- The internal `dogleg_*` helpers are not callable from the app.
  Notifications can't be edited through the API.

**Admin check:** `profiles.is_admin`. On the server, `public.is_admin()`
(`database/admin_stats_engine.sql`) reads it, and every `*_admin` RPC should
start with `IF NOT is_admin() THEN RAISE EXCEPTION`. In the frontend, use
`isAdmin(profile)` from `src/utils/admin.js`, which only hides and shows UI.
Never hard-code an email address to mean "admin".

## Stats engine

Lives in `database/stats_layer.sql`, which does all the computing in Postgres
triggers. It reads ratings from `public.tees` and pars from `public.courses`,
never from what the client sent.

- **Differential:** `(adjusted gross − course rating) × 113 / slope`.
  Hole-by-hole rounds get the net-double-bogey adjustment. Ratings are used in
  tiers: the picked tee, then the course's median-rated tee, then par at slope
  113. A differential below −10 is treated as a data-entry mistake and not
  counted.
- **Handicap index:** WHS best 8 of the last 20 differentials, with the
  official small-sample table. It needs 3 counting rounds and is capped at
  54.0.
- **9-hole rounds:** `rounds.holes_declared` (the app's 9/18 switch) decides
  how a bare total is read. A nine is combined with an expected differential
  for the unplayed nine (WHS 2024). Before a golfer has an index, pending
  nines are paired into 18-hole differentials.
- **Dogleg Score:** `6.0 + 0.4 × (baseline − differential)`, clamped to
  0.0–10.0. The baseline is the median of your last 20 differentials, not
  your index. It always shows as "x.x/10".
- **Achievements:** first round, personal bests, breaking 100/90/80/70,
  course PR, most birdies, round-count milestones. Stamped at post time.
- **Score limits:** total 9–200, each hole 1–20, each nine 1–120, and no date
  more than a day in the future. A broken limit raises SQLSTATE `23514` with a
  readable message. `src/utils/scoreValidation.js` checks the same limits in
  the browser.
- **Recompute later rounds:** posting an older round, deleting, hiding or
  restoring one, or editing a score re-scores that golfer's later rounds, as
  if they had been posted in date order. The ordering key is always
  `(played_at, created_at, id)`.
- **RPCs:** `get_user_stats(uuid)` (Stats tab) and `get_course_page(text)`.
- **One-off scripts:** `database/stats_backfill.sql` rewrites every user's
  history, so run it only deliberately (read its warning).
  `database/repair_nine_hole_totals.sql` lists nine-hole rounds that the old
  engine scored as 18 holes, and fixes them one at a time.

## Feed

The live feed is `get_feed_chronological_mixed` (`database/feed_algorithm.sql`;
the frontend calls it from `roundsService.getFeedWithDiscovery`). It is
chronological. The admin Feed Algorithm panel sets a global `mode`
(`following`, `mixed` or `discover`) and `feedLimit` in `app_settings`.
Discovery rounds are filtered in by mode, not mixed in by quota. The
discovery-ratio slider currently **does nothing** (the live function ignores
the parameter), and the popular threshold isn't saved. The older scored blends
in that file (`get_feed_with_discovery`, ...) are legacy and unused. Read the
file's header before you touch it.

## Changing SQL

1. Put the change in a file in `database/`: one transaction
   (`BEGIN`/`COMMIT`), and safe to re-run.
2. Add it to `database/tests/apply_order.txt` in the order the founder will
   run it, and add a `test_*.sql`. The harness applies every file twice, to
   prove it is safe to re-run.
3. Run `database/tests/run.sh`.
4. The founder pastes the file into the Supabase SQL editor. The run order,
   post-run checks and rollback steps are in
   [database/README.md](../database/README.md). Link to that file rather than
   repeating it.

Rules worth knowing:

- **New columns:** `profiles`, `rounds` and `comments` use per-column grants.
  If the app must write a new column, re-run `security_hardening.sql` or
  grant that column. Otherwise the app gets "permission denied for column".
- **New `dogleg_*` functions** are callable from the app until
  `security_hardening.sql` is re-run.
- Make a function `SECURITY DEFINER` only if it checks the caller
  (`auth.uid()` or `is_admin()`), and pin its `search_path`.
- Production's base schema is not in git. `database/README.md` explains how
  to pull it with the Supabase CLI (or `pg_dump`). Until then, the harness
  guesses, and its README lists the known differences.

## Testing and CI

```bash
cd frontend && npm test                          # Jest unit tests (watch mode; add -- --watchAll=false for one run)
cd frontend && node --test "api/**/*.test.js"    # link-preview function tests
database/tests/run.sh                            # SQL tests on a local PostgreSQL 16
```

`frontend/.env.test` gives Jest dummy Supabase settings. These are not
secrets. The harness's setup and options are in
[database/tests/README.md](../database/tests/README.md).

`.github/workflows/ci.yml` runs on every push and pull request:

- **frontend:** Node 22, `npm ci`, ESLint (it fails on errors only), the unit
  tests in the `America/Los_Angeles` time zone, the function tests, and a
  production build.
- **database:** a `postgres:16` service and `run.sh`, run twice (the second
  time with the alternate column types).

## Link previews

Preview bots don't run JavaScript. So `frontend/vercel.json` rewrites
`/rounds/:code` to `/api/og/round?code=:code`, but only for known bot user
agents (facebookexternalhit, Twitterbot, Slackbot, WhatsApp, ...). People get
the normal app. `api/og/round.js` reads `get_public_round` over the Supabase
REST API and answers with Open Graph and Twitter tags for that round. On any
problem it falls back to the generic Dogleg preview, always with status 200.
The pure helpers are in `api/_lib/roundPreview.js`. Its course-name rules copy
`src/utils/courseNameUtils.js`, so keep the two in step.

## Analytics and error reporting

- **Google Analytics** with Consent Mode v2 is set up in
  `frontend/public/index.html`. Analytics and advertising cookies are off by
  default in the EEA, UK and Switzerland, and on elsewhere. The visitor's
  choice is stored in localStorage under `dogleg_analytics_optout` (`'1'` =
  off everywhere, `'0'` = analytics on), and the Privacy page's switch
  (`src/utils/analyticsConsent.js`) updates it. Both files use that key, so
  change them together.
- **Vercel Web Analytics:** `<Analytics />` in `App.js`.
- There is no first-party event or page-view tracking. The old
  `analyticsService.js` was never imported and has been deleted.
- **Errors:** `ErrorBoundary` wraps the whole app (`src/index.js`) and each
  page in the shell, and shows Reload / Go home. **Sentry** is optional. It
  loads lazily only when `REACT_APP_SENTRY_DSN` is set
  (`src/utils/monitoring.js`), with no PII, no replay and no tracing, and
  tags reports with the user id only.

## Environment variables

Names only. Put real values in `frontend/.env.local` (git-ignored) for local
work and in Vercel's project settings for deploys.

| Name | Used by | Required |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | `src/services/supabase.js`, `api/_lib/roundPreview.js` | yes |
| `REACT_APP_SUPABASE_ANON_KEY` | same | yes (public key) |
| `REACT_APP_SENTRY_DSN` | `src/utils/monitoring.js` | no; Sentry is off without it |
| `REACT_APP_VERCEL_ENV`, `REACT_APP_VERCEL_GIT_COMMIT_SHA` | `src/utils/monitoring.js` (Sentry environment and release) | no; Vercel provides them |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | `scripts/import-golf-data.js` (in `scripts/.env`) | only for the course import |

The service key bypasses RLS. Never use it in the frontend.

## Conventions and gotchas

- **Never send server-computed columns** (`holes_played`, `differential`,
  `dogleg_score`, `strokes_vs_usual`, `achievements`, `short_code`,
  `is_deleted`). The database refuses them. `saveRound` sends only what the
  golfer entered, and reads the computed values back from the inserted row.
- **Error codes the app handles:**
  - `23514`: a score limit; show the database's message.
  - `23505`: a duplicate. `saveRound` sends a client-made round id, so a
    retry that hits `23505` counts as success.
  - `PGRST204`: an unknown column. Retry once without `holes_declared`.
- **Photos** are always re-encoded to JPEG in the browser
  (`src/utils/roundPhoto.js`: at most 1 MB and 2048 px), which strips
  EXIF/GPS data. Never upload the original file.
- **Dates:** use `src/utils/dateFormat.js`. `new Date('2026-07-04')` shows
  the day before for anyone west of Greenwich. For course names, use
  `getDisplayName` (`src/utils/courseNameUtils.js`).
- **Auth (`AuthContext.js`):** the `onAuthStateChange` listener is the source
  of truth. Event handlers read `userRef.current`, not a stale `user`.
  `rechecking` must stay in the `useMemo` dependency list. On
  `visibilitychange`/`pageshow` (never `focus`), the session is refreshed
  only when the token expires within 30 seconds.
- **After login:** use `src/utils/safeRedirect.js`. It accepts only in-app
  paths, and Google sign-in comes back to `/` and then finishes the trip.
- **Detail pages** (`/profile/:username`, `/courses/:courseId`,
  `/rounds/:roundId`) are wrapped in `RemountOnPathChange`, so moving from
  one profile to another never shows stale data.
- **Infinite scroll** (Feed, My Rounds, profiles) keeps "loading", the next
  offset and "has more" in refs, and shows Retry after a failed page. Copy
  that pattern for any new list.
- **Comments in code** are plain English and explain *why*. Keep that style.
  The founder reads them.
