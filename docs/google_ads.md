# 📣 Dogleg — Google Ads: Source of Truth (stats-first)

**Updated July 5, 2026.** Positioning is now stats-first: **"The Strava for golf"** —
auto handicap, Dogleg Score, stats, with the social feed as the moat. The landing
page hero reads *"Strava for golf. Track every round. Watch your handicap drop."*,
so the stat-intent copy below is aligned with the page it lands on.

The social-first Search campaign (June 2026) is retired for Google Search; its
creative moves to Meta/Instagram. It's preserved in the appendix at the bottom.

All character counts respect Google Ads limits
(headlines ≤30, descriptions ≤90, callouts ≤25, paths ≤15).

---

## Launch checklist (in order)

1. **Conversion plumbing** — see Measurement below. Code ships the events;
   GA4/Ads need ~10 minutes of clicking. Do this before touching campaigns.
2. **Remove the `handicap` account-level negative keyword.** It was added when
   we had no handicap feature; it now blocks exactly our best traffic.
3. **Add the GHIN navigational negatives** (exact match — see Negatives).
4. Build the three new ad groups (Handicap intent, Golf stats, Strava-for-golf),
   re-copy the Scorecard ad group, **pause the Social golf ad group** on Search.
5. Replace RSAs with the headlines/descriptions below.
6. Settings sanity pass: Search network only, no Display Expansion, phrase/exact
   only, "Presence" location targeting.
7. Week 1+: search-terms report → negatives; watch `sign_up` by ad group.

---

## Measurement (do this BEFORE spending)

**In code (shipped July 5, 2026):**
- `sign_up` — fired in `frontend/src/components/UsernameSetup.js` when a new
  account finishes choosing a username (the one screen every signup passes
  through exactly once, email and OAuth alike). Param: `method`.
- `post_round` — fired in `frontend/src/services/roundsService.js` after a
  round successfully saves. Param: `entry_mode` (`holes`/`total`).
- Both go through `frontend/src/services/ga.js` → the GA4 tag
  (`G-5H72L3N9MF` in `public/index.html`).

**In GA4 (analytics.google.com):**
1. Admin → Data display → Events: wait for `sign_up` to appear after the first
   post-deploy signup (or fire a test signup), then toggle **Mark as key event**.
   Do the same for `post_round`.
2. Admin → Product links → **Google Ads links** → link the Ads account.

