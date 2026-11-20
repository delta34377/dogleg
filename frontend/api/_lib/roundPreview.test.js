// Tests for the link-preview helpers and the api/og/round.js function.
// Plain Node, no packages needed. Run from the frontend folder with:
//   node --test api/_lib/roundPreview.test.js
// (The app's own `npm test` only looks inside src/, so it doesn't run these.)

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isValidCode,
  escapeHtml,
  safeHost,
  safeImageUrl,
  formatPlayedDate,
  describeRound,
  buildRoundPreviewHtml,
  buildGenericPreviewHtml,
  fetchPublicRound,
} = require('./roundPreview')
const handler = require('../og/round')

const samplePayload = () => ({
  round: {
    id: '0b7c6a52-4a0e-4bb4-9d8a-1f6f2d3c4b5a',
    short_code: 'UM6QVL',
    user_id: 'user-1',
    total_score: 79,
    course_name: 'Pebble Creek',
    club_name: 'Pebble Creek Golf Club',
    played_at: '2026-07-04',
    dogleg_score: 8.25,
    strokes_vs_usual: 4.3,
    photo_url: 'https://abc.supabase.co/storage/v1/object/public/round-photos/x.jpg',
  },
  author: { id: 'user-1', username: 'alex_fairway', full_name: 'Alex', avatar_url: null },
  reactions: { fire: 2 },
  comment_count: 0,
  comments: [],
})

// Pulls the content="" of one <meta property|name="..."> tag
const metaContent = (html, key) => {
  const match = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)
  return match ? match[1] : null
}

test('isValidCode accepts short codes and UUIDs only', () => {
  assert.equal(isValidCode('UM6QVL'), true)
  assert.equal(isValidCode('0b7c6a52-4a0e-4bb4-9d8a-1f6f2d3c4b5a'), true)
  assert.equal(isValidCode(''), false)
  assert.equal(isValidCode('a'.repeat(65)), false)
  assert.equal(isValidCode('abc def'), false)
  assert.equal(isValidCode('abc"><script>'), false)
  assert.equal(isValidCode('../etc'), false)
  assert.equal(isValidCode(undefined), false)
  assert.equal(isValidCode(['UM6QVL']), false)
})

test('escapeHtml escapes every HTML-special character', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&\``), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;')
  assert.equal(escapeHtml(null), '')
})

test('safeHost keeps real host names and rejects junk', () => {
  assert.equal(safeHost('dogleg.io'), 'dogleg.io')
  assert.equal(safeHost('Dogleg-Git-Main.vercel.app'), 'dogleg-git-main.vercel.app')
  assert.equal(safeHost('localhost:3000'), 'localhost:3000')
  assert.equal(safeHost('a.com, b.com'), 'a.com')
  assert.equal(safeHost('evil.com/"><script>'), 'dogleg.io')
  assert.equal(safeHost(undefined), 'dogleg.io')
})

test('safeImageUrl only allows https links', () => {
  assert.equal(safeImageUrl('https://x.supabase.co/a.jpg'), 'https://x.supabase.co/a.jpg')
  assert.equal(safeImageUrl('http://x.supabase.co/a.jpg'), null)
  // eslint-disable-next-line no-script-url -- checking that this kind of link is refused
  assert.equal(safeImageUrl('javascript:alert(1)'), null)
  assert.equal(safeImageUrl('not a url'), null)
  assert.equal(safeImageUrl(null), null)
})

test('formatPlayedDate uses the date as written', () => {
  assert.equal(formatPlayedDate('2026-07-04'), 'Jul 4, 2026')
  assert.equal(formatPlayedDate('2026-01-31T23:30:00-08:00'), 'Jan 31, 2026')
  assert.equal(formatPlayedDate('garbage'), '')
  assert.equal(formatPlayedDate(null), '')
})

