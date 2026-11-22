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
