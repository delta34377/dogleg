# 📈 Dogleg — "Strava for Golf" Pivot Plan

**Status (July 2026): stat layer BUILT (steps 1–6 below), brand flip NOT done.**
The live positioning is still social-first (June 2026 — see `feature_ideas.md` and
`google_ads.md`). The landing page and ads are untouched — flipping them is step 7,
a separate, deliberate decision.

## ✅ What's implemented (branch: claude/golf-stats-positioning-qkes3j)

**One manual step to switch it on: open Supabase → SQL Editor, paste
`database/stats_layer.sql`, Run.** Do this BEFORE merging the frontend (either
order is safe — the app degrades gracefully — but SQL-first means everything
lights up immediately, including backfilled stats for every existing round).

- **Auto handicap index** — WHS differentials per round (net-double-bogey
  adjustment for hole-by-hole rounds using the course stroke index), best 8 of
  last 20 with the official small-sample table, auto-updates on every post /
  soft delete. Shows on the Stats tab and profile pages.
- **Dogleg Score** — 0.0–10.0 per round + "strokes vs your usual", computed at
  post time, chip on every round card (feed, my rounds, single round, profiles).
- **Achievements** — 🎉 first round, 🏆 personal best / best vs par,
  💯 first time breaking 100/90/80/70, ⛳ course PR, 🔥 most birdies,
  📅 round-count milestones — stamped at post time, badges on cards.
- **Stats tab** (new 4th nav tab) — handicap hero, latest Dogleg Score,
  scoring averages, score-vs-par trend, handicap trend (differentials + rolling
  index), rounds/month, par 3/4/5 + front/back + birdie/bogey breakdown,
  putting stats, most-played courses.
- **Course pages** — `/courses/:courseId` with leaderboard (each player's best
  18-hole round), recent rounds, average score; course names on cards link there.
- **Score entry** — last-used tee preselected per course, "counts toward your
  handicap" hint, optional putts-per-hole tracking (hole-by-hole mode).
- **Backfill** — the migration recomputes everything for all existing rounds in
  chronological order, so history is populated on day one.
- Validated against a local Postgres with a mock of the production schema:
  17 assertions covering the WHS math, Dogleg Score anchors, achievements,
  soft-delete recomputation, both RPCs, and idempotent re-runs.

**v1 scope cuts (deliberate):** 9-hole rounds count in all stats but don't earn
differentials/handicap yet (proper WHS expected-differential method is v2, not
the wrong shortcut); Quick-Score rounds use raw totals (hole-by-hole rounds get
the more accurate adjusted gross — one more reason to incentivize holes mode).

---

## The thesis

Strava isn't "stats instead of social" — it's **stats as the content of a social
feed**. Kudos, comments, and a feed are exactly what Strava has; what makes it Strava
is that every activity is data-rich and auto-analyzed. Dogleg already has the social
skeleton (feed, follows, reactions, comments, notifications, share cards). The gap is
that a round today is data-thin (total score + photo + caption) and nothing is
computed from it.

**The pivot is a re-lead, not a rebuild. Social stays.** Stat-tracker competitors
(18Birdies, TheGrint, Arccos) have weak social; pure-social has no Day-1 value for a
user with zero friends. Having both halves IS the differentiation.

**Constraint:** no GPS or shot tracking. Data density must come from quick manual
capture — and from computing more out of what's already captured.

**The hidden asset:** the database already has everything needed for real golf
analytics — 94k tees with **slope and course rating**, courses with `Par1-18` and
`Hcp1-18` (stroke index), and rounds storing `scores_by_hole` + `course_pars` +
`tee_data`. A legit WHS-style handicap and everything below is computable from data
we already have.

---

## Agreed build order

**Key sequencing rule: ship the stat layer first, flip the brand second.**
Features 1–6 are no-regret builds — they're the retention layer even under the
social-first strategy. Only step 7 commits us to the pivot. Don't market
"Strava for Golf" before the handicap and stats page exist.