test('describeRound builds the title and description', () => {
  const { title, description } = describeRound(samplePayload())
  assert.equal(title, 'alex_fairway shot 79 at Pebble Creek Golf Club')
  assert.equal(
    description,
    'Dogleg Score 8.3/10 · 4.3 strokes better than their usual · Jul 4, 2026 · Track your golf on Dogleg'
  )
})

test('describeRound copes with missing pieces', () => {
  const { title, description } = describeRound({
    round: { id: 'x', total_score: 42, holes_played: 9, course_name: 'North', club_name: 'Lakeside CC', strokes_vs_usual: -2 },
    author: { full_name: 'Sam' },
  })
  assert.equal(title, 'Sam shot 42 (9 holes) at North Course @ Lakeside CC')
  assert.equal(description, '2.0 strokes off their usual · Track your golf on Dogleg')

  assert.equal(describeRound({ round: { id: 'x' } }).title, 'A golfer posted a round at a golf course')
})

test('buildRoundPreviewHtml fills in the Open Graph and Twitter tags', () => {
  const html = buildRoundPreviewHtml({ payload: samplePayload(), host: 'dogleg.io', code: 'UM6QVL' })
  assert.equal(metaContent(html, 'og:title'), 'alex_fairway shot 79 at Pebble Creek Golf Club')
  assert.match(metaContent(html, 'og:description'), /^Dogleg Score 8\.3\/10/)
  assert.equal(metaContent(html, 'og:url'), 'https://dogleg.io/rounds/UM6QVL')
  assert.equal(metaContent(html, 'og:type'), 'website')
  assert.equal(metaContent(html, 'og:image'), 'https://abc.supabase.co/storage/v1/object/public/round-photos/x.jpg')
  assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image')
  assert.match(html, /<link rel="canonical" href="https:\/\/dogleg\.io\/rounds\/UM6QVL">/)
  assert.match(html, /<a href="https:\/\/dogleg\.io\/rounds\/UM6QVL">/)
})

// DEPLOY-2: round pages are shared by link, not listed in search results
// under the golfer's name. The preview tags above are still all there.
test('buildRoundPreviewHtml asks search engines not to index the round', () => {
  const html = buildRoundPreviewHtml({ payload: samplePayload(), host: 'dogleg.io', code: 'UM6QVL' })
  assert.equal(metaContent(html, 'robots'), 'noindex')
  assert.equal((html.match(/<meta name="robots"/g) || []).length, 1)
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:image']) {
    assert.ok(metaContent(html, key), `still has ${key}`)
  }
})

test('buildRoundPreviewHtml falls back to the default image and the id', () => {
  const payload = samplePayload()
  payload.round.photo_url = null
  payload.round.short_code = null
  const html = buildRoundPreviewHtml({ payload, host: 'preview.vercel.app', code: payload.round.id })
  assert.equal(metaContent(html, 'og:image'), 'https://preview.vercel.app/og-image.png')
  assert.equal(metaContent(html, 'og:image:width'), '1200')
  assert.equal(metaContent(html, 'og:url'), `https://preview.vercel.app/rounds/${payload.round.id}`)
})

