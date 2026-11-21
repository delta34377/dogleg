import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FullPageSpinner from './FullPageSpinner'
import UsernameSetup from './UsernameSetup'

// Wraps every page that needs an account (the app shell and the admin pages).
//  - While auth is still loading: spinner.
//  - Signed out: go to /login, remembering this page so we can come back.
//  - Signed in but no username yet (new Google users): pick one first.
function ProtectedRoute({ children }) {
  const { user, profile, loading, rechecking } = useAuth()
  const location = useLocation()

  // Only show the spinner on first load, or while re-checking a session that
  // might have expired (no spinner if the user is already known)
  if (loading || (!user && rechecking)) {
    return <FullPageSpinner />
  }

  if (!user) {
    // Keep the query string too, so e.g. /profile/x?tab=rounds survives
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  // Covers every signed-in page, not just the feed
  if (profile && !profile.username) {
    return <UsernameSetup />
  }

  return children
}

export default ProtectedRoute
