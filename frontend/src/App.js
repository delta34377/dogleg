import { useState, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AuthScreen from './components/auth/AuthScreen'
import CourseSearch from './components/CourseSearch'
import MyRounds from './components/MyRounds'
import Profile from './components/Profile'
import Feed from './components/Feed'
import UserProfile from './components/UserProfile'
import ResetPassword from './components/ResetPassword'


// Main authenticated app with navigation
function AuthenticatedApp() {
  const [activeView, setActiveView] = useState('feed')
  const feedRef = useRef(null)
  const { user, profile, signOut, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  
  // Handle Feed tab click - refresh if already on feed
  const handleFeedClick = () => {
    if (activeView === 'feed' && feedRef.current) {
      // Already on feed, trigger refresh and scroll to top
      feedRef.current.refresh()
    } else {
      // Not on feed, just switch to feed
      setActiveView('feed')
    }
  }
  
  // Check if we're on a user profile page
  const isUserProfilePage = location.pathname.startsWith('/profile/') && location.pathname !== '/profile'
  
  // Prevent re-render loops
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }
  
 
  
  // If on user profile page, show UserProfile with navigation
  if (isUserProfilePage) {
    return (
      <div className="bg-gray-50 min-h-screen">
        {/* Top Bar with User Info */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(-1)}
                  className="mr-2 p-1.5 hover:bg-gray-100 rounded-lg md:hidden"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setActiveView('feed')
                    navigate('/')
                  }}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <span className="text-2xl">🏌️</span>
                  <span className="font-bold text-xl text-green-700">Dogleg.io</span>
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setActiveView('profile')
                    navigate('/')
                  }}
                  className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {profile?.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-700 font-semibold">
                        {profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {profile?.username || profile?.full_name || 'Profile'}
                  </span>
                </button>

                <button
                  onClick={signOut}
                  className="text-sm text-gray-600 hover:text-gray-900"
                  title="Sign out"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Bar */}
        <div className="hidden md:block bg-white border-b border-gray-200 sticky top-14 z-40 shadow-sm">
          <div className="max-w-4xl mx-auto">
            <div className="flex">
              <button
                onClick={() => {
                  setActiveView('feed')
                  navigate('/')
                }}
                className={`flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">📰</span>
                  <span>Feed</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveView('search')
                  navigate('/')
                }}
                className={`flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">➕</span>
                  <span>Add Round</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveView('rounds')
                  navigate('/')
                }}
                className={`flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl">📊</span>
                  <span>My Rounds</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="pt-4 pb-20 md:pb-4">
          <UserProfile />
        </div>

        {/* Bottom Navigation Bar (Mobile) */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
          <div className="grid grid-cols-3 h-16">
            <button
              onClick={() => {
                setActiveView('feed')
                navigate('/')
              }}
              className={`flex flex-col items-center justify-center gap-1 text-gray-600`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
              </svg>
              <span className="text-xs">Feed</span>
            </button>

            <button
              onClick={() => {
                setActiveView('search')
                navigate('/')
              }}
              className={`flex flex-col items-center justify-center gap-1 text-gray-600`}
            >
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center -mt-2">
                <span className="text-white text-2xl">+</span>
              </div>
              <span className="text-xs">Add</span>
            </button>

            <button
              onClick={() => {
                setActiveView('rounds')
                navigate('/')
              }}
              className={`flex flex-col items-center justify-center gap-1 text-gray-600`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-xs">Rounds</span>
            </button>

            <button
              onClick={() => {
                setActiveView('profile')
                navigate('/')
              }}
              className={`flex flex-col items-center justify-center gap-1 text-gray-600`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs">Profile</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top Bar with User Info */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={handleFeedClick}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl">🏌️</span>
              <span className="font-bold text-xl text-green-700">Dogleg.io</span>
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveView('profile')}
                className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold">
                      {profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {profile?.username || profile?.full_name || 'Profile'}
                </span>
              </button>

              <button
                onClick={signOut}
                className="text-sm text-gray-600 hover:text-gray-900"
                title="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
        <div className="grid grid-cols-3 h-16">
          <button
            onClick={handleFeedClick}
            className={`flex flex-col items-center justify-center gap-1 ${
              activeView === 'feed' ? 'text-green-600' : 'text-gray-600'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
            </svg>
            <span className="text-xs">Feed</span>
          </button>

          <button
            onClick={() => setActiveView('search')}
            className={`flex flex-col items-center justify-center gap-1 ${
              activeView === 'search' ? 'text-green-600' : 'text-gray-600'
            }`}
          >
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center -mt-2">
              <span className="text-white text-2xl">+</span>
            </div>
            <span className="text-xs">Add</span>
          </button>

          <button
            onClick={() => setActiveView('rounds')}
            className={`flex flex-col items-center justify-center gap-1 ${
              activeView === 'rounds' ? 'text-green-600' : 'text-gray-600'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs">Rounds</span>
          </button>
        </div>
      </div>

      {/* Desktop Navigation Bar */}
      <div className="hidden md:block bg-white border-b border-gray-200 sticky top-14 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex">
            <button
              onClick={handleFeedClick}
              className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${
                activeView === 'feed'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">📰</span>
                <span>Feed</span>
              </div>
            </button>

            <button
              onClick={() => setActiveView('search')}
              className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${
                activeView === 'search'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">➕</span>
                <span>Add Round</span>
              </div>
            </button>

            <button
              onClick={() => setActiveView('rounds')}
              className={`flex-1 py-4 px-4 text-center font-medium transition-colors ${
                activeView === 'rounds'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">📊</span>
                <span>My Rounds</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-4 pb-20 md:pb-4">
        {activeView === 'feed' && <Feed ref={feedRef} />}
        {activeView === 'search' && <CourseSearch />}
        {activeView === 'rounds' && <MyRounds />}
        {activeView === 'profile' && <Profile />}
      </div>
    </div>
  )
}

// Main App component with routing
function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* Define the profile route properly */}
          <Route 
            path="/profile/:username" 
            element={
              <ProtectedRoute>
                <AuthenticatedApp />
              </ProtectedRoute>
            }
          />
          
          {/* All other authenticated routes */}
          <Route 
            path="/*" 
            element={
              <ProtectedRoute>
                <AuthenticatedApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App