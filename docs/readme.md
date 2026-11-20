# Dogleg

**The Strava for golf.** Post a round in about 30 seconds and Dogleg does the
rest: it keeps an automatic handicap index and gives every round a 0–10
Dogleg Score that measures how good the round was *for you*, so a
25-handicap and a scratch golfer can both have a great day. It also hands out
badges for personal bests and milestones. Your friends see your rounds in
their feed, and they react and comment.

- **Domain:** dogleg.io
- **Platform:** mobile-first web app (add it to your home screen), on
  Supabase and Vercel

## Positioning

Since July 2026 Dogleg leads with stats: "Track every round. Watch your
handicap drop." Social features stay, because they're the growth loop and
the thing pure stat trackers lack. Stats are what people come for, and
friends are why they stay. The reasoning and history are in
[stats_pivot_plan.md](stats_pivot_plan.md). Ad copy is in
[google_ads.md](google_ads.md); its July 2026 header lists the Search
restructure that's still to do.

## What's in the app

- **Add a round:** search 22,000+ US courses by name, location or nearby.
  Pick a tee, then enter a quick total (9 or 18 holes, or front/back nine) or
  go hole by hole with optional putts. Add a photo and a caption.
- **Stats:** handicap index, Dogleg Score, scoring trends, par-3/4/5 and
  front/back splits, and most-played courses.
- **Course pages:** a leaderboard and recent rounds for every course.
- **Social:** a feed, follows, emoji reactions, comments, in-app
  notifications and user search.
- **Sharing:** every round has a short link such as `/rounds/ABC123`. Shared
  links open for people without an account and show a proper preview in
  iMessage, WhatsApp, Slack and similar apps.
- **Admin (admins only):** analytics, a stats-engine health panel, feed
  settings and moderation.

The full list and its current state are in
[project_status.md](project_status.md).

## Run it locally

You need Node.js 22 and the Supabase project's URL and public anon key.

```bash
cd frontend
npm install
# Create frontend/.env.local (git-ignored) with two lines:
#   REACT_APP_SUPABASE_URL=...
#   REACT_APP_SUPABASE_ANON_KEY=...
npm start            # opens http://localhost:3000
```

Tests:

```bash
cd frontend && npm test                          # unit tests
cd frontend && node --test "api/**/*.test.js"    # link-preview function
database/tests/run.sh                            # database (needs PostgreSQL 16)
```

GitHub runs all three on every push (`.github/workflows/ci.yml`). Vercel
deploys the `frontend/` folder.

**Database changes** are SQL files in `database/` that you paste into the
Supabase SQL editor. What to run, in what order, and how to check it worked
are all in [database/README.md](../database/README.md).

## Where things live

| Folder | What's there |
|---|---|
| `frontend/src/` | the React app: `components/` (pages and UI), `services/` (talking to Supabase), `utils/` (helpers with tests) |
| `frontend/api/` | the Vercel function that builds link previews for shared rounds |
| `database/` | SQL for Supabase, and `tests/` (a local test database) |
| `scripts/` | the one-off import of the course CSV files |
| `docs/` | these docs and the planning notes |

## More docs

- [ai_context.md](ai_context.md): the technical briefing (architecture,
  routes, data model, security, conventions). Give it to an AI assistant
  first.
- [project_status.md](project_status.md): what's shipped, known gaps, next
  steps.
- [../database/README.md](../database/README.md): running the SQL, checks,
  rollback, admin rights and bans.
- [stats_pivot_plan.md](stats_pivot_plan.md): the stats design (WHS math,
  Dogleg Score spec).
- [feature_ideas.md](feature_ideas.md) and [admin_plan.md](admin_plan.md):
  the backlog and admin ideas. They're plans, not a description of what
  exists.

## Security basics

- Never commit `.env` files, the course CSVs (`data/`) or any key. The anon
  key is public by design. The service key is secret and only the import
  script uses it.
- The database is the security boundary, because the browser talks to
  Supabase directly. See the security section of
  [ai_context.md](ai_context.md#security-model).
