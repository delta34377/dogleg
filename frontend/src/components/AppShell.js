import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Feed from './Feed'
import NotificationDropdown from './NotificationDropdown'
import IOSInstallPrompt from './IOSInstallPrompt'
import ErrorBoundary from './ErrorBoundary'
import { PageSpinner } from './FullPageSpinner'
import { usePendingInviteFollow } from './InvitePage'
import { getInitials } from '../utils/avatarUtils'
import { isAdmin } from '../utils/admin'
import { takeRedirectAfterLogin } from '../utils/safeRedirect'

// The signed-in app frame: header, tab bars and the current page.
//
// It is rendered ONCE by a layout route in App.js and stays mounted while the
// user moves between pages, so the header and tabs never reload. The current
// tab comes from the URL ("/", "/add", "/stats", "/my-rounds"), which makes
// the phone's Back button, refresh and shared links all behave.

// SVG paths for the tab icons
const ICON_PATHS = {
  feed: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2',
  stats: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  rounds: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
}

// The four tabs, shared by the phone bottom bar and the desktop top bar
const TABS = [
  { path: '/', label: 'Feed', shortLabel: 'Feed', emoji: '📰', icon: ICON_PATHS.feed },
  { path: '/add', label: 'Add Round', shortLabel: 'Add', emoji: '➕', icon: null }, // big green "+" on phones
  { path: '/stats', label: 'Stats', shortLabel: 'Stats', emoji: '📈', icon: ICON_PATHS.stats },
  { path: '/my-rounds', label: 'My Rounds', shortLabel: 'Rounds', emoji: '📊', icon: ICON_PATHS.rounds },
]

// Pages that belong to no tab and get a back arrow on phones
const isDetailPage = (pathname) => /^\/(rounds|courses|profile)\/[^/]+/.test(pathname)

const INVITE_TOAST_MS = 6000