test('buildRoundPreviewHtml escapes user-controlled text', () => {
  const payload = samplePayload()
  payload.author.username = '"><script>alert(1)</script>'
  payload.round.course_name = '<img src=x onerror=alert(1)>'
  payload.round.club_name = null
  payload.round.photo_url = 'https://x.co/a.jpg"><script>alert(2)</script>'
  const html = buildRoundPreviewHtml({ payload, host: 'dogleg.io', code: 'UM6QVL' })
  assert.doesNotMatch(html, /<script/)
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('buildGenericPreviewHtml says nothing about the round', () => {
  const html = buildGenericPreviewHtml({ host: 'dogleg.io', code: 'UM6QVL' })
  assert.equal(metaContent(html, 'og:title'), 'Dogleg.io - The Strava for Golf')
  assert.equal(metaContent(html, 'og:image'), 'https://dogleg.io/og-image.png')
  assert.equal(metaContent(html, 'og:url'), 'https://dogleg.io/rounds/UM6QVL')
  assert.match(html, /noindex/)

  const bad = buildGenericPreviewHtml({ host: 'dogleg.io', code: '"><x' })
  assert.equal(metaContent(bad, 'og:url'), 'https://dogleg.io/')
})

test('fetchPublicRound calls the RPC with the anon key and returns the result', async () => {
  let seen
  const fakeFetch = async (url, options) => {
    seen = { url, options }
    return { ok: true, json: async () => samplePayload() }
  }
  const env = { REACT_APP_SUPABASE_URL: 'https://abc.supabase.co/', REACT_APP_SUPABASE_ANON_KEY: 'anon-key' }
  const result = await fetchPublicRound('UM6QVL', { fetchImpl: fakeFetch, env })

  assert.equal(result.round.short_code, 'UM6QVL')
  assert.equal(seen.url, 'https://abc.supabase.co/rest/v1/rpc/get_public_round')
  assert.equal(seen.options.method, 'POST')
  assert.equal(seen.options.headers.apikey, 'anon-key')
  assert.equal(seen.options.headers.Authorization, 'Bearer anon-key')
  assert.equal(seen.options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(seen.options.body), { p_code: 'UM6QVL' })
  assert.ok(seen.options.signal, 'request has a timeout signal')
})

test('fetchPublicRound returns null on not found, errors, bad codes and missing settings', async () => {
  const env = { REACT_APP_SUPABASE_URL: 'https://abc.supabase.co', REACT_APP_SUPABASE_ANON_KEY: 'k' }
  const nullBody = async () => ({ ok: true, json: async () => null })
  const notFound = async () => ({ ok: false, status: 404, json: async () => ({ message: 'no function' }) })
  const throws = async () => { throw new Error('network down') }
  let called = false
  const spy = async () => { called = true; return { ok: true, json: async () => samplePayload() } }

  assert.equal(await fetchPublicRound('UM6QVL', { fetchImpl: nullBody, env }), null)
  assert.equal(await fetchPublicRound('UM6QVL', { fetchImpl: notFound, env }), null)
  assert.equal(await fetchPublicRound('UM6QVL', { fetchImpl: throws, env }), null)
  assert.equal(await fetchPublicRound('bad code!', { fetchImpl: spy, env }), null)
  assert.equal(await fetchPublicRound('UM6QVL', { fetchImpl: spy, env: {} }), null)
  assert.equal(called, false, 'never calls the database for a bad code or missing settings')
})

test('fetchPublicRound gives up after the timeout', async () => {
  const env = { REACT_APP_SUPABASE_URL: 'https://abc.supabase.co', REACT_APP_SUPABASE_ANON_KEY: 'k' }
  // A fetch that only ever finishes by being aborted
  const hangs = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason))
  })
  // The timeout's timer doesn't keep Node running by itself (a real request's
  // open connection would), so hold the test open meanwhile
  const keepAlive = setTimeout(() => {}, 5000)
  const started = Date.now()
  assert.equal(await fetchPublicRound('UM6QVL', { fetchImpl: hangs, env, timeoutMs: 50 }), null)
  clearTimeout(keepAlive)
  assert.ok(Date.now() - started < 1000)
})

// A minimal stand-in for Node's response object
function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(body) { this.body = body },
  }
}

test('handler answers 200 with round tags when the round is public', async (t) => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  process.env.REACT_APP_SUPABASE_URL = 'https://abc.supabase.co'
  process.env.REACT_APP_SUPABASE_ANON_KEY = 'k'
  global.fetch = async () => ({ ok: true, json: async () => samplePayload() })

  const res = fakeResponse()
  await handler({ query: { code: 'UM6QVL' }, headers: { host: 'dogleg.io' }, url: '/api/og/round?code=UM6QVL' }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'public, s-maxage=300')
  assert.equal(metaContent(res.body, 'og:title'), 'alex_fairway shot 79 at Pebble Creek Golf Club')
  assert.equal(metaContent(res.body, 'robots'), 'noindex')
})

