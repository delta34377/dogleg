import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import FullPageSpinner from '../FullPageSpinner'
import {
  getSafeRedirectPath,
  saveRedirectAfterLogin,
  clearRedirectAfterLogin,
} from '../../utils/safeRedirect'

// Google's multi-colour "G" (inline so we don't need an icon library)
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function AuthScreen({ onSuccess }) {
  // Add mounted ref to prevent state updates after unmount
  const mountedRef = useRef(true)

  const navigate = useNavigate()
  const location = useLocation()
  // Where to go after login. Router state can come from anywhere, so only a
  // path on this same site is accepted (see utils/safeRedirect.js).
  const from = getSafeRedirectPath(location.state?.from)
  const cameForRound = from.startsWith('/rounds/')

  // Landing page CTAs and shared-round pages can open this screen in signup mode
  const [authMode, setAuthMode] = useState(location.state?.mode === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [wantsNewsletter, setWantsNewsletter] = useState(false)
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const {
    user,
    loading: authLoading,
    signUp, 
    signIn, 
    signInWithPhone, 
    verifyPhoneOTP,
    signInWithGoogle,
    resetPassword 
  } = useAuth()

  // Cleanup on unmount
  useEffect(() => {
    return () => { 
      mountedRef.current = false 
    }
  }, [])

  // Forget any destination saved by an earlier, abandoned Google sign-in.
  // (It is saved again only when the Google button is pressed.)
  useEffect(() => {
    clearRedirectAfterLogin()
  }, [])

  // Clear sensitive data when switching modes
  useEffect(() => {
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPassword('')
    setOtpCode('')
    setShowOtpInput(false)
    setLoading(false)
  }, [authMode])

  // Safe state setter wrapper
  const safeSetState = (setter) => (value) => {
    if (mountedRef.current) {
      setter(value)
    }
  }

  // Format phone number for display
  const formatPhoneNumber = (value) => {
    const phoneNumber = value.replace(/\D/g, '')
    if (phoneNumber.length < 4) return phoneNumber
    if (phoneNumber.length < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`
  }

  // Format phone for API (add country code)
  const formatPhoneForAPI = (phoneNumber) => {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.length === 10) {
      return `+1${digits}`
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`
    }
    throw new Error('Please enter a valid 10-digit US phone number')
  }

  const handleEmailSignUp = async (e) => {
    e.preventDefault()
    safeSetState(setError)('')
    safeSetState(setSuccess)('')

    if (password !== confirmPassword) {
      safeSetState(setError)('Passwords do not match')
      return
    }

    if (password.length < 6) {
      safeSetState(setError)('Password must be at least 6 characters')
      return
    }

    safeSetState(setLoading)(true)

    // Passing `from` makes the confirmation email link open that page
    const { error } = await signUp(email, password, {
  username: username.toLowerCase().replace(/\s/g, ''),
  full_name: fullName,
  wants_newsletter: wantsNewsletter
}, from)

    if (!mountedRef.current) return

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(cameForRound
        ? 'Check your email to confirm your account! The link will bring you back to this round.'
        : 'Check your email to confirm your account!')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setUsername('')
      setFullName('')
      setLoading(false)
    }
  }

  const handleEmailSignIn = async (e) => {
    e.preventDefault()
    safeSetState(setError)('')
    safeSetState(setLoading)(true)

    const { error } = await signIn(email, password)

    if (!mountedRef.current) return

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      // Navigate will unmount, so no need to setLoading(false)
      navigate(from, { replace: true })
    }
  }

  const handlePhoneSignIn = async (e) => {
    e.preventDefault()
    safeSetState(setError)('')
    safeSetState(setSuccess)('')
    safeSetState(setLoading)(true)

    try {
      const formattedPhone = formatPhoneForAPI(phone)
      
      if (!showOtpInput) {
        // Send OTP
        const { error } = await signInWithPhone(formattedPhone)
        
        if (!mountedRef.current) return

        if (error) {
          setError(error.message)
          setLoading(false)
        } else {
          setShowOtpInput(true)
          setSuccess(`Verification code sent to ${formattedPhone}`)
          setLoading(false)
        }
      } else {
        // Verify OTP
        const { error } = await verifyPhoneOTP(formattedPhone, otpCode)
        
        if (!mountedRef.current) return

        if (error) {
          setError(error.message)
          setLoading(false)
        } else {
          navigate(from, { replace: true })
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message)
        setLoading(false)
      }
    }
  }

  const handleGoogleSignIn = async () => {
  safeSetState(setError)('')
  safeSetState(setLoading)(true)

  // Google always returns to the home page; remember where to continue.
  // The app shell reads this once after sign-in (and sign-out clears it).
  saveRedirectAfterLogin(from)

  const { error } = await signInWithGoogle()

  if (!mountedRef.current) return

  if (error) {
    setError(error.message)
    setLoading(false)
  }
  // Google OAuth handles redirect automatically
  // Loading stays true for redirect flow
}

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    safeSetState(setError)('')
    safeSetState(setSuccess)('')
    safeSetState(setLoading)(true)

    const { error } = await resetPassword(email)

    if (!mountedRef.current) return

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for password reset instructions!')
      setEmail('')
    }
    setLoading(false)
  }

  // Helper function to switch modes
  const switchAuthMode = (mode) => {
    setAuthMode(mode)
    // useEffect will handle clearing sensitive data
  }

  // Wait for the session check, then send already-signed-in users on their
  // way instead of showing them a login form (e.g. after a slow token refresh
  // bounced them here, or a stale "Log in" bookmark)
  if (authLoading) {
    return <FullPageSpinner />
  }
  if (user) {
    return <Navigate to={from} replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo */}