**In Google Ads:**
3. Goals → Conversions → New conversion action → **Import** → GA4 →
   `sign_up` = **Primary** (bidding optimizes to this), `post_round` =
   **Secondary** (observed — it's the "did the signup become a golfer" signal).
4. Account settings → **Auto-tagging: ON** (GCLID is how GA4 credits Ads).
5. Verify end-to-end with GA4 DebugView or Tag Assistant before launch.

---

## Campaign structure

| Campaign | Ad group | Angle |
|---|---|---|
| Search — Core | 1. Handicap intent **(new)** | The anchor feature: automatic WHS-style handicap |
| Search — Core | 2. Golf stats intent **(new)** | Stat/score tracking searches |
| Search — Core | 3. Strava-for-golf **(new)** | People literally asking for this product |
| Search — Core | 4. Scorecard intent (kept) | High-volume generic, answered with stats copy |
| Search — Core | ~~Social golf~~ | **Paused** — creative moves to Meta (appendix) |
| Search — Brand | 5. Brand | "dogleg app" navigational searches |

Final URL for everything: `https://dogleg.io`
Display path: `dogleg.io/golf/handicap` (path1: `golf`, path2: `handicap`)

---

## Responsive Search Ad — headlines (≤30 chars)

Use up to 15 per RSA, unpinned except Brand (pin #15 to position 1 there).

| # | Headline | Chars |
|---|---|---|
| 1 | Your Handicap, Automatic | 24 |
| 2 | The Strava For Golf | 19 |
| 3 | Every Round Gets A Score | 24 |
| 4 | Track Rounds In 30 Seconds | 26 |
| 5 | Free Golf Handicap Tracker | 26 |
| 6 | Watch Your Handicap Drop | 24 |
| 7 | A Real Handicap, No GHIN Fee | 28 |
| 8 | Golf Stats From Any Round | 25 |
| 9 | No GPS Or Sensors Needed | 24 |
| 10 | See Your Scoring Trends | 23 |
| 11 | Track Every Golf Round | 22 |
| 12 | Your Golf Group, One Feed | 25 |
| 13 | Follow Your Buddies' Rounds | 27 |
| 14 | 22,000+ Courses Built In | 24 |
| 15 | Dogleg: The Golf Stats App | 26 |

**Trademark caution:** "The Strava For Golf" (#2) is fine as a *keyword* but can
be disapproved as ad text if Strava has a trademark complaint on file with
Google. Run **two RSAs per ad group** — one including #2, one without — so a
disapproval never takes an ad group dark. If it's disapproved, drop #2 and move on.

## Responsive Search Ad — descriptions (≤90 chars)

| # | Description | Chars |
|---|---|---|
| 1 | Post a round in 30 seconds. Get an automatic handicap and a 0-10 score for every round. | 87 |
| 2 | A real WHS-style handicap from rounds you post — no GPS watch, no sensors, no GHIN fee. | 87 |
| 3 | Every round gets a 0-10 Dogleg Score — spot career days at a glance, at any skill level. | 88 |
| 4 | Follow your friends' rounds, drop reactions, and pile into the comments. Free to join. | 86 |

*(An earlier draft of #1 ending in ", and more." was 94 chars — over the 90
limit despite being labeled 89. This version is counted at 87.)*

## Assets (extensions)

**Callouts (≤25):** `Free to join` · `Automatic handicap` · `Real WHS-style index` ·
`22,000+ courses` · `Post in 30 seconds` · `Works on any phone`

**Sitelinks:** `Create Free Account` → dogleg.io/login ·
`See How It Works` → dogleg.io

*Sitelinks are thin because course pages (`/courses/:courseId`) and round pages
(`/rounds/:code`) sit behind login (`ProtectedRoute` in `App.js`). Making course
pages public would unlock "Find Your Course" sitelinks AND the SEO surface the
pivot plan calls for (plan item #5) — highest-leverage ads follow-up we have.*

---

## Keywords

Phrase + exact only. No broad match until smart bidding has conversion history.

### Ad group 1 — Handicap intent (the anchor)
```
"golf handicap tracker"
"golf handicap app"
"free golf handicap calculator"
"golf handicap calculator app"
"app to track golf handicap"
"handicap without ghin"
"golf handicap without joining a club"
```

### Ad group 2 — Golf stats intent
```
"golf stat tracker"
"golf stats app"
"golf stat tracking app"
"app to track golf stats"
"golf score tracker"
"golf round tracker"
```

### Ad group 3 — Strava-for-golf
```
[strava for golf]
[strava golf]
"golf app like strava"
"strava for golfers"
```

### Ad group 4 — Scorecard intent (kept from the social campaign)
```
"golf scorecard app"
"free golf scorecard app"
"golf score app"
"app to keep golf scores"
"digital golf scorecard"
```

### Ad group 5 — Brand
```
[dogleg app]
[dogleg golf app]
[dogleg io]
```
Brand caution: "dogleg" is also a generic golf term. Keep these as **negatives
on the Brand campaign**: `what is`, `meaning`, `definition`, `hole`, `left`, `right`.

---

## Negative keywords (account level)

**REMOVE:** ~~`handicap`~~ — the July 2026 flip switch. The feature is live;
this negative blocks ad groups 1 and most of 2.

**ADD (exact match only):** `[ghin]`, `[ghin login]`, `[ghin app]`,
`[ghin golf]`, `[usga ghin]` — navigational searches for GHIN itself. Exact
match keeps them from blocking our own `"handicap without ghin"` keyword.

**KEEP everything else:**
```
gps               (still no GPS/shot tracking — searchers wanting it will bounce)
rangefinder
simulator
lessons
swing
launch monitor
clubs for sale
tee time
tee times
booking
disc golf
mini golf
topgolf
top golf
video game
ps5
xbox
jobs
betting
```

---

## Bidding, budget & settings

- **Networks:** Search only. Untick "Display Network" AND "Search partners" at
  creation (both are opt-out checkboxes).
- **Location:** United States, with "Presence: people in or regularly in" —
  not the default presence-or-interest. Language: English.
- **Phase A (launch):** Maximize Clicks with a max CPC ceiling (~$1.50–2.50).
  If the daily budget is small (<$20/day), run ONLY ad group 1 (Handicap
  intent) + Brand until there's conversion volume — concentrated data beats
  thin coverage.
- **Phase B:** once GA4-imported `sign_up` hits ~15–30 conversions in 30 days,
  switch to Maximize Conversions; add a tCPA only after it has a stable CPA to
  anchor to.
- **Devices:** all (mobile-first product; review the split after two weeks
  rather than presetting adjustments).

## Weekly hygiene

- Search terms report → add negatives (expect junk like "ghin number lookup",
  "handicap parking permit" — yes, really; add `parking` if it shows up).
- Watch `sign_up` conversion rate **by ad group**; expect Handicap intent to
  win. Reallocate budget toward winners monthly.
- Watch the `post_round`/`sign_up` ratio per campaign — a campaign that buys
  signups who never post a round is buying the wrong golfers.
- Keep Ad Strength at "Good"+ but never sacrifice message accuracy for it.

## Channel note

Search captures **solo/stat intent** — someone who wants a handicap or stat
tracker today. The "your buddies are on it" angle stays the growth loop on
Meta/Instagram and r/golf, where the share-card graphics are the creative.
Search sells the stats; social sells the friends.

---

---

# Appendix — social-first creative (retired from Search, June 2026)

Kept for the Meta channel and for history. Everything below is the pre-pivot
campaign; do not run it on Google Search.

## RSA headlines (≤30)

| # | Headline | Chars |
|---|---|---|
| 1 | Follow Your Buddies' Rounds | 27 |
| 2 | The Social Golf Scorecard | 25 |
| 3 | See Every Round They Play | 25 |
| 4 | React & Comment on Rounds | 25 |
| 5 | Your Golf Group, One Feed | 25 |
| 6 | Post a Round in 30 Seconds | 26 |
| 7 | 22,000+ Courses Built In | 24 |
| 8 | Free Golf Scorecard App | 23 |
| 9 | Share Scorecards Anywhere | 25 |
| 10 | Golf Is Better With Friends | 27 |
| 11 | The Group Chat For Golf | 23 |
| 12 | Never Miss a Buddy's Round | 26 |
| 13 | Keep Score. Talk Trash. | 23 |
| 14 | Trash Talk With Receipts | 24 |
| 15 | Dogleg: Social Golf App | 23 |

## RSA descriptions (≤90)

| # | Description | Chars |
|---|---|---|
| 1 | Follow your friends' rounds, drop reactions, and pile into the comments. Free to join. | 86 |
| 2 | Post a round in under 30 seconds — 22,000+ courses, photos, captions, full scorecards. | 86 |
| 3 | Every round becomes a clean scorecard graphic, ready for Instagram or the group chat. | 85 |
| 4 | Golf doesn't end on 18. See every round your buddies play — and never miss a brag. | 82 |

## Keywords — Social golf ad group (paused on Search)
```
"golf app for friends"
"social golf app"
"golf with friends app"
"share golf scores with friends"
"app to share golf rounds"
"golf group app"
"golf buddies app"
[golf social network]
```
