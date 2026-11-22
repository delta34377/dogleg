// Tests for the invite link previews and the api/og/invite.js function.
// Plain Node, no packages needed. Run from the frontend folder with:
//   node --test api/_lib/invitePreview.test.js

const test = require('node:test')
const assert = require('node:assert/strict')
const { isValidInviteUsername, buildInvitePreviewHtml, INVITE_DESCRIPTION } = require('./invitePreview')
const handler = require('../og/invite')

// Pulls the content="" of one <meta property|name="..."> tag
const metaContent = (html, key) => {
  const match = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)
  return match ? match[1] : null
}

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

test('isValidInviteUsername accepts usernames only', () => {
  for (const ok of ['alex_fairway', 'abc', 'a'.repeat(20), 'Golfer_99']) {
    assert.equal(isValidInviteUsername(ok), true, ok)
  }
  for (const bad of ['', 'ab', 'a'.repeat(21), 'alex fairway', 'alex.fairway', 'alex-f', '<script>', '"><img', '../etc', 'émile', undefined, null, 42, ['alex_fairway']]) {
    assert.equal(isValidInviteUsername(bad), false, String(bad))
  }
})

test('buildInvitePreviewHtml names the inviter in the preview tags', () => {
  const html = buildInvitePreviewHtml({ host: 'www.dogleg.io', username: 'alex_fairway' })
  assert.equal(metaContent(html, 'og:title'), 'Join @alex_fairway on Dogleg')
  assert.equal(metaContent(html, 'twitter:title'), 'Join @alex_fairway on Dogleg')
  assert.equal(metaContent(html, 'og:description'), INVITE_DESCRIPTION.replace(/'/g, '&#39;'))
  assert.equal(metaContent(html, 'og:url'), 'https://www.dogleg.io/join/alex_fairway')
  assert.equal(metaContent(html, 'og:image'), 'https://www.dogleg.io/og-image.png')
  assert.equal(metaContent(html, 'og:image:width'), '1200')
  assert.equal(metaContent(html, 'og:image:height'), '630')
  assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image')
  assert.equal(metaContent(html, 'robots'), 'noindex')
  assert.match(html, /<title>Join @alex_fairway on Dogleg<\/title>/)
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.dogleg\.io\/join\/alex_fairway">/)
})

test('the description matches the landing page pitch', () => {
  assert.match(INVITE_DESCRIPTION, /Strava for golf/)
  assert.match(INVITE_DESCRIPTION, /handicap/)
  assert.match(INVITE_DESCRIPTION, /Dogleg Score/)
})

test('a bad username gets the generic Dogleg preview and never reaches the page', () => {
  for (const username of ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'ab', '', undefined, 'a b']) {
    const html = buildInvitePreviewHtml({ host: 'www.dogleg.io', username })
    assert.equal(metaContent(html, 'og:title'), 'Dogleg.io - The Strava for Golf')
    assert.equal(metaContent(html, 'og:url'), 'https://www.dogleg.io/')
    assert.equal(metaContent(html, 'robots'), 'noindex')
    assert.ok(!html.includes('<script'), 'no script tag')
    assert.ok(!html.includes('<img'), 'no img tag')
    assert.ok(!html.includes('onerror'), 'nothing from the username')
  }
})

test('a junk host falls back to dogleg.io', () => {
  const html = buildInvitePreviewHtml({ host: 'evil.com/"><script>', username: 'alex_fairway' })
  assert.equal(metaContent(html, 'og:url'), 'https://dogleg.io/join/alex_fairway')
  assert.equal(metaContent(html, 'og:image'), 'https://dogleg.io/og-image.png')
  assert.ok(!html.includes('<script'))
})

test('handler answers 200 with the invite preview', () => {
  const res = fakeResponse()
  handler({ query: { username: 'alex_fairway' }, headers: { host: 'www.dogleg.io' }, url: '/api/og/invite?username=alex_fairway' }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'public, s-maxage=86400')
  assert.equal(metaContent(res.body, 'og:title'), 'Join @alex_fairway on Dogleg')
  assert.equal(metaContent(res.body, 'og:url'), 'https://www.dogleg.io/join/alex_fairway')
  assert.equal(metaContent(res.body, 'robots'), 'noindex')
})

test('handler reads the username from the URL and prefers the forwarded host', () => {
  const res = fakeResponse()
  // No req.query here: the username is read from the URL instead
  handler({ headers: { 'x-forwarded-host': 'www.dogleg.io', host: 'internal' }, url: '/api/og/invite?username=pal_99' }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(metaContent(res.body, 'og:title'), 'Join @pal_99 on Dogleg')
  assert.equal(metaContent(res.body, 'og:url'), 'https://www.dogleg.io/join/pal_99')
})

test('handler never fails: a bad or missing username gets the generic preview with 200', () => {
  const bad = fakeResponse()
  handler({ query: { username: '<script>' }, headers: {}, url: '/api/og/invite' }, bad)
  assert.equal(bad.statusCode, 200)
  assert.equal(metaContent(bad.body, 'og:title'), 'Dogleg.io - The Strava for Golf')
  assert.equal(metaContent(bad.body, 'og:url'), 'https://dogleg.io/')
  assert.ok(!bad.body.includes('<script>'))

  // ?username=a&username=b arrives as an array
  const twice = fakeResponse()
  handler({ query: { username: ['alex_fairway', 'pal'] }, headers: {}, url: '/api/og/invite?username=alex_fairway&username=pal' }, twice)
  assert.equal(twice.statusCode, 200)
  assert.equal(metaContent(twice.body, 'og:title'), 'Join @alex_fairway on Dogleg')

  const missing = fakeResponse()
  handler({ headers: undefined, url: undefined }, missing)
  assert.equal(missing.statusCode, 200)
  assert.equal(metaContent(missing.body, 'og:title'), 'Dogleg.io - The Strava for Golf')
})

// vercel.json: preview bots opening /join/... go to the function, with the
// exact same bot rule as round links; everyone else gets the app.
test('vercel.json sends preview bots on invite links to the invite preview', () => {
  const config = require('../../vercel.json')
  const roundRule = config.rewrites.find((rule) => rule.source === '/rounds/:code')
  const inviteRule = config.rewrites.find((rule) => rule.source === '/join/:username')
  assert.ok(inviteRule, 'there is an invite rule')
  assert.equal(inviteRule.destination, '/api/og/invite?username=:username')
  assert.deepEqual(inviteRule.has, roundRule.has, 'same bot rule as round links')

  // Order: round rule, invite rule, then the app for everything else
  assert.deepEqual(config.rewrites.map((rule) => rule.source), ['/rounds/:code', '/join/:username', '/(.*)'])
  assert.deepEqual(config.rewrites[config.rewrites.length - 1], { source: '/(.*)', destination: '/index.html' })

  const bot = new RegExp(`^${inviteRule.has[0].value}$`)
  assert.ok(bot.test('WhatsApp/2.23.20.0 A'))
  assert.ok(bot.test('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'))
  assert.ok(!bot.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'))
})

test('vercel.json sends X-Robots-Tag: noindex on invite pages, and only on round and invite pages', () => {
  const config = require('../../vercel.json')
  const robotsRules = config.headers.filter((rule) =>
    rule.headers.some((h) => h.key.toLowerCase() === 'x-robots-tag'))
  const inviteRule = robotsRules.find((rule) => rule.source === '/join/(.*)')
  assert.ok(inviteRule, 'there is a rule for /join/...')
  assert.equal(inviteRule.has, undefined, 'applies to every visitor, not only bots')
  assert.deepEqual(inviteRule.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }])

  const noindexed = (path) => robotsRules.some((rule) => new RegExp(`^${rule.source}$`).test(path))
  for (const path of ['/join/alex_fairway', '/rounds/UM6QVL']) {
    assert.ok(noindexed(path), `noindex on ${path}`)
  }
  for (const path of ['/', '/feed', '/profile/alex_fairway', '/privacy', '/join', '/rounds']) {
    assert.ok(!noindexed(path), `no noindex on ${path}`)
  }
})
