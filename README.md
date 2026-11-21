# Dogleg

Dogleg ([dogleg.io](https://dogleg.io)) is the Strava for golf. Post a round
in about 30 seconds and you get an automatic WHS-style handicap index, a 0–10
Dogleg Score that rates the round against your own usual game, and badges for
personal bests. There's also a Stats tab and a leaderboard for each course.
Friends follow each other, react to and comment on rounds in a feed, and can
share round links that work without an account. It's a mobile-first React web
app on Supabase, deployed on Vercel.

## Repo layout

| Path | What it is |
|---|---|
| `frontend/` | The React app (Create React App, Tailwind), also the Vercel project: `vercel.json` and the link-preview function in `api/` |
| `database/` | SQL that gets pasted into the Supabase SQL editor, plus a local Postgres test harness in `database/tests/` |
| `docs/` | Technical briefing, status, plans |
| `scripts/` | One-off import of the golf course CSVs |
| `.github/workflows/ci.yml` | CI: lint, unit tests, function tests, build, SQL tests |

## Quick start

```bash
cd frontend
npm install
# frontend/.env.local (git-ignored): REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY
npm start                          # http://localhost:3000
npm test                           # unit tests
node --test "api/**/*.test.js"     # link-preview function tests
```

SQL tests: `database/tests/run.sh` (needs PostgreSQL 16).

## Docs

- [docs/ai_context.md](docs/ai_context.md): technical briefing (architecture, routes, data model, security, conventions)
- [docs/readme.md](docs/readme.md): overview for people
- [docs/project_status.md](docs/project_status.md): what's shipped, known gaps, next steps
- [database/README.md](database/README.md): how to run the SQL in Supabase, checks and rollback
