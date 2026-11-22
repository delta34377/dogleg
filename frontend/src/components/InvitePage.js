import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import { followService } from '../services/followService'
import { getInitials } from '../utils/avatarUtils'
import {
  isValidInviteUsername,
  storePendingInvite,
  readPendingInvite,
  clearPendingInvite,
} from '../utils/invite'

// /join/:username — the page a shared invite link opens (see utils/invite.js).
//
//  - Signed out: "<name> invited you to Dogleg" with Join free / Log in. The
//    invite is remembered in this browser, and once the visitor has an
//    account and a username the app shell follows the inviter for them
//    (usePendingInviteFollow below).
//  - Signed in: straight to the inviter's profile, where a friend who is
//    already on Dogleg can follow them. Any remembered invite is forgotten.
//  - A username the app would never have: the home page.

// The inviter's public profile: { data, error }. data is null when no
// golfer has that username.
export async function fetchInviterProfile(username) {
  if (!isValidInviteUsername(username)) return { data: null, error: null }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('username', username)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: data && typeof data === 'object' ? data : null, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

// Follows the golfer whose invite link this browser opened, once the
// signed-in user has a username. The invite is forgotten as soon as it is
// picked up, whatever happens next (inviter not found, already followed, a
// database error), so it is never tried twice. Resolves to { status,
// username }; status is 'followed' only when a new follow was made.
export async function applyPendingInvite({ userId, username }) {
  // Not ready yet (no username until UsernameSetup is done): keep the invite
  if (!userId || !username) return { status: 'waiting' }

  const invite = readPendingInvite()
  if (!invite) return { status: 'none' }
  clearPendingInvite()

  const inviterUsername = invite.username
  if (inviterUsername.toLowerCase() === String(username).toLowerCase()) {
    return { status: 'self', username: inviterUsername }
  }

  try {
    const { data: inviter, error } = await fetchInviterProfile(inviterUsername)
    if (error) {
      console.error('Could not look up the inviter:', error)
      return { status: 'error', username: inviterUsername }
    }
    if (!inviter?.id) return { status: 'not_found', username: inviterUsername }
    if (inviter.id === userId) return { status: 'self', username: inviterUsername }

    const shownUsername = isValidInviteUsername(inviter.username) ? inviter.username : inviterUsername
    if (await followService.isFollowing(inviter.id)) {
      return { status: 'already_following', username: shownUsername }
    }

    // Also tells the Feed to refresh; the inviter's "started following you"
    // notification comes from the database
    const { error: followError } = await followService.followUser(inviter.id)
    if (followError) {
      console.error('Could not follow the inviter:', followError)
      return { status: 'error', username: inviterUsername }
    }
    return { status: 'followed', username: shownUsername }
  } catch (error) {
    console.error('Could not apply the invite:', error)
    return { status: 'error', username: inviterUsername }
  }
}

// For the app shell: applies a remembered invite once per signed-in user,
// in the background. Returns [username just followed or null, dismiss]
// (dismiss keeps the same identity across renders).
// Safe under StrictMode's doubled effects: the ref keeps the second run from
// starting again, and the result is kept as long as the shell is mounted.
export function usePendingInviteFollow(userId, username) {
  const [followed, setFollowed] = useState(null)
  const startedForRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!userId || !username) return
    if (startedForRef.current === userId) return
    startedForRef.current = userId

    applyPendingInvite({ userId, username }).then(
      (result) => {
        if (mountedRef.current && result.status === 'followed') setFollowed(result.username)
      },
      (error) => console.error('Could not apply the invite:', error)
    )
  }, [userId, username])

  const dismiss = useCallback(() => setFollowed(null), [])
  return [followed, dismiss]
}

function InvitePage() {
  const { username: rawUsername } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const username = isValidInviteUsername(rawUsername) ? rawUsername : null
  const [inviter, setInviter] = useState(null)

  // Signed out: remember the invite for after sign-up. Signed in: this user
  // is already on Dogleg, so no invite is applied for them.
  useEffect(() => {
    if (!username) return
    if (user) {
      clearPendingInvite()
    } else {
      storePendingInvite(username)
    }
  }, [user, username])

  // Their name and photo if we can get them; "@username" otherwise
  useEffect(() => {
    if (!username || user) return
    let cancelled = false
    fetchInviterProfile(username).then(({ data }) => {
      if (!cancelled && data) setInviter(data)
    })
    return () => { cancelled = true }
  }, [user, username])

  if (!username) return <Navigate to="/" replace />
  if (user) return <Navigate to={`/profile/${username}`} replace />

  // AuthScreen opens on the right form and, for a /join page, continues to
  // the Feed after sign-in, where the invite is applied
  const goToLogin = (mode) => {
    navigate('/login', { state: { mode, from: location.pathname } })
  }

  const fullName = typeof inviter?.full_name === 'string' ? inviter.full_name.trim() : ''
  const displayName = fullName || `@${username}`
  const avatarUrl = typeof inviter?.avatar_url === 'string' && inviter.avatar_url ? inviter.avatar_url : null

  return (
    <div className="max-w-md mx-auto p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
        <div className="flex justify-center mb-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center" aria-hidden="true">
              <span className="text-green-700 font-semibold text-2xl">
                {getInitials(inviter || { username })}
              </span>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 break-words">
          {displayName} invited you to Dogleg
        </h1>
        {fullName && <p className="text-gray-600 mt-1 break-words">@{username}</p>}

        <p className="mt-3 text-gray-600">
          Strava for golf. Track every round. Watch your handicap drop.
        </p>

        <div className="mt-4 flex flex-col gap-1 text-sm text-gray-600">
          <p>📈 A real handicap, automatically</p>
          <p>🐶 A Dogleg Score for every round</p>
          <p>👥 See {fullName || `@${username}`}'s rounds in your feed</p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => goToLogin('signup')}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
          >
            Join free
          </button>
          <button
            type="button"
            onClick={() => goToLogin('signin')}
            className="w-full py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  )
}

export default InvitePage
