// Sign-up measurement for Google Analytics and Google Ads.
//
// index.html loads the Google tag and configures both G-5H72L3N9MF (Analytics)
// and AW-17893516910 (Google Ads). Call trackSignUp() once, when a new
// account is created. Consent Mode in index.html still decides what Google
// may store, so a visitor who turned analytics off on the Privacy page keeps
// that choice.

// The "Sign-up" conversion action in the Dogleg Google Ads account
export const SIGNUP_CONVERSION = 'AW-17893516910/Pm9lCOTj57wcEO7MpdRC'

export function trackSignUp(method) {
  // gtag only exists when index.html's Google tag ran (not in tests, and
  // not if a blocker removed it), hence the ?.()
  try {
    window.gtag?.('event', 'sign_up', { method: method || 'email' })
    window.gtag?.('event', 'conversion', {
      send_to: SIGNUP_CONVERSION,
      value: 1.0,
      currency: 'USD',
    })
  } catch {
    // Measurement must never break sign-up
  }
}

// A sign-in counts as a sign-up when the account itself is new. This reads
// the account's own creation time (Supabase Auth's user.created_at), so it
// works whether the profiles row is made by the browser or by the database.
// The window is a day because an email sign-up only signs in once its
// confirmation link is clicked, which can be hours later. Each account is
// counted once per browser.
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000
const trackedKey = (userId) => `dogleg_signup_tracked_${userId}`

export function trackSignUpIfNew(user, now = Date.now()) {
  try {
    if (!user?.id || !user.created_at) return false
    const createdAt = new Date(user.created_at).getTime()
    if (!Number.isFinite(createdAt) || now - createdAt > NEW_ACCOUNT_WINDOW_MS) return false
    try {
      if (window.localStorage.getItem(trackedKey(user.id))) return false
      window.localStorage.setItem(trackedKey(user.id), '1')
    } catch {
      // Storage blocked (some private-browsing modes): count it anyway
    }
    trackSignUp(user.app_metadata?.provider)
    return true
  } catch {
    // Measurement must never break sign-in
    return false
  }
}
