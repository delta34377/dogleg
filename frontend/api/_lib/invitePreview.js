// Link previews for invite links (www.dogleg.io/join/<username>).
//
// Preview bots don't run JavaScript, so vercel.json sends them (and only
// them) to api/og/invite.js, which uses this file to build a tiny HTML page
// with Open Graph tags: "Join @alex_fairway on Dogleg". People's browsers get
// the normal app page.
//
// Nothing here touches the database: the preview only repeats the username
// from the link, after checking it is a real username's shape and escaping
// it. Like roundPreview.js, this folder starts with "_" so Vercel doesn't
// make it an endpoint of its own. Plain Node (CommonJS), no dependencies:
//   cd frontend && node --test api/_lib/invitePreview.test.js

const { escapeHtml, safeHost } = require('./roundPreview')

const GENERIC_TITLE = 'Dogleg.io - The Strava for Golf'
// Same wording as the site's own description (public/index.html)
const INVITE_DESCRIPTION = "The Strava for golf: an automatic handicap, a 0-10 Dogleg Score for every round, and a feed of your friends' golf. Post a round in 30 seconds."

// Same rule as isValidInviteUsername in src/utils/invite.js (browser code,
// so it can't be loaded here). Keep the two in step.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/

function isValidInviteUsername(username) {
  return typeof username === 'string' && USERNAME_PATTERN.test(username)
}

// The page skeleton. Every value is escaped here, in one place. Invite pages
// are for the friends a golfer sends the link to, not for search results, so
// search engines are asked not to index them (plus an X-Robots-Tag header on
// /join/... in vercel.json). Chat apps still read the preview tags.
function renderInvitePage({ title, description, url, image, linkText }) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const u = escapeHtml(url)
  const i = escapeHtml(image)
  const l = escapeHtml(linkText)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="Dogleg">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${i}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${u}">${l}</a></p>
</body>
</html>
`
}

// The preview for /join/<username>. A username that isn't a real username's
// shape gets the generic Dogleg preview, pointing at the home page.
function buildInvitePreviewHtml({ host, username } = {}) {
  const siteHost = safeHost(host)
  const image = `https://${siteHost}/og-image.png`

  if (!isValidInviteUsername(username)) {
    return renderInvitePage({
      title: GENERIC_TITLE,
      description: INVITE_DESCRIPTION,
      url: `https://${siteHost}/`,
      image,
      linkText: 'Join Dogleg',
    })
  }

  return renderInvitePage({
    title: `Join @${username} on Dogleg`,
    description: INVITE_DESCRIPTION,
    url: `https://${siteHost}/join/${encodeURIComponent(username)}`,
    image,
    linkText: `Join @${username} on Dogleg`,
  })
}

module.exports = {
  isValidInviteUsername,
  buildInvitePreviewHtml,
  INVITE_DESCRIPTION,
}