test('handler never fails: generic tags with 200 when the database is down', async (t) => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  process.env.REACT_APP_SUPABASE_URL = 'https://abc.supabase.co'
  process.env.REACT_APP_SUPABASE_ANON_KEY = 'k'
  global.fetch = async () => { throw new Error('boom') }

  const res = fakeResponse()
  // No req.query here: the code is read from the URL instead
  await handler({ headers: { 'x-forwarded-host': 'dogleg.io' }, url: '/api/og/round?code=UM6QVL' }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(metaContent(res.body, 'og:title'), 'Dogleg.io - The Strava for Golf')
  assert.equal(metaContent(res.body, 'og:url'), 'https://dogleg.io/rounds/UM6QVL')

  const bad = fakeResponse()
  await handler({ query: { code: '<script>' }, headers: {}, url: '/api/og/round' }, bad)
  assert.equal(bad.statusCode, 200)
  assert.equal(metaContent(bad.body, 'og:url'), 'https://dogleg.io/')
})

// vercel.json sends only link-preview bots to the preview function. Vercel
// matches the whole header value, like the anchored regex below.
test('vercel.json bot rule matches preview bots and not people', () => {
  const config = require('../../vercel.json')
  const [botRule, spaFallback] = config.rewrites
  const pattern = new RegExp(`^${botRule.has[0].value}$`)

  const bots = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'WhatsApp/2.23.20.0 A',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Pinterest/0.2 (+http://www.pinterest.com/bot.html)',
    'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)',
    'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
    'Iframely/1.3.1 (+https://iframely.com/docs/about)',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5',
    'vkShare; +http://vk.com/dev/Share',
  ]
  const people = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0]',
    // Pinterest's in-app browser: a person, so plain "Pinterest" isn't in the list
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.60',
    '',
  ]
  for (const ua of bots) assert.ok(pattern.test(ua), `should match bot: ${ua}`)
  for (const ua of people) assert.ok(!pattern.test(ua), `should not match person: ${ua}`)

  assert.equal(botRule.source, '/rounds/:code')
  assert.equal(botRule.destination, '/api/og/round?code=:code')
  // The last rule keeps deep links like /profile/x working for people
  assert.deepEqual(spaFallback, { source: '/(.*)', destination: '/index.html' })
  assert.equal(config.rewrites.length, 2)
})

// DEPLOY-2: every response for /rounds/... (the app page people get, and the
// preview page bots get through the rewrite above) carries X-Robots-Tag:
// noindex. Header rules are matched on the path that was asked for, before
// any rewrite, and don't change where the request goes.
test('vercel.json sends X-Robots-Tag: noindex on round pages only', () => {
  const config = require('../../vercel.json')
  assert.ok(Array.isArray(config.headers), 'vercel.json has a headers list')
  const robotsRules = config.headers.filter((rule) =>
    rule.headers.some((h) => h.key.toLowerCase() === 'x-robots-tag'))
  assert.equal(robotsRules.length, 1)
  const [rule] = robotsRules
  assert.equal(rule.source, '/rounds/(.*)')
  assert.equal(rule.has, undefined, 'applies to every visitor, not only bots')
  assert.deepEqual(rule.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }])

  // The source is a path-to-regexp pattern; "(.*)" is a plain regex group, so
  // this is how it matches the requested path
  const pattern = new RegExp(`^${rule.source}$`)
  for (const path of ['/rounds/UM6QVL', '/rounds/0b7c6a52-4a0e-4bb4-9d8a-1f6f2d3c4b5a']) {
    assert.ok(pattern.test(path), `noindex on ${path}`)
  }
  for (const path of ['/', '/feed', '/profile/alex_fairway', '/privacy', '/rounds']) {
    assert.ok(!pattern.test(path), `no noindex on ${path}`)
  }
})