<div className="text-center mb-8">
  <div className="flex justify-center mb-4">
    <img src="/logo-full.png" alt="Dogleg.io" className="h-16 sm:h-20 object-contain" />
  </div>
  
  {/* Marketing content - remove old h1 "Dogleg.io" since it's in the image now */}
  {(authMode === 'signin' || authMode === 'signup') && (
    <div className="mt-4">
      <p className="text-lg font-semibold text-green-700 mb-3">
        Your Golf Life, Socialized.
      </p>
      {cameForRound && (
        <p className="text-sm font-medium text-gray-700 mb-3">
          {authMode === 'signup'
            ? 'Create a free account to react and comment on this round.'
            : 'Sign in to react and comment on this round.'}
        </p>
      )}
              <div className="flex flex-col gap-1 text-sm text-gray-600">
                <p>⛳ Log your rounds in seconds</p>
                <p>👥 Follow friends and see their scores</p>
                <p>🔥 React and comment on rounds</p>
              </div>
            </div>
          )}
          
          {/* Simple subtitle for other modes */}
          {authMode === 'phone' && (
            <p className="text-gray-600 mt-2">Sign in with your phone</p>
          )}
          {authMode === 'reset' && (
            <p className="text-gray-600 mt-2">Reset your password</p>
          )}
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm" role="status" aria-live="polite">
            {success}
          </div>
        )}

        {/* Google Sign In - FIRST for signin/signup */}
        {(authMode === 'signin' || authMode === 'signup') && (
          <>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                disabled={loading}
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with email</span>
              </div>
            </div>
          </>
        )}

        {/* Sign In Form */}
        {authMode === 'signin' && (
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => switchAuthMode('reset')}
                className="text-sm text-green-600 hover:text-green-700"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Sign Up Form */}
        {authMode === 'signup' && (
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="johndoe"
                autoComplete="username"
                required
                disabled={loading}
                pattern="[a-zA-Z0-9_]{3,20}"
                title="3-20 characters (letters, numbers, underscores)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="John Doe"
                autoComplete="name"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms-checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                required
                disabled={loading}
              />
              <label htmlFor="terms-checkbox" className="text-sm text-gray-600">
                I am at least 13 years old and agree to the{' '}
                <a href="/terms" target="_blank" className="text-green-600 hover:underline">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" className="text-green-600 hover:underline">
                  Privacy Policy
                </a>
              </label>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="newsletter-checkbox"
                checked={wantsNewsletter}
                onChange={(e) => setWantsNewsletter(e.target.checked)}
                className="mt-1 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                disabled={loading}
              />
              <label htmlFor="newsletter-checkbox" className="text-sm text-gray-600">
                Sign me up for the Dogleg.io newsletter (optional)
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Phone Sign In Form */}
        {authMode === 'phone' && (
          <form onSubmit={handlePhoneSignIn} className="space-y-4">
            {!showOtpInput ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                  placeholder="(123) 456-7890"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  disabled={loading}
                  maxLength={14}
                />
                <p className="text-xs text-gray-500 mt-1">
                  We'll send you a verification code via SMS (US numbers only)
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-2xl text-center tracking-widest"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  disabled={loading}
                  maxLength={6}
                  pattern="[0-9]{6}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the 6-digit code sent to {phone}
                </p>
                
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpInput(false)
                    setOtpCode('')
                  }}
                  className="text-sm text-green-600 hover:text-green-700 mt-2 disabled:text-gray-400"
                  disabled={loading}
                >
                  Use a different number
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (showOtpInput && otpCode.length !== 6)}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Processing...' : showOtpInput ? 'Verify Code' : 'Send Code'}
            </button>
          </form>
        )}

        {/* Password Reset Form */}
        {authMode === 'reset' && (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                required
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                We'll send you instructions to reset your password
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Sending...' : 'Send Reset Instructions'}
            </button>

            <button
              type="button"
              onClick={() => switchAuthMode('signin')}
              className="w-full text-sm text-gray-600 hover:text-gray-800"
            >
              Back to Sign In
            </button>
          </form>
        )}

        {/* Toggle between Sign In and Sign Up */}
        {authMode !== 'phone' && authMode !== 'reset' && (
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-600">
              {authMode === 'signin' ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={() => switchAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-sm font-semibold text-green-600 hover:text-green-700"
            >
              {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AuthScreen