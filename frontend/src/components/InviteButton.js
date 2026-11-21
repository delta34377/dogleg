import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { buildInviteUrl, isValidInviteUsername } from '../utils/invite'

// "Invite friends": shares the signed-in golfer's invite link
// (www.dogleg.io/join/<username>, see utils/invite.js).
//  - Phones (and browsers with a share sheet): the share sheet.
//  - Otherwise, or if sharing fails: copies the link ("Link copied").
//  - If copying is blocked too: shows the link in a box to copy by hand.
// Renders nothing until the user has a username.

export const INVITE_SHARE_TITLE = 'Join me on Dogleg'
export const INVITE_SHARE_TEXT = 'Track every round, watch your handicap drop and follow my golf on Dogleg, the Strava for golf.'

const COPIED_MS = 2000

const VARIANT_CLASSES = {
  primary: 'bg-green-600 text-white hover:bg-green-700',
  secondary: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50',
}

function InviteButton({ variant = 'primary', className = '' }) {
  const { profile } = useAuth()
  const username = profile?.username
  // 'idle' | 'copied' | 'manual' (copy it yourself from the box)
  const [status, setStatus] = useState('idle')
  const copiedTimerRef = useRef(null)
  const mountedRef = useRef(false)
  // A second tap while the share sheet is still open is ignored
  const busyRef = useRef(false)
  const inputId = useId()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(copiedTimerRef.current)
    }
  }, [])

  if (!isValidInviteUsername(username)) return null
  const url = buildInviteUrl(username)

  const showCopied = () => {
    setStatus('copied')
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setStatus('idle')
    }, COPIED_MS)
  }

  const shareOrCopy = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url })
        return
      } catch (error) {
        // Closing the share sheet without picking an app: they changed their mind
        if (error?.name === 'AbortError') return
        // Any other failure (e.g. sharing not allowed here): copy instead
      }
    }

    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard unavailable')
      }
      await navigator.clipboard.writeText(url)
      if (mountedRef.current) showCopied()
    } catch {
      if (mountedRef.current) setStatus('manual')
    }
  }

  const handleClick = async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      await shareOrCopy()
    } finally {
      busyRef.current = false
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
          VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        <span aria-live="polite">{status === 'copied' ? 'Link copied' : 'Invite friends'}</span>
      </button>

      {status === 'manual' && (
        <div className="mt-2 text-left">
          <label htmlFor={inputId} className="block text-xs text-gray-500 mb-1">
            Copy your invite link
          </label>
          <input
            id={inputId}
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.target.select()}
            className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      )}
    </div>
  )
}

export default InviteButton