### 1. Auto handicap index (the anchor)
WHS-style: differential = `(adjusted gross − course rating) × 113 / slope`, index =
best 8 of last 20 differentials. Net-double-bogey adjustment for hole-by-hole rounds
(possible because `Hcp1-18` is in the courses table). Computed in Postgres
(RPC/trigger, same pattern as short codes / notifications / follower counts). Big on
the profile, with a trend chart. Handle 9-hole rounds (`front9`/`back9` exist; WHS
combines 9-hole differentials).

**Data-model fix needed now regardless of pivot:** `tee_id` is nullable in
`saveRound` — no tee means no slope/rating means no differential. Make tee selection
near-universal: default to the user's last-used tee at that course. Rounds without a
tee honestly don't count toward the index.

### 2. Dogleg Score — the "Relative Effort" analog *(NEW idea, July 2026)*
See full spec below. One number that measures how good the round was **for you**, so
a 25-handicap and a scratch golfer can both post a great day.

### 3. "Stats" tab in main nav
The pivot in one UI change: Feed / Add Round / **Me** (stats-led profile, rounds
below). Scoring average (overall + last 5/10), vs-par trend, handicap trend, Dogleg
Score trend, rounds/month, best round, most-played courses, par-3/4/5 averages and
front/back splits for holes-mode rounds. Recharts already installed (admin dashboard)
— reuse it user-facing. All computable retroactively from existing round data.

### 4. Personal records & milestones on feed cards
Strava's trophy mechanic — this is what makes stats social. Auto-detect at post time:
new best 18, new best vs-par, first time breaking 100/90/80, most birdies in a round,
course PR. Badge on the feed card, wire into the existing share-card system.

### 5. Course pages with leaderboards (= segments)
22,563 courses are 22,563 Strava segments. Course PRs, gross leaderboards, net
leaderboards once handicap exists ("I'm #3 at my home course"). Doubles as the public
SEO surface for dogleg.io — matters more under stat-intent acquisition.

### 6. Deeper capture — carefully
Protect the <30-second promise. Hole-by-hole is the *incentivized* path, not
required ("hole-by-hole rounds unlock full insights and the most accurate handicap").
Optional per-hole putts / fairway / GIR as one-tap chips — those three unlock most of
the insight golfers want. Progressive entry: post the total in 30 seconds, "add
details" later.

### 7. Brand flip (LAST, only when 1–6 are live)
- Landing page hero: stat-led ("Track every round. Watch your handicap drop.")
- Ads: restructure around intent we currently block — "golf handicap tracker",
  "golf stat tracker". Remove the `handicap` account-level negative keyword (the flip
  switch already noted in `google_ads.md`). Search captures solo/stat intent better
  than the friends angle anyway; keep friends-angle creative for Meta/social.
- Onboarding: "log your last round and get your handicap" first, follow-suggestions
  second.

---

## 🎯 Dogleg Score — full spec (v1)

**Goal:** a single friendly number measuring the goodness of a round *relative to how
good you are* — Strava's Relative Effort, for golf. Everyone gets days worth posting.

**Foundation:** the WHS differential already normalizes for course difficulty
(slope/rating). The metric is today's differential vs. **your own baseline**:

```
differential = (gross − course rating) × 113 / slope
baseline     = median differential of your last 20 rounds
DoglegScore  = clamp( 6.0 + 0.4 × (baseline − differential), 0.0, 10.0 )   # one decimal
```

