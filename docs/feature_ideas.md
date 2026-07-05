# 💡 Dogleg — Feature Ideas Backlog

Captured June 2026 from a product brainstorm. Parking these here to refer back to later.

## 📌 Current strategy (June 2026)

**Lead with the social side, not the stats side.** The growth bet is people who want to
follow, react to, and comment on their friends' rounds — "Instagram for golf" — so
user-facing copy and ads de-emphasize the stat-tracking / "Strava" angle for now.
The single-player stats ideas below are deliberately **parked**, not dead: they're the
retention layer to build once the social loop is bringing people in.

> **Update (July 5, 2026): the stats-first pivot HAPPENED.** The parked
> "Strava half" below is built and live (auto handicap, Dogleg Score, Stats
> tab, course leaderboards, putts tracking), and the brand flipped to
> "The Strava for golf" on all product surfaces. The social-growth items above
> remain the growth loop — social wasn't removed, just re-led. Full record:
> `stats_pivot_plan.md`.

---

## 🟢 Aligned with the social-growth strategy (build these first)

### 1. Playing-partner tagging ("Played with @mark")
The single best growth mechanic available. Golf is played in groups of 2–4, but rounds
are currently solo objects.
- Tag a friend who's on Dogleg → they get notified, rounds are linked, and they can
  one-tap "log my score from this round" (course/tee/date pre-filled — also makes
  entry faster than 30 seconds).
- Tag a friend who's NOT on Dogleg → invite link. Organic acquisition baked into the
  core action (like Strava's "with X" tagging).
- Group rounds make richer feed content than solo scores.

### 2. "Find golfers to follow" onboarding
Already on the roadmap. Suggest people who play your courses (the affinity logic
already exists in the feed RPC). Make following someone during onboarding nearly
mandatory — a new user with 0 follows has an empty social experience.

### 3. Push notifications
Already on the roadmap. Current 30-second polling only works while the app is open.
Web push works on iOS PWAs (16.4+). "X commented on your round" on the lock screen is
the re-engagement loop.

### 4. Friends leaderboards
Weekly/monthly among people you follow: most rounds, best round, best net (net needs
handicap, see parked section). Lightweight — no new data capture needed.

### 5. Course pages
22,563 courses are currently just a search dropdown. Each course should be a page:
recent rounds played there, photos, average score vs par, course leaderboard.
Three jobs at once: in-app discovery surface, competitive reason to post
("I'm #3 at my home course"), and public SEO surface for dogleg.io.

### 6. Comment & feed upgrades
- @mentions in comments (with notifications)
- Multiple photos per round
- User-facing feed toggle: Following / For You (admin has feed modes; users don't,
  and some users simply hate discovery content)

---

## 🅿️ Parked: single-player stats (the "Strava half")

These give Day-1 value to users with zero friends on the platform — the retention
layer for later.

### 7. "My Stats" view
Scoring average (overall + last 5/10), best round, score-vs-par trend over time,
rounds per month, most-played courses. Recharts is already in the admin dashboard —
reuse it user-facing.

### 8. Auto-calculated handicap index
The killer feature hiding in the database: 94k tees imported **with slope and course
rating**, so every round can get a real WHS-style differential
(`(score − rating) × 113 / slope`), rolled up as best 8 of last 20.
Today handicap is a manually-typed integer on the profile. Also unlocks net
leaderboards (#4 above).

### 9. Hole-by-hole insights
For rounds entered in holes mode: par-3/4/5 scoring averages, birdie/par/bogey
distribution, front-9 vs back-9 splits. Also creates an incentive to use hole-by-hole
entry instead of totals, which deepens the data.

### 10. Milestones & achievements
"Broke 90 for the first time," "10th round logged," "5 different courses played."
Golf improvement is slow — celebrating small markers lands well, and each milestone is
a shareable moment (the canvas share-card system already exists and is perfect for it).

### 11. "Year in Dogleg" annual recap
Rounds, total strokes, best score, most-played course. Cheap to build, extremely
shareable. Spotify-Wrapped energy, ship in December.

---

## 🔧 Quality-of-life wins (a weekend each)

### 12. Recent courses / home course quick entry
Most golfers play the same 2–3 courses. "Play it again" with course + tee pre-filled
gets entry well under the 30-second target.

### 13. Offline score entry (queue-and-sync)
Golf courses famously have bad cell coverage, and the PWA pitch already promises
offline. Queue the post locally, sync when signal returns.

### 14. Round enrichment
Weather auto-tag, walked vs rode.

---

## 🎲 Big bet (hold for later)

### 15. Live scoring "Play" mode
Score hole-by-hole *during* the round, optionally live-visible to followers (like a
Strava activity in progress). Turns Dogleg from "post after golf" into "the app open
in the cart all round." Biggest lift (offline, battery, group scoring, state) and
competes head-on with 18Birdies/Golf Gamebook — earn it after the social loop and
stats foundation exist.

---

## If only picking three (under the social-growth strategy)

1. **Playing-partner tagging** — the growth loop
2. **Push notifications** — the re-engagement loop
3. **Find golfers to follow** — fixes the empty-network cold start

(Under the old stats-first framing the picks were: auto handicap + stats page,
partner tagging, push notifications.)
