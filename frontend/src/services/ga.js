// ga.js - thin wrapper around the GA4 gtag snippet loaded in public/index.html.
// Events fired here become Google Ads conversions — see docs/google_ads.md.
export function trackGA(eventName, params = {}) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params)
  }
}

export default trackGA
