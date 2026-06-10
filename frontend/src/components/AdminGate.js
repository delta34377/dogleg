import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../utils/admin'

// Renders children only for admin users. Assumes it is nested inside
// <ProtectedRoute>, so `user` is already guaranteed to be authenticated and
// auth loading has settled by the time this renders.
//
// The redirect is returned synchronously during render (NOT inside a
// useEffect), so admin-only child components never mount — and therefore never
// fire their admin data queries (e.g. get_all_users_admin, which returns every
// user's email) — for non-admin users.
function AdminGate({ children }) {
  const { user } = useAuth()

  if (!isAdmin(user)) {
    return <Navigate to="/" replace />
  }

  return children
}

export default AdminGate
