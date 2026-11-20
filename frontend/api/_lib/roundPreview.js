// Link previews for shared rounds (iMessage, WhatsApp, Slack, ...).
//
// Preview bots don't run JavaScript, so the normal app page gives every round
// link the same generic preview. vercel.json sends those bots (and only them)
// to api/og/round.js, which uses the helpers in this file to build a tiny HTML
// page with Open Graph tags for that one round.
//
// This file lives in a folder starting with "_" so Vercel does NOT turn it into
// its own web endpoint; it's only a helper for api/og/round.js.
// Everything here is plain Node (CommonJS) with no dependencies. The pure
// functions are unit-tested in roundPreview.test.js:
//   cd frontend && node --test api/_lib/roundPreview.test.js

const DEFAULT_HOST = 'dogleg.io'
const DEFAULT_TITLE = 'Dogleg.io - The Strava for Golf'
const DEFAULT_DESCRIPTION = 'Track your golf on Dogleg: post rounds, follow friends and see how your game is trending.'
const CALL_TO_ACTION = 'Track your golf on Dogleg'

// Round codes are short codes ("UM6QVL") or round ids (UUIDs). Anything else
// is rejected before it gets anywhere near the database.
const CODE_PATTERN = /^[A-Za-z0-9-]{1,64}$/

function isValidCode(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code)
}

// Makes any text safe to put inside HTML, including attribute values
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"'`]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  }[ch]))
}

