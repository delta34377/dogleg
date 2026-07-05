# 📣 Dogleg — Google Ads Copy & Keywords

> ## ⚠️ POSITIONING FLIPPED (July 5, 2026) — account restructure needed
> The product and landing page are now stats-first: **"The Strava for golf"**
> (auto handicap, Dogleg Score, stats + the social feed). The social-first
> campaign below is SUPERSEDED for Google Search. To-do in the ads account:
> 1. **Remove the `handicap` account-level negative keyword** (the feature
>    exists now — that traffic is exactly who we want).
> 2. Add a stat-intent ad group: `"golf handicap tracker"`,
>    `"golf handicap app"`, `"free golf handicap calculator"`,
>    `"golf stat tracker"`, `"golf stats app"`, `[strava for golf]`.
> 3. New RSA headlines (≤30 chars): `Your Handicap, Automatic` (24) ·
>    `The Strava For Golf` (19) · `Every Round Gets A Score` (24) ·
>    `Track Rounds In 30 Seconds` (26) · `Free Golf Handicap Tracker` (26) ·
>    `Watch Your Handicap Drop` (24).
> 4. New description (≤90): `Post a round in 30 seconds. Get an automatic
>    handicap, a 0-10 score for every round, and more.` (89)
> 5. Keep the friends-angle creative for Meta/Instagram — social is still the
>    growth loop; Search now sells stats.

*(Original social-first campaign below, kept for the Meta channel and history.)*

Source of truth for the Google Ads account (updated June 2026).
**Positioning: social-first.** We sell "follow, react to, and comment on your friends'
rounds" — NOT stat tracking. Avoid "track your stats," "improve your game," "handicap,"
and "Strava" framing in ad copy. The landing page (dogleg.io) was updated to match this
message, so ad → page relevance is aligned.

All character counts respect Google Ads limits
(headlines ≤30, descriptions ≤90, callouts ≤25, paths ≤15).

---

## Campaign structure

| Campaign | Ad group | Angle |
|---|---|---|
| Search — Core | 1. Social golf | The differentiated pitch (friends, feed, comments) |
| Search — Core | 2. Scorecard intent | High-volume generic searches, answered with social copy |
| Search — Brand | 3. Brand | "dogleg app" navigational searches |

Final URL for everything: `https://dogleg.io`
Display path: `dogleg.io/golf/with-friends` (path1: `golf`, path2: `with-friends`)

---

## Responsive Search Ad — headlines (≤30 chars)

Use up to 15 per RSA. Mix and match across both non-brand ad groups.

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

Pin #15 to position 1 in the Brand ad group only; leave everything unpinned elsewhere.

## Responsive Search Ad — descriptions (≤90 chars)

| # | Description | Chars |
|---|---|---|
| 1 | Follow your friends' rounds, drop reactions, and pile into the comments. Free to join. | 86 |
| 2 | Post a round in under 30 seconds — 22,000+ courses, photos, captions, full scorecards. | 86 |
| 3 | Every round becomes a clean scorecard graphic, ready for Instagram or the group chat. | 85 |
| 4 | Golf doesn't end on 18. See every round your buddies play — and never miss a brag. | 82 |

## Assets (extensions)

**Callouts (≤25):** `Free to join` · `22,000+ courses` · `Post in 30 seconds` ·
`Built for the group chat` · `Works on any phone`

**Sitelinks:** `Create Free Account` → dogleg.io/login ·
`See How It Works` → dogleg.io
*(Add more once public course pages / a sample shared round page exist — see
feature_ideas.md #5. A "See a Real Scorecard" sitelink to a shared round URL
would be strong.)*

---

## Keywords

### Ad group 1 — Social golf (the differentiated angle)
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

### Ad group 2 — Scorecard intent (high volume, generic)
```
"golf scorecard app"
"free golf scorecard app"
"golf score app"
"app to keep golf scores"
"digital golf scorecard"
"golf score tracker"
```
Note: "golf score tracker" stays even though our messaging isn't tracker-led — the
search intent (log my scores) is something Dogleg does; we just answer it with
social-flavored copy.

### Ad group 3 — Brand
```
[dogleg app]
[dogleg golf app]
[dogleg io]
```
Brand caution: "dogleg" is also a generic golf term. Add these as **negatives on the
Brand campaign**: `what is`, `meaning`, `definition`, `hole`, `left`, `right`.

### Negative keywords (account level)
```
handicap          (searchers want GHIN/USGA index — we don't offer auto handicap yet;
                   REMOVE this negative when the handicap feature ships)
gps
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

## Channel note

Search ads capture **solo intent** (someone looking for a scorecard app). The
"your buddies are on it" angle inherently performs better on social channels —
Meta/Instagram and r/golf — where the existing share-card graphics are ready-made
creative. Treat Google Search as the intent-capture net, and the social channels as
the place to sell the friends angle. (Per the growth plan in readme.md: ProductHunt,
golf subreddits, Facebook golf groups.)

## Measurement

GA4 is already installed (`G-5H72L3N9MF` in `frontend/public/index.html`). Before
spending: mark a `sign_up` event as a conversion in GA4, link GA4 ↔ Google Ads, and
import that conversion so campaigns can optimize toward signups rather than clicks.
