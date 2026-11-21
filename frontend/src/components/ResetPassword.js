import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'

// The page the "Reset your password" email links to.
//
// Supabase signs the user in with a short-lived recovery session when they
// open the link. If the link is expired or was already used (some email apps
// open links to scan them, which uses them up), there is no session and the
// password can't be changed — so we say so and offer a fresh link instead of
// pretending it worked.

// If updateUser hasn't answered by now, tell the user (but keep waiting)
const SLOW_REQUEST_MS = 15000

// Errors that mean the recovery session is missing or expired
const isMissingSessionError = (error) =>
  error?.name === 'AuthSessionMissingError' ||
  ['session_not_found', 'session_expired', 'refresh_token_not_found', 'otp_expired'].includes(error?.code) ||
  error?.status === 401 ||
  error?.status === 403

// Turn Supabase's error into something a golfer can act on
const describeUpdateError = (error) => {
  if (error?.code === 'same_password') {
    return 'That is your current password. Choose a different one.'
  }
  if (error?.code === 'weak_password') {
    return error.message
      ? `That password is too weak. ${error.message}`
      : 'That password is too weak. Try a longer one with a mix of letters and numbers.'
  }
  if (error?.name === 'AuthRetryableFetchError') {
    return "Couldn't reach Dogleg. Check your connection and try again."
  }
  return error?.message || 'Something went wrong. Please try again.'
}

function ResetPassword() {
  const navigate = useNavigate()
  const { updatePassword, resetPassword } = useAuth()
  const mountedRef = useRef(true)

  // 'checking' → looking at the link; 'ok' → can set a password;
  // 'invalid' → expired/used link, offer a new one
  const [linkStatus, setLinkStatus] = useState('checking')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // For requesting a new link
  const [email, setEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Check the link once on arrival
  useEffect(() => {
    // Supabase reports a bad link in the URL, e.g.
    // /reset-password#error=access_denied&error_code=otp_expired
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(window.location.search)
    if (hashParams.get('error') || hashParams.get('error_code') || queryParams.get('error') || queryParams.get('error_code')) {
      setLinkStatus('invalid')
      return
    }

    let cancelled = false
    // If the session check itself hangs (bad signal), let the user try anyway;
    // the save button reports a real error if the link turns out to be bad
    const giveUp = setTimeout(() => {
      if (!cancelled) setLinkStatus((status) => (status === 'checking' ? 'ok' : status))
    }, 10000)

    // getSession waits for Supabase to finish reading the link from the URL
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setLinkStatus(data?.session ? 'ok' : 'invalid')
      })
      .catch(() => {
        if (!cancelled) setLinkStatus('ok')
      })
      .finally(() => clearTimeout(giveUp))

    return () => {
      cancelled = true
      clearTimeout(giveUp)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setSlow(false)
    const slowTimer = setTimeout(() => {
      if (mountedRef.current) setSlow(true)
    }, SLOW_REQUEST_MS)

    // updateUser doesn't throw on failure: it returns { error }
    const { error: updateError } = await updatePassword(newPassword)
    clearTimeout(slowTimer)
    if (!mountedRef.current) return

    setLoading(false)
    setSlow(false)

    if (updateError) {
      if (isMissingSessionError(updateError)) {
        setLinkStatus('invalid')
      } else {
        setError(describeUpdateError(updateError))
      }
      return
    }

    // Only a real success gets here
    setSuccess(true)
  }

  const handleRequestNewLink = async (e) => {
    e.preventDefault()
    setResendError('')
    setResendMessage('')
    setResendLoading(true)

    const { error: resendErr } = await resetPassword(email.trim())
    if (!mountedRef.current) return

    setResendLoading(false)
    if (resendErr) {
      setResendError(resendErr.message || "Couldn't send the email. Please try again.")
    } else {
      setResendMessage('Check your email for a new reset link. It works once, so open it soon.')
    }
  }

  const frame = (children) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow p-6 max-w-md w-full">{children}</div>
    </div>
  )

  if (success) {
    return frame(
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4 text-green-600">✓ Password updated</h2>
        <p className="mb-6 text-gray-700">You're signed in with your new password.</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="inline-block px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Continue to Dogleg
        </button>
      </div>
    )
  }

  if (linkStatus === 'checking') {
    return frame(
      <p className="text-center text-gray-600">Checking your reset link...</p>
    )
  }

  if (linkStatus === 'invalid') {
    return frame(
      <>
        <h2 className="text-2xl font-bold mb-2">This link has expired</h2>
        <p className="text-gray-600 mb-4">
          Reset links work only once and expire after a while. Some email apps
          open links to scan them, which can use them up. Enter your email and
          we'll send you a new one.
        </p>
        {resendError && (
          <div className="p-3 rounded mb-4 bg-red-50 text-red-700" role="alert">{resendError}</div>
        )}
        {resendMessage ? (
          <div className="p-3 rounded mb-4 bg-green-50 text-green-700" role="status">{resendMessage}</div>
        ) : (
          <form onSubmit={handleRequestNewLink}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              inputMode="email"
              className="w-full px-3 py-2 border rounded-lg mb-4"
              required
              disabled={resendLoading}
            />
            <button
              type="submit"
              disabled={resendLoading}
              className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              {resendLoading ? 'Sending...' : 'Send a new reset link'}
            </button>
          </form>
        )}
        <p className="text-sm text-center mt-4">
          <Link to="/login" className="text-green-600 hover:text-green-700">Back to sign in</Link>
        </p>
      </>
    )
  }

  return frame(
    <>
      <h2 className="text-2xl font-bold mb-4">Set New Password</h2>
      {error && (
        <div className="p-3 rounded mb-4 bg-red-50 text-red-700" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 6 characters)"
          autoComplete="new-password"
          className="w-full px-3 py-2 border rounded-lg mb-3"
          required
          minLength={6}
          disabled={loading}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          className="w-full px-3 py-2 border rounded-lg mb-4"
          required
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
      {slow && (
        <p className="text-sm text-gray-600 mt-3">
          This is taking longer than expected. You can keep waiting, or try
          signing in with your new password in a minute. If that doesn't work,
          request a new reset link.
        </p>
      )}
    </>
  )
}

export default ResetPassword
