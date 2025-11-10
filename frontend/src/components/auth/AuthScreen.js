import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { FcGoogle } from 'react-icons/fc'
import { MdPhone } from 'react-icons/md'
import { useNavigate } from 'react-router-dom'

function AuthScreen({ onSuccess }) {
  const [authMode, setAuthMode] = useState('signin') // signin, signup, phone, reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const navigate = useNavigate()

  const { 
    signUp, 
    signIn, 
    signInWithPhone, 
    verifyPhoneOTP,
    signInWithGoogle,
    resetPassword 
  } = useAuth()

  // Format phone number for display
  const formatPhoneNumber = (value) => {
    const phoneNumber = value.replace(/\D/g, '')
    if (phoneNumber.length < 4) return phoneNumber
    if (phoneNumber.length < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`
  }

  // Format phone for API (add country code) - IMPROVED VERSION
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
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const { error } = await signUp(email, password, {
      username: username.toLowerCase().replace(/\s/g, ''),
      full_name: fullName
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email to confirm your account!')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setUsername('')
      setFullName('')
    }

    setLoading(false)
  }

  const handleEmailSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      // Use generic error message to prevent user enumeration
      setError('Invalid email or password')
    } else {
      navigate('/')
    }

    setLoading(false)
  }

  const handlePhoneSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const formattedPhone = formatPhoneForAPI(phone)
      
      if (!showOtpInput) {
        // Send OTP
        const { error } = await signInWithPhone(formattedPhone)
        
        if (error) {
          setError(error.message)
        } else {
          setShowOtpInput(true)
          setSuccess(`Verification code sent to ${formattedPhone}`)
        }
      } else {
        // Verify OTP
        const { error } = await verifyPhoneOTP(formattedPhone, otpCode)
        
        if (error) {
          setError(error.message)
        } else {
          navigate('/') // Consistent with email sign in
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)

    const { error } = await signInWithGoogle()

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // Google OAuth handles redirect automatically
  }

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const { error } = await resetPassword(email)

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for password reset instructions!')
      setEmail('')
    }

    setLoading(false)
  }

  // Helper function to reset state when switching modes
  const switchAuthMode = (mode) => {
    setAuthMode(mode)
    setError('')
    setSuccess('')
    if (mode === 'phone') {
      setShowOtpInput(false)
      setOtpCode('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <span className="text-3xl">🏌️</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Dogleg.io</h1>
          <p className="text-gray-600 mt-2">
            {authMode === 'signin' && 'Welcome back!'}
            {authMode === 'signup' && 'Create your account'}
            {authMode === 'phone' && 'Sign in with your phone'}
            {authMode === 'reset' && 'Reset your password'}
          </p>
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
                pattern="[a-z0-9_]{3,20}"
                title="3-20 characters, lowercase letters, numbers, and underscores only"
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
                  We'll send you a verification code via SMS
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
                  onChange={(e) => setOtpCode(e.target.value)}
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
                  className="text-sm text-green-600 hover:text-green-700 mt-2"
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

        {/* Divider and Social Login Options */}
        {(authMode === 'signin' || authMode === 'signup') && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => switchAuthMode('phone')}
                className="w-full flex items-center justify-center gap-3 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                <MdPhone className="text-xl text-green-600" />
                <span className="font-medium">Phone Number</span>
              </button>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                <FcGoogle className="text-xl" />
                <span className="font-medium">Google</span>
              </button>
            </div>
          </>
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