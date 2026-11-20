import { Link, useLocation, useNavigate } from 'react-router-dom'

// Minimal frame for signed-out visitors opening a shared round link
// (/rounds/:roundId). Shows the round itself instead of a sign-in wall, with
// "Log in" / "Sign up free" buttons that bring them back to this same round
// afterwards.
function PublicShell({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  // AuthScreen reads `mode` to open on the right form and returns to `from`
  const goToLogin = (mode) => {
    navigate('/login', { state: { mode, from: location.pathname + location.search } })
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-2">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0">
              <img src="/icon-192.png" alt="Dogleg" className="w-10 h-10 object-contain flex-shrink-0" />
              {/* Brand name hidden on the narrowest phones so the buttons fit */}
              <span className="hidden min-[380px]:inline font-bold text-xl text-green-700">Dogleg.io</span>
            </Link>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => goToLogin('signin')}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => goToLogin('signup')}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700"
              >
                Sign up free
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-4 pb-8">{children}</main>
    </div>
  )
}

export default PublicShell
