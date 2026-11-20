# Project status

Last updated: 2026-11-20

## Where things stand

- **Production:** dogleg.io, on Vercel and Supabase. Merging to `master`
  deploys it. `master` is at the July 30, 2026 stats fixes (PR #6).
- **November 2026 hardening pass:** committed on 2026-11-20 on a branch, not
  yet on `master`. Before it goes live: run its SQL in the order
  [database/README.md](../database/README.md) gives ("Run order for this
  release"), do the checks listed there, and only then merge the frontend.
  The new app sends `holes_declared` and calls `get_public_round`, which the
  SQL adds. One piece is already in production: the founder installed the
  `trg_dogleg_guard_profile_columns` stopgap on 2026-11-20.

## Shipped

This list was checked against the code on 2026-11-20. How it works is in
[ai_context.md](ai_context.md).

### Accounts
- Email/password and Google sign-in (Supabase Auth), and password reset. An
  expired or used reset link now offers a new one.
- New Google users pick a username before using the app.
- After signing in you go back to the page you started from, including
  shared round links and Google sign-in.
- Switching tabs on a phone doesn't log you out. The session is refreshed
  only when it's about to expire.

### Posting rounds
- Course search across 22,000+ US courses by name, by location
  (city/state/zip) or nearby (within 15 miles).
- Score entry:
  - Quick Score with an 18/9-holes switch and front/back nine, or hole by
    hole with optional putts.
  - The tee you used last at that course is picked for you.
  - Photo and caption.
- Score limits are checked in the browser and again in the database.
  Saving is retry-safe, so a lost reply never posts a round twice.
- Photos are re-encoded to JPEG before upload, which removes GPS and other
  EXIF data. If an upload fails, you can try again or post without the photo.
- After posting, a summary shows the Dogleg Score, strokes vs your usual,
  badges, handicap progress, and Share / View round buttons.
- My Rounds. You can delete your own round, and that also removes its photo.

### Stats (shipped July 5–6, 2026)
- Automatic WHS-style handicap index: best 8 of the last 20 differentials.
  Nine-hole rounds count through the WHS 2024 expected-score method, and
  pairs of nines can bootstrap a first index.
- Dogleg Score (0.0–10.0) and achievement badges on every round card.
- A Stats tab (the fourth tab) with trends, splits, putting and most-played
  courses.
- Course pages with a leaderboard at `/courses/:courseId`.
- The brand flipped to "The Strava for golf" on the landing page, title,
  meta tags and manifest. Background:
  [stats_pivot_plan.md](stats_pivot_plan.md).

### Social
- The feed is chronological. An admin sets one mode for everyone
  (following, mixed or discover), and discovery rounds show why they appear.
- Follow and unfollow, follower/following lists, user search.
- Emoji reactions (8 types) and comments (up to 280 characters; you can
  delete your own).
- In-app notifications for comments, reactions and follows:
  - a bell with a red dot, the last 30 days, and follow-back buttons;
  - the app checks every 30 seconds;
  - database triggers create them, with duplicates removed since July 2026.
- Profiles: edit your own (avatar, bio, manual handicap), and view other
  golfers' profiles.
- Round pages with short links (`/rounds/ABC123`) and a share sheet with a
  share-card image. Since November 2026, shared links open for signed-out
  visitors and give a proper link preview.

### Admin (for accounts with `profiles.is_admin`)
- `/admin`: overview.
- `/admin/analytics`: growth, activity, engagement, top rounds and emoji
  breakdown. Its RPCs live only in production.
- `/admin/stats-engine`: engine health, a per-user "why no handicap?"
  diagnostic, retention cohorts.
- `/admin/feed-algorithm`: feed mode and page size, saved in `app_settings`.
- `/admin/moderation`: users, rounds and comments. You can hide a round or
  comment, remove all of a user's content, and ban or unban a user.

### Infrastructure
- Analytics: Google Analytics with Consent Mode v2 and an on/off switch on
  the Privacy page, plus Vercel Web Analytics.
- Errors: an error boundary with Reload / Go home, and optional Sentry (when
  `REACT_APP_SENTRY_DSN` is set).
- Unit tests, link-preview function tests, a local Postgres harness for the
  SQL, and GitHub Actions CI on every push.

## November 2026 hardening pass (2026-11-20)

These come from the branch's commit messages (`git log 76adfc1..`):

- **Test harness:** a local Postgres harness for `database/*.sql`, with
  Supabase's roles, `auth.uid()` and default grants. It applies every file
  twice.
- **App shell:**
  - One shell for every signed-in page, with the tabs in the URL, so Back,
    refresh and links behave.
  - Safer auth flows: you return to the page you started from, password
    reset checks for real errors, and the username gate covers every page.
  - Code splitting cut the main bundle from 321 kB to 155 kB (gzipped).
  - An error boundary, plus optional Sentry.
  - `isAdmin(profile)` reads `profiles.is_admin`, the hard-coded admin
    email is gone, and Ban/Unban works again in moderation.
- **Public round page and link previews:**
  - Shared links work signed out, read-only, through `get_public_round`.
  - The share text is honest: "I shot" only for your own round.
  - A Vercel function serves Open Graph tags to preview bots.
- **Lists:** the Feed, My Rounds and profiles no longer fetch a page twice
  or skip one. A failed load shows Retry. Other people's private rounds
  are hidden on profiles.
- **Stats engine:**
  - Stats can't be forged: the insert trigger ignores client-sent stats and
    reads ratings and pars from the database.
  - `holes_declared` (9/18), and score limits (SQLSTATE `23514`).
  - Posting an older round, deleting, hiding or editing one re-scores the
    golfer's later rounds.
  - Faster: a normal post went from 479 ms to about 40 ms for a 300-round
    golfer on the harness.
  - `stats_layer.sql` is now safe to re-run and never rewrites history. The
    full recompute moved to `stats_backfill.sql`, and
    `repair_nine_hole_totals.sql` fixes nine-hole rounds that were scored as
    18 holes.
- **Score entry:** the 9/18 switch, the limits, retry-safe saves, photo
  re-encoding that strips EXIF/GPS, "Try again / Post without photo", and
  the post-round summary instead of an alert.
- **Images:** icons and logos at their real sizes. Before, a first-time
  visitor downloaded about 7 MB of 2048 px originals. Added a maskable
  icon, an Apple touch icon and a link-preview image.
- **Privacy:** Google Analytics Consent Mode v2 with the Privacy-page
  switch. The Privacy Policy and Terms were rewritten to describe only what
  exists.
- **Security SQL** (`security_hardening.sql`):
  - Closes the hole that let any user make themselves an admin, lift a ban
    or set their own handicap index.
  - Computed round columns are server-only.
  - Policies for own rows only, no posting while banned, and hiding private
    or banned users' rounds.
  - `get_public_round`.
  - Keeps the production stopgap trigger as a second lock.
- **Tests and CI:** real unit tests for the helpers that PRs #3–#6 kept
  fixing, and `.github/workflows/ci.yml`.
- **Clean-up:** removed `analyticsService.js` (never imported),
  `store.js`, `reportWebVitals.js` and template files, and uninstalled
  zustand, web-vitals, react-icons and html2canvas.

## Corrections to earlier versions of these docs

- **"Soft delete pattern with is_deleted flags (never hard delete)":**
  wrong. A user's own rounds and comments are hard-deleted
  (`roundsService.deleteRound` and `deleteComment`). Only moderators hide
  content with `is_deleted`.
- **"Session tracking and page view analytics" (admin analytics):** never
  shipped. `analyticsService.js` was never imported and is now deleted.
  Analytics is Google Analytics (Consent Mode v2) plus Vercel Web Analytics.
- **"Moderation actions logged for audit trail":** unverified. Nothing in git
  writes `moderation_log`, and the moderation RPCs live only in production.
- **"Smart blended feed, 70% following / 30% discovery, 0.6·recency + ...":**
  out of date. The live feed is chronological
  (`get_feed_chronological_mixed`), and the scored blend is legacy and
  unused. The admin discovery-ratio slider has no effect.
- **Feed settings "stored in localStorage":** they're global, in
  `app_settings`. localStorage is only a fallback copy.
- **Admin "restricted by email":** admin is `profiles.is_admin`, and the
  hard-coded email was removed.
- **"Auth not yet implemented", "works offline", "offline-first":** auth is
  live. There is no service worker, so nothing works offline.
- **"Rounds can be public or private", "users control who can follow
  them":** the database hides private rounds, but the app has no control to
  make a round private. There are no follow approvals.
- **"De-emphasize the Strava angle":** superseded in July 2026. Dogleg is
  stats-first.
- **Older tech claims:**
  - Vite, Zustand, Workbox: wrong. The app uses Create React App, has no
    state library and no service worker.
  - "3-tab navigation": there are 4 tabs.
  - The reactions column is called `reaction_type`, not `emoji`.
  - Photos are re-encoded to at most 1 MB, not "target 4.9 MB".
  - `database/schema.sql`, `schema-social.sql`, `admin/index.html` and
    `npm run import` don't exist.

## Known gaps

- **The production base schema is not in git:** the tables, most policies
  and about 19 RPCs. How to pull it is in
  [database/README.md](../database/README.md) ("Put the real production
  schema in git").
- **Production-only checks still to do by hand** (database/README.md, "Still
  to check by hand in production"):
  - whether `get_my_rounds_with_everything` is `SECURITY DEFINER`;
  - that each admin analytics RPC checks `is_admin()`;
  - the storage bucket policies.
- **Moderation:** whether there's an audit trail is unknown (see above).
  Banned users' comments still show inside the signed-in app; "Delete All
  Content" removes them.
- **No in-app control** to make a round private.
- **Feed:** the discovery-ratio slider does nothing, and the popular
  threshold isn't saved (see the header of `database/feed_algorithm.sql`).
- **Notifications** are in-app only (no push), and nothing works offline.
- **No in-app account deletion.** The Privacy Policy describes the manual
  request.
- **Google Ads:** the Search account still needs its stats-first restructure
  (the checklist at the top of [google_ads.md](google_ads.md)).

## Next steps

1. Run the November SQL in production and do its checks
   ([database/README.md](../database/README.md)), then merge this branch to
   `master`.
2. Put the production schema in git, then do the production-only checks
   above.
3. Restructure the Google Ads Search account
   ([google_ads.md](google_ads.md)).
4. Feed upgrades that `database/feed_algorithm.sql` lists as approved but not
   built: adaptive per-user discovery backfill, and stat-aware discovery
   ranking.
