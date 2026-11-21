// Vercel serverless function: GET /api/og/round?code=UM6QVL
//
// Link-preview bots (iMessage, WhatsApp, Slack, ...) are sent here instead of
// the normal app page by the first rewrite in frontend/vercel.json. People
// never see this page: their browsers get the normal app.
//
// It always answers 200 with HTML. If anything goes wrong (bad code, private
// or removed round, database slow or down) the bot gets the generic Dogleg
// preview instead of an error.
//
// Needs the REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY environment
// variables, which the Vercel project already has for the website build.

const {
  isValidCode,
  buildRoundPreviewHtml,
  buildGenericPreviewHtml,
  fetchPublicRound,
} = require('../_lib/roundPreview')

// The round code from ?code=..., or '' if missing
function readCode(req) {
  const fromQuery = req.query && req.query.code
  if (typeof fromQuery === 'string') return fromQuery
  try {
    return new URL(req.url || '', 'https://dogleg.io').searchParams.get('code') || ''
  } catch {
    return ''
  }
}

module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  let code = ''
  let html
  // Found rounds are cached for 5 minutes; the generic fallback for only 1, so
  // a brief database hiccup doesn't stick to a shared link for long
  let cacheControl = 'public, s-maxage=300'

  try {
    code = readCode(req)
    const payload = isValidCode(code) ? await fetchPublicRound(code) : null
    if (payload) {
      html = buildRoundPreviewHtml({ payload, host, code })
    } else {
      html = buildGenericPreviewHtml({ host, code })
      cacheControl = 'public, s-maxage=60'
    }
  } catch (error) {
    console.error('Round preview failed:', error)
    html = buildGenericPreviewHtml({ host, code: isValidCode(code) ? code : '' })
    cacheControl = 'public, s-maxage=60'
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', cacheControl)
  res.end(html)
}
