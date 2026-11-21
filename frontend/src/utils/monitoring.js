// Error reporting with Sentry.
//
// It is switched on only when the REACT_APP_SENTRY_DSN environment variable is
// set (in Vercel: Project → Settings → Environment Variables, then redeploy).
// Without it every function here does nothing and the Sentry code is never
// downloaded, so the app works exactly the same.
//
// Sentry is loaded with a dynamic import() so it sits in its own file and
// does not slow down the first page load for every visitor.

const DSN = process.env.REACT_APP_SENTRY_DSN

// A promise for the loaded Sentry module (or null if loading failed).
// Stays null when no DSN is configured.
let sentryReady = null

export function initMonitoring() {
  if (!DSN || sentryReady) return

  sentryReady = import('./sentryClient')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        // "production" / "preview" / "development" — Vercel provides this
        environment: process.env.REACT_APP_VERCEL_ENV || undefined,
        release: process.env.REACT_APP_VERCEL_GIT_COMMIT_SHA || undefined,
        // Privacy: never attach IP addresses, cookies or request bodies
        sendDefaultPii: false,
        // Errors only: no performance tracing
        tracesSampleRate: 0,
        // No session replay: replayIntegration() is deliberately not added
      })
      return Sentry
    })
    .catch((error) => {
      console.warn('Error reporting could not be loaded:', error)
      return null
    })
}

// Send a caught error (for example from the error boundary) to Sentry.
export function reportError(error, componentStack) {
  if (!sentryReady) return
  sentryReady.then((Sentry) => {
    Sentry?.captureException(
      error,
      componentStack ? { contexts: { react: { componentStack } } } : undefined
    )
  })
}

// Tag reports with the signed-in user's id (never their email or name), or
// clear it on sign-out by passing null.
export function setMonitoringUser(userId) {
  if (!sentryReady) return
  sentryReady.then((Sentry) => {
    Sentry?.setUser(userId ? { id: userId } : null)
  })
}
