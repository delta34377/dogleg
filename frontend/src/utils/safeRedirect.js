// Helpers for "send the user back where they were after signing in".
//
// The destination ("from") travels through router state, sessionStorage and
// the email-confirmation link, so it is always re-checked before use. Only
// paths on this same website are allowed. Anything else falls back to the
// default instead of being followed.

const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin'

// True for tab/newline/other control characters. Browsers silently delete tabs
// and newlines from URLs, so "/\t/evil.com" would turn into "//evil.com".
const hasControlCharacters = (text) =>
  Array.from(text).some((ch) => {
    const code = ch.charCodeAt(0)
    return code < 32 || code === 127
  })

// Returns `path` if it is a safe same-site path such as "/rounds/ABC123",
// otherwise `fallback`.
export function getSafeRedirectPath(path, fallback = '/') {
  if (typeof path !== 'string' || path.length === 0 || path.length > 2048) return fallback

  // Must start with exactly one "/". "//evil.com" is a link to another website,
  // and browsers treat a backslash like a slash ("/\evil.com").
  if (!path.startsWith('/') || path.startsWith('//')) return fallback
  if (path.includes('\\') || hasControlCharacters(path)) return fallback

  // Never send someone "back" to the sign-in or password-reset screens
  if (/^\/(login|reset-password)(\/|\?|#|$)/.test(path)) return fallback

  return path
}

// ---- sessionStorage copy, used only across the Google sign-in redirect ----
// Google sends the user back to the site root, so we remember the destination
// just before leaving and use it (once) when the app loads signed in.
// sessionStorage can throw in some private-browsing modes, hence the try/catch.

export function saveRedirectAfterLogin(path) {
  const safePath = getSafeRedirectPath(path, null)
  try {
    if (safePath && safePath !== '/') {
      sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, safePath)
    } else {
      sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY)
    }
  } catch {
    // Storage unavailable: the user simply lands on the feed after sign-in
  }
}

// Reads the saved destination and deletes it, so it can only be used once.
// Returns null when nothing (valid) was saved.
export function takeRedirectAfterLogin() {
  try {
    const saved = sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY)
    sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY)
    return getSafeRedirectPath(saved, null)
  } catch {
    return null
  }
}

export function clearRedirectAfterLogin() {
  try {
    sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY)
  } catch {
    // Nothing to clear
  }
}
