// The visitor's choice about Google Analytics cookies.
//
// public/index.html reads the same localStorage key BEFORE Google Analytics
// starts, so the choice applies from the very first page load:
//   '1'      -> turned off: no analytics or advertising cookies, anywhere
//   '0'      -> turned on: analytics cookies allowed, even in the EEA/UK/CH
//   missing  -> no choice yet: off by default in the EEA, UK and Switzerland,
//               on by default everywhere else
// If you rename the key or change these values, update index.html too.
//
// The choice is saved per browser (it isn't tied to the Dogleg account).

export const ANALYTICS_OPTOUT_KEY = 'dogleg_analytics_optout'

// Google Consent Mode settings sent when the visitor turns analytics off
const ALL_DENIED = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
}

// Turning analytics on only allows analytics cookies (advertising stays at
// its default), because that's all the switch on the Privacy page asks about.
const ANALYTICS_GRANTED = { analytics_storage: 'granted' }

// 'off', 'on', or null when the visitor hasn't chosen yet
export function getAnalyticsChoice() {
  try {
    const value = window.localStorage.getItem(ANALYTICS_OPTOUT_KEY)
    if (value === '1') return 'off'
    if (value === '0') return 'on'
  } catch {
    // Storage blocked (some private-browsing modes): treat as "no choice"
  }
  return null
}

// true when the visitor turned Google Analytics cookies off
export function getAnalyticsOptOut() {
  return getAnalyticsChoice() === 'off'
}

// Save the choice and tell Google Analytics right away (no reload needed).
// Returns false if the browser wouldn't let us save it; the choice then
// still applies until the page is closed.
export function setAnalyticsOptOut(optOut) {
  let saved = true
  try {
    window.localStorage.setItem(ANALYTICS_OPTOUT_KEY, optOut ? '1' : '0')
  } catch {
    saved = false
  }

  // gtag only exists when index.html's Google tag ran (not in tests, and
  // not if a blocker removed it), hence the ?.()
  window.gtag?.('consent', 'update', optOut ? ALL_DENIED : ANALYTICS_GRANTED)

  if (optOut) clearGoogleAnalyticsCookies()
  return saved
}

// Consent Mode stops new cookies, but the ones Google Analytics already set
// (_ga, _ga_XXXX, _gid, _gat...) stay until they expire. Delete them now.
function clearGoogleAnalyticsCookies() {
  let names = []
  try {
    names = document.cookie
      .split(';')
      .map((part) => part.split('=')[0].trim())
      .filter((name) => /^_g(a|id|at)/.test(name))
  } catch {
    return
  }
  if (names.length === 0) return

  // A cookie is only deleted when the domain matches the one it was set
  // with. Google Analytics uses the top domain (".dogleg.io"), so try the
  // current host and each parent domain, plus no domain at all.
  const hostParts = window.location.hostname.split('.')
  const domains = [null]
  for (let i = 0; i < hostParts.length - 1; i++) {
    domains.push(hostParts.slice(i).join('.'))
  }

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
    }
  }
}