- Typical day ≈ **6.0**. Playing to your handicap index ≈ **7.2**. Career day
  (≈7 strokes better than index — WHS's "exceptional score" threshold) = **10.0**.
- Identical scale for every skill level — that's the point.

**Scale rationale (July 2026 revision — was 0–100, changed):**
- **Why not 0–100:** collides head-on with gross scores (most golf scores land
  70–110, most decent Dogleg Scores would land 50–100) — *with inverted polarity*
  (low golf score = good, low Dogleg Score = bad). Two same-range numbers pointing
  opposite directions on one feed card fails the glance test.
- **Why 0.0–10.0 with a decimal:** a "7.8" cannot be a golf score — gross scores
  are integers, so the decimal itself disambiguates. "X/10" is a universal rating
  idiom (polarity self-evident). One decimal = 101 distinct values — same
  granularity as 0–100 for trends and leaderboards, and a 9.8 brags well.
- **Why typical = 6.0, not the 5.0 midpoint:** ratings culture reads 5/10 as
  "meh" (nobody rates a perfectly fine movie 5). 6.0 matches how people
  intuitively rate a normal-fine experience. The asymmetric headroom also matches
  golf reality: blowup rounds have a longer tail (−15 vs typical → 0.0) than
  career days (+10 vs typical → 10.0).
- **Why not letter grades:** too coarse (~12 buckets → leaderboard ties, flat
  trend charts), school-shame connotations (a public "D+" stings in a way a 4.2
  doesn't), US-centric. Word labels at the top tiers do the brag job better —
  e.g. **9.0+ = "Career Day"**, 8.0+ = "Heater" — as companions to the number,
  not replacements.
- **Handicap-index collision (minor):** handicap is also a one-decimal number,
  but it's 0–54, always labeled (HCP 12.4), and not on the feed card. Mitigate in
  presentation, below.
- **Presentation rules:** never render as a bare number — always a branded
  chip/pill with tier coloring (color does polarity work at a glance). Pair with
  a golf-native subtitle that teaches the metric: **"+3.1 strokes vs your
  usual"** — the number is for glanceability, the strokes delta is for
  golfer-brain interpretability.

**⚠️ Calibration trap:** anchor the baseline to your *typical* round (median of last
20 differentials), **NOT** your handicap index. The index is best-8-of-20 — your
potential — and the average golfer plays ~3 strokes worse than it on a normal day.
Anchoring to the index makes most rounds score "below average," which is exactly the
discouragement this metric is designed to avoid.

**Why it feeds the social loop:** on the feed, a friend's "94" means nothing unless
you know them; "Dogleg Score 87" instantly tells everyone Mark had a great day. It
makes other people's rounds legible → reactions get easier → the stat feeds the
social loop instead of competing with it.

**Details:**
- **Cold start:** <3 rounds → "Establishing your baseline — N rounds to go" (itself a
  retention hook). Seed from the manually-entered profile handicap if present.
- **Requires a tee** (slope/rating) — same dependency as the handicap index; one more
  reason tee selection must be near-universal.
- **9-hole rounds:** scale/combine per WHS.
- **Accuracy tiers:** simple-mode rounds use raw total; holes-mode rounds get
  net-double-bogey adjusted gross (more accurate — another holes-mode incentive).
- **Where it shows:** feed card, round page, stats-tab trend line, friends
  leaderboard (fair cross-skill competition — the net-leaderboard currency),
  milestone triggers ("Top-3 Dogleg Score this year").
- **Tone / anti-gaming:** display neutrally, celebrate only above thresholds (like
  Strava shows Relative Effort neutrally but celebrates PRs). Cap 0.0–10.0. Self-relative
  scoring makes sandbagging mostly pointless outside leaderboards.
- **Later:** conditions adjustment (PCC-like), weather tag from round enrichment
  (feature #14).

**Naming:** "Dogleg Score" (brandable, like "Relative Effort" / "Sweat Score").

---

## What we're explicitly NOT doing

- **Not stripping social.** Strava has social; it's the moat vs. pure stat trackers.
- **No GPS / shot tracking.** Out of scope; the Dogleg Score is partly the
  compensation — squeezing insight from score + tee data we already capture.
- **No live in-round scoring yet** (feature #15 stays parked — biggest lift, head-on
  with 18Birdies/Golf Gamebook; earn it after the stats foundation).
- **No brand/ads/landing changes until the stat layer ships** — launch the pivot with
  proof, not promises.