// The site's host name for absolute links, from the request's Host header.
// Only a plain host name (with an optional port) is accepted.
function safeHost(rawHost) {
  const host = String(rawHost || '').split(',')[0].trim().toLowerCase()
  if (host.length > 0 && host.length <= 253 && /^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return host
  return DEFAULT_HOST
}

// Only real https:// image links are used for og:image
function safeImageUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

// Same rules as getDisplayName in src/utils/courseNameUtils.js (that file is
// browser code, so it can't be loaded here). Keep the two in step.
function getCourseDisplayName(round) {
  const toProperCase = (str) => {
    if (typeof str !== 'string' || !str) return str
    if (str === str.toUpperCase() && str.length > 2) {
      return str.toLowerCase().split(' ').map((word, index) => {
        if (index > 0 && ['of', 'at', 'the'].includes(word)) return word
        return word.charAt(0).toUpperCase() + word.slice(1)
      }).join(' ')
    }
    return str
  }

  let courseName = toProperCase(typeof round.course_name === 'string' ? round.course_name : '')
  const clubName = toProperCase(typeof round.club_name === 'string' ? round.club_name : '')

  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
    return clubName || 'a golf course'
  }
  if (!clubName) return courseName

  const singleWordsThatNeedCourse = [
    'Old', 'New', 'North', 'South', 'East', 'West',
    'Championship', 'Palmer', 'Club', 'Woodfield',
    'Executive', 'Blue', 'Red', 'Gold', 'Silver',
  ]
  if (singleWordsThatNeedCourse.includes(courseName)) courseName = `${courseName} Course`

  const clean = (name) => name.toLowerCase()
    .replace(/golf|club|country|cc|course|resort|links/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
  const courseWords = clean(courseName).split(' ').filter((w) => w.length > 2)
  const clubWords = clean(clubName).split(' ').filter((w) => w.length > 2)

  if (courseWords.length > 0) {
    const matching = courseWords.filter((word) =>
      clubWords.some((clubWord) => clubWord.includes(word) || word.includes(clubWord))
    )
    if (matching.length / courseWords.length >= 0.7) return clubName
  }

  return `${courseName} @ ${clubName}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-07-04" or "2026-07-04T15:00:00Z" -> "Jul 4, 2026". Uses the date part
// as written, so the day never shifts with the server's time zone.
function formatPlayedDate(playedAt) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(playedAt || ''))
  if (!match) return ''
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return ''
  return `${month} ${Number(match[3])}, ${match[1]}`
}

// strokes_vs_usual > 0 means better than usual (see DoglegScoreChip.js)
function formatStrokesVsUsual(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const abs = Math.abs(n).toFixed(1)
  if (n > 0) return `${abs} strokes better than their usual`
  if (n < 0) return `${abs} strokes off their usual`
  return 'right at their usual'
}

// The text for one round: { title, description }
function describeRound(payload) {
  const round = (payload && payload.round) || {}
  const author = (payload && payload.author) || {}
  const name = (typeof author.username === 'string' && author.username)
    || (typeof author.full_name === 'string' && author.full_name)
    || 'A golfer'
  const course = getCourseDisplayName(round)

  const score = Number(round.total_score)
  const hasScore = Number.isFinite(score) && score > 0
  const nineHoles = Number(round.holes_played) === 9 ? ' (9 holes)' : ''
  const title = hasScore
    ? `${name} shot ${score}${nineHoles} at ${course}`
    : `${name} posted a round at ${course}`

  const parts = []
  const doglegScore = Number(round.dogleg_score)
  if (round.dogleg_score !== null && round.dogleg_score !== undefined && Number.isFinite(doglegScore)) {
    parts.push(`Dogleg Score ${doglegScore.toFixed(1)}/10`)
  }
  const vsUsual = formatStrokesVsUsual(round.strokes_vs_usual)
  if (vsUsual) parts.push(vsUsual)
  const date = formatPlayedDate(round.played_at)
  if (date) parts.push(date)
  parts.push(CALL_TO_ACTION)

  return { title, description: parts.join(' · ') }
}

// The shared HTML skeleton. Every value is escaped here, in one place.
function renderPage({ title, description, url, image, imageIsDefault, noindex }) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const u = escapeHtml(url)
  const i = escapeHtml(image)
  const imageSize = imageIsDefault
    ? '\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">'
    : ''
  const robots = noindex ? '\n<meta name="robots" content="noindex">' : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">${robots}
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="Dogleg">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${i}">${imageSize}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">See this round on Dogleg</a></p>
</body>
</html>
`
}

// Preview page for a round that get_public_round returned
function buildRoundPreviewHtml({ payload, host, code }) {
  const safeSiteHost = safeHost(host)
  const round = (payload && payload.round) || {}
  const { title, description } = describeRound(payload)

  // Prefer the short code for the link, like the app's Share button does
  const linkCode = [round.short_code, round.id, code].find(isValidCode) || ''
  const url = `https://${safeSiteHost}/rounds/${encodeURIComponent(linkCode)}`

  const photo = safeImageUrl(round.photo_url)
  return renderPage({
    title,
    description,
    url,
    image: photo || `https://${safeSiteHost}/og-image.png`,
    imageIsDefault: !photo,
    noindex: false,
  })
}

// Generic Dogleg preview: bad code, private/removed round, or any failure.
// It says nothing about whether the round exists.
function buildGenericPreviewHtml({ host, code } = {}) {
  const safeSiteHost = safeHost(host)
  const url = isValidCode(code)
    ? `https://${safeSiteHost}/rounds/${encodeURIComponent(code)}`
    : `https://${safeSiteHost}/`
  return renderPage({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url,
    image: `https://${safeSiteHost}/og-image.png`,
    imageIsDefault: true,
    noindex: true,
  })
}

// Asks Supabase for the public view of one round (the get_public_round
// database function). Resolves to the result, or null when the round isn't
// available, the settings are missing, or anything goes wrong.
async function fetchPublicRound(code, {
  fetchImpl = typeof fetch === 'function' ? fetch : null, // built into Node 18+
  env = process.env,
  timeoutMs = 2000,
} = {}) {
  const supabaseUrl = env.REACT_APP_SUPABASE_URL
  const anonKey = env.REACT_APP_SUPABASE_ANON_KEY
  if (!isValidCode(code) || !supabaseUrl || !anonKey || typeof fetchImpl !== 'function') return null

  try {
    const response = await fetchImpl(`${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/rpc/get_public_round`, {
      method: 'POST',
      // The public anon key, the same one the website ships to every browser
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_code: code }),
      // Bots give up on slow pages, so don't wait long for the database
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    const data = await response.json()
    return data && typeof data === 'object' && data.round && typeof data.round === 'object' ? data : null
  } catch {
    return null
  }
}

module.exports = {
  isValidCode,
  escapeHtml,
  safeHost,
  safeImageUrl,
  getCourseDisplayName,
  formatPlayedDate,
  formatStrokesVsUsual,
  describeRound,
  buildRoundPreviewHtml,
  buildGenericPreviewHtml,
  fetchPublicRound,
}
