import { Component } from 'react'
import { reportError } from '../utils/monitoring'

// Without an error boundary, one crash while drawing any screen blanks the
// whole app — and the installed iPhone app has no reload button. This shows
// a friendly message with "Reload" and "Go home" instead.
//
// It works with or without Sentry (reportError does nothing when Sentry is
// not configured), and uses plain links/reloads so it still works even if the
// router itself is what crashed.

// After a new deploy, a phone that still has the old version open can fail to
// download a page's code. A reload fixes that, so we say so.
const isStaleVersionError = (error) =>
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i.test(
    `${error?.name || ''} ${error?.message || ''}`
  )

export function ErrorFallback({ error, variant = 'page' }) {
  const staleVersion = isStaleVersionError(error)

  const card = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-md w-full" role="alert">
      <div className="text-5xl mb-4">⛳</div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        {staleVersion ? 'Dogleg has been updated' : 'Something went wrong'}
      </h2>
      <p className="text-gray-600 mb-6">
        {staleVersion
          ? 'Reload to get the latest version.'
          : 'Sorry about that. Reloading usually fixes it.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
        >
          Reload
        </button>
        {/* A plain link (full page load) so it works even if the router crashed */}
        <a
          href="/"
          className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
        >
          Go home
        </a>
      </div>
    </div>
  )

  if (variant === 'inline') {
    // Inside the app shell: keep the header and tab bar usable
    return <div className="max-w-4xl mx-auto p-4 flex justify-center">{card}</div>
  }
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">{card}</div>
}

class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Dogleg hit an error while rendering:', error, info?.componentStack)
    reportError(error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // The app shell passes resetKey={pathname}: moving to another page clears
    // the error so the next page gets a fresh try.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} variant={this.props.variant} />
    }
    return this.props.children
  }
}

export default ErrorBoundary