// "You're now following @x" after an invite link was applied. Closes by
// itself after a few seconds, or with its × button. On phones it sits just
// under the header: the bottom belongs to the tab bar and, for a new iPhone
// user, the "Add to Home Screen" prompt that opens at the same time.
function InviteFollowToast({ username, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, INVITE_TOAST_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed left-4 right-4 top-16 md:top-auto md:bottom-6 z-50 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm flex items-center gap-3 bg-gray-900 text-white rounded-xl shadow-xl pl-4 pr-1 py-1 animate-fade-up"
        role="status"
        aria-live="polite"
      >
        <span className="flex-1 min-w-0 text-sm font-medium break-words">You're now following @{username}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-300 hover:text-white text-xl leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function AppShell() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { pathname } = location

  const feedRef = useRef(null)
  const roundsRef = useRef(null)

  // Opened a friend's invite link before signing up? Follow them now that
  // the account has a username (this shell only shows after UsernameSetup).
  const [invitedFollow, dismissInvitedFollow] = usePendingInviteFollow(user?.id, profile?.username)

  // The Feed stays mounted (just hidden) while you visit other pages, so Back
  // returns to the same spot instead of reloading it from the top. It is first
  // mounted the first time "/" is shown. (Setting state during render like
  // this is React's recommended way to derive state from props.)
  const onFeed = pathname === '/'
  const [feedMounted, setFeedMounted] = useState(onFeed)
  if (onFeed && !feedMounted) setFeedMounted(true)

  // Google sign-in always comes back to "/". If the user started from another
  // page (e.g. a shared round), AuthScreen saved it; finish the trip once.
  useEffect(() => {
    const destination = takeRedirectAfterLogin()
    if (destination && destination !== window.location.pathname + window.location.search) {
      navigate(destination, { replace: true })
    }
  }, [navigate])

  // Start every page except the Feed at the top. (The Feed restores its own
  // scroll position. This is a normal effect, not a layout effect, so the
  // Feed's own effects get to remember where it was first.)
  useEffect(() => {
    if (pathname !== '/') window.scrollTo(0, 0)
  }, [pathname])

  // Tapping the tab you're already on: Feed refreshes, My Rounds jumps to top
  const handleNavClick = (event, path) => {
    if (pathname !== path) return // a normal tab switch; the <Link> navigates
    event.preventDefault()
    if (path === '/' && feedRef.current) {
      feedRef.current.refresh()
    } else if (path === '/my-rounds' && roundsRef.current) {
      roundsRef.current.scrollToTop()
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const goBack = () => {
    // The router numbers this tab's history entries from 0 at every fresh
    // page load. 0 means there is no earlier app page to go back to: a shared
    // link opened in a new tab, the page reached after signing in (the
    // redirects replace entries rather than adding them), or the return from
    // Google sign-in, whose previous entry is Google's own page. (location.key
    // can't tell: every redirect gives the page a new key.) Same check as the
    // legal pages.
    if (window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate('/', { replace: true })
    }
  }

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (error) {
      window.alert("Couldn't sign out. Check your connection and try again.")
      return
    }
    // Land on the home page rather than bouncing to the login screen
    navigate('/', { replace: true })
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <IOSInstallPrompt />

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2 min-w-0">
              {isDetailPage(pathname) && (
                <button
                  type="button"
                  onClick={goBack}
                  className="mr-1 p-1.5 hover:bg-gray-100 rounded-lg md:hidden"
                  aria-label="Go back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <Link
                to="/"
                onClick={(e) => handleNavClick(e, '/')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <img src="/icon-192.png" alt="Dogleg" className="w-12 h-12 object-contain" />
                <span className="font-bold text-xl text-green-700">Dogleg.io</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/search-users"
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Search users"
                aria-label="Search users"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </Link>

              <NotificationDropdown />

              {/* Admin button — a UI hint only; the server checks every admin call */}
              {isAdmin(profile) && (
                <Link
                  to="/admin"
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Admin Panel"
                  aria-label="Admin Panel"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
              )}

              <Link
                to="/profile"
                onClick={(e) => handleNavClick(e, '/profile')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === '/profile' ? 'bg-gray-100' : 'hover:bg-gray-100'
                }`}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold">
                      {getInitials(profile) || user?.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {profile?.username || profile?.full_name || 'Profile'}
                </span>
              </Link>

              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm text-gray-600 hover:text-gray-900"
                title="Sign out"
                aria-label="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop tab bar */}
      <nav className="hidden md:block bg-white border-b border-gray-200 sticky top-14 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex">
            {TABS.map((tab) => (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={(e) => handleNavClick(e, tab.path)}
                aria-current={pathname === tab.path ? 'page' : undefined}
                className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${
                  pathname === tab.path
                    ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">{tab.emoji}</span>
                  <span>{tab.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Current page */}
      <main className="pt-4 pb-20 md:pb-4">
        {feedMounted && (
          // `hidden` (display: none) also takes the off-screen Feed out of
          // the accessibility tree, so screen readers skip it
          <div hidden={!onFeed}>
            <ErrorBoundary variant="inline">
              {/* active=false tells the hidden Feed to pause infinite scroll */}
              <Feed ref={feedRef} active={onFeed} />
            </ErrorBoundary>
          </div>
        )}

        {/* resetKey: an error on one page clears when you move to another */}
        <ErrorBoundary variant="inline" resetKey={pathname}>
          <Suspense fallback={<PageSpinner />}>
            {/* Pages read roundsRef via useOutletContext (see MyRoundsTab in App.js) */}
            <Outlet context={{ roundsRef }} />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Phone tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
        <div className="grid grid-cols-4 h-16">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              onClick={(e) => handleNavClick(e, tab.path)}
              aria-current={pathname === tab.path ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 ${
                pathname === tab.path ? 'text-green-600' : 'text-gray-600'
              }`}
            >
              {tab.icon ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
              ) : (
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center -mt-2">
                  <span className="text-white text-2xl">+</span>
                </div>
              )}
              <span className="text-xs">{tab.shortLabel}</span>
            </Link>
          ))}
        </div>
      </nav>

      {invitedFollow && <InviteFollowToast username={invitedFollow} onDismiss={dismissInvitedFollow} />}
    </div>
  )
}

export default AppShell
