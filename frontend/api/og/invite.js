// Vercel serverless function: GET /api/og/invite?username=alex_fairway
//
// Link-preview bots (iMessage, WhatsApp, Slack, ...) opening an invite link
// (/join/<username>) are sent here instead of the normal app page by a
// rewrite in frontend/vercel.json. People never see this page: their
// browsers get the normal app.
//
// It always answers 200 with HTML and never reads the database: the preview
// only repeats the (checked and escaped) username from the link. A bad
// username gets the generic Dogleg preview.

const { buildInvitePreviewHtml } = require('../_lib/invitePreview')

// The username from ?username=..., or '' if missing
function readUsername(req) {
  const fromQuery = req.query && req.query.username
  if (typeof fromQuery === 'string') return fromQuery
  try {
    return new URL(req.url || '', 'https://dogleg.io').searchParams.get('username') || ''
  } catch {
    return ''
  }
}

module.exports = (req, res) => {
  const headers = (req && req.headers) || {}
  const host = headers['x-forwarded-host'] || headers.host
  let html
  try {
    html = buildInvitePreviewHtml({ host, username: readUsername(req || {}) })
  } catch (error) {
    console.error('Invite preview failed:', error)
    html = buildInvitePreviewHtml({ host })
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // The page depends only on the link, so it can be cached for a day
  res.setHeader('Cache-Control', 'public, s-maxage=86400')
  res.end(html)
}
