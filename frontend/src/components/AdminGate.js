import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/admin'
import FullPageSpinner from './FullPageSpinner'

// Renders children only for admin users. Assumes it is nested inside
// <ProtectedRoute>, so `user` is already signed in by the time this renders.
//
// Admin status comes from the user's profile row (profiles.is_admin — the same
// column the server's is_admin() checks), so wait for the profile to load
// before deciding.
//
// The redirect is returned synchronously during render (NOT inside a
// useEffect), so admin-only child components never mount — and therefore never
// fire their admin data queries (e.g. get_all_users_admin, which returns every
// user's email) — for non-admin users. The server rejects those calls anyway.
function AdminGate({ children }) {
  const { profile, profileLoading } = useAuth()

  if (!profile && profileLoading) {
    return <FullPageSpinner />
  }

  if (!isAdmin(profile)) {
    return <Navigate to="/" replace />
  }

  return children
}

export default AdminGate
