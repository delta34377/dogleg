import { Fragment, Suspense, lazy } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  matchPath,
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AuthScreen from './components/auth/AuthScreen'
import AppShell from './components/AppShell'
import PublicShell from './components/PublicShell'
import FullPageSpinner, { PageSpinner } from './components/FullPageSpinner'
import AdminGate from './components/AdminGate'
import MyRounds from './components/MyRounds'
import Profile from './components/Profile'
import SingleRound from './components/SingleRound'
import LandingPage from './pages/LandingPage'
import { Analytics } from '@vercel/analytics/react'

// ---- Code splitting ----
// These pages are downloaded only when someone opens them, so a first-time
// visitor on the landing page doesn't download the charts library, the admin
// dashboards or the legal pages.
//
// After a new deploy, a phone that still has the old app open may ask for a
// page file that no longer exists. lazyPage() then reloads once to pick up the
// new version; if that still fails, the error screen offers "Reload".
//
// A phone with no signal (out on the course) fails the same download for a
// different reason. Reloading then would swap the running app for the
// browser's "no connection" page (and the installed iPhone app has no reload
// button), so instead the page keeps its spinner and tries again once the
// phone is back online.
const CHUNK_RELOAD_KEY = 'dogleg-chunk-reload'

// The errors a missing page file gives (webpack's, and the browsers' own for
// native imports). Anything else is a real bug: show the error screen.
export const isStaleChunkError = (error) =>
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i.test(
    `${error?.name || ''} ${error?.message || ''}`
  )

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const waitUntilOnline = () =>
  new Promise((resolve) => window.addEventListener('online', resolve, { once: true }))

// importPage() with the recovery described above. `reload` is only replaced
// by tests.
export function importWithRecovery(importPage, reload = () => window.location.reload()) {
  const loaded = (module) => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* storage unavailable */ }
    return module
  }

  const failed = (error) => {
    if (!isOffline() && isStaleChunkError(error)) {
      let alreadyReloaded = true
      try {
        alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'
        if (!alreadyReloaded) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
      } catch { /* storage unavailable: don't risk a reload loop */ }

      if (!alreadyReloaded) {
        reload()
        return new Promise(() => {}) // never resolves; the page is reloading
      }
    }
    throw error // the inline error screen shows, with its Reload button
  }

  return importPage().then(loaded, (error) => {
    if (isOffline()) {
      // Keep the spinner; try once more when the connection comes back
      return waitUntilOnline().then(() => importPage()).then(loaded, failed)
    }
    return failed(error)
  })
}

function lazyPage(importPage) {
  return lazy(() => importWithRecovery(importPage))
}

const CourseSearch = lazyPage(() => import('./components/CourseSearch'))
const StatsPage = lazyPage(() => import('./components/StatsPage'))
const CoursePage = lazyPage(() => import('./components/CoursePage'))
const UserProfile = lazyPage(() => import('./components/UserProfile'))
const SearchUsers = lazyPage(() => import('./pages/SearchUsers'))
const ResetPassword = lazyPage(() => import('./components/ResetPassword'))
const TermsOfService = lazyPage(() => import('./pages/TermsOfService'))
const PrivacyPolicy = lazyPage(() => import('./pages/PrivacyPolicy'))
const AdminHub = lazyPage(() => import('./components/admin/AdminHub'))
const AdminOverview = lazyPage(() => import('./components/admin/AdminOverview'))
const AdminDashboard = lazyPage(() => import('./components/admin/AdminDashboard'))
const AdminStatsEngine = lazyPage(() => import('./components/admin/AdminStatsEngine'))
const ModerationDashboard = lazyPage(() => import('./components/admin/ModerationDashboard'))
const AdminPanel = lazyPage(() => import('./components/AdminPanel'))

// Pages that need an account. A signed-out visitor on one of these goes to
// /login and is brought back afterwards. (Signed-out visitors may see "/"
// — the landing page — and "/rounds/:roundId" — a shared round.)
const SIGNED_IN_ONLY_PATHS = [
  '/add',
  '/my-rounds',
  '/stats',
  '/profile',
  '/profile/:username',
  '/courses/:courseId',
  '/search-users',
]

// Decides what wraps the in-app pages: the landing page, the public frame for
// a shared round, or the signed-in app shell. Because this is one layout route
// that stays mounted, moving between pages never rebuilds the shell.
function AppLayout() {
  const { user, loading, rechecking } = useAuth()
  const { pathname } = useLocation()

  // Wait until we know whether the user is signed in
  if (loading || (!user && rechecking)) {
    return <FullPageSpinner />
  }

  if (!user) {
    if (pathname === '/') return <LandingPage />

    // Shared round links work without an account
    if (matchPath('/rounds/:roundId', pathname)) {
      return (
        <PublicShell>
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </PublicShell>
      )
    }

    // Unknown address: show the landing page rather than a login wall
    if (!SIGNED_IN_ONLY_PATHS.some((pattern) => matchPath(pattern, pathname))) {
      return <Navigate to="/" replace />
    }
    // Otherwise ProtectedRoute (below) sends them to /login and back
  }

  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  )
}

// My Rounds needs the shell's ref so re-tapping its tab can scroll to the top
function MyRoundsTab() {
  const { roundsRef } = useOutletContext()
  return <MyRounds ref={roundsRef} />
}

// Rebuild a detail page when its address changes (e.g. tapping from one
// golfer's profile to another's) so it never shows the previous page's data
function RemountOnPathChange({ children }) {
  const { pathname } = useLocation()
  return <Fragment key={pathname}>{children}</Fragment>
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <div className="text-6xl mb-4">⛳</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Page not found</h2>
        <p className="text-gray-500 mb-6">That link may be out of date.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Back to the feed
        </button>
      </div>
    </div>
  )
}

// Main App component with routing
function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/login" element={<AuthScreen />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* Admin pages (outside the app shell) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminGate>
                    <AdminHub />
                  </AdminGate>
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="analytics" element={<AdminDashboard />} />
              <Route path="stats-engine" element={<AdminStatsEngine />} />
              <Route path="feed-algorithm" element={<AdminPanel />} />
              <Route path="moderation" element={<ModerationDashboard />} />
            </Route>

            {/* Everything else lives inside one shared layout (see AppLayout) */}
            <Route element={<AppLayout />}>
              {/* "/" is the Feed, which AppShell itself keeps mounted */}
              <Route index element={null} />
              <Route path="add" element={<CourseSearch />} />
              <Route path="my-rounds" element={<MyRoundsTab />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/:username" element={<RemountOnPathChange><UserProfile /></RemountOnPathChange>} />
              <Route path="courses/:courseId" element={<RemountOnPathChange><CoursePage /></RemountOnPathChange>} />
              <Route path="rounds/:roundId" element={<RemountOnPathChange><SingleRound /></RemountOnPathChange>} />
              <Route path="search-users" element={<SearchUsers />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        <Analytics />
      </AuthProvider>
    </Router>
  )
}

export default App
