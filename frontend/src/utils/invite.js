// Invite links: https://www.dogleg.io/join/<username>
//
// A golfer shares their link with the "Invite friends" button
// (components/InviteButton.js). A friend who opens it signed out sees
// components/InvitePage.js, which remembers the invite in this browser. Once
// the friend has an account and a username, the app shell follows the
// inviter for them (applyPendingInvite in InvitePage.js) and forgets the
// invite.
//
// The invite lives in localStorage, which can be missing or throw (private
// browsing, storage turned off), so every access is wrapped in try/catch and
// a failure just means "no invite".

export const PENDING_INVITE_KEY = 'dogleg_pending_invite'

// An invite that hasn't been used within 30 days is forgotten
export const PENDING_INVITE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// A saved time this far in the future (a phone clock that was wrong) still
// counts; anything later is junk
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

// Usernames are 3-20 letters, numbers and underscores (UsernameSetup.js and
// the sign-up form). The app stores them in lower case; upper case letters
// are accepted here too, like the sign-up form's own check, and the name is
// then looked up exactly as written (as /profile/:username does).
// api/_lib/invitePreview.js has a copy of this rule for link previews.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/

export function isValidInviteUsername(username) {
  return typeof username === 'string' && USERNAME_PATTERN.test(username)
}

const PRODUCTION_ORIGIN = 'https://www.dogleg.io'

function currentOrigin() {
  try {
    const origin = window.location.origin
    if (typeof origin === 'string' && /^https?:\/\//.test(origin)) return origin
  } catch {
    // no window (never in the browser)
  }
  return PRODUCTION_ORIGIN
}

// The link a golfer shares, e.g. https://www.dogleg.io/join/alex_fairway.
// null for a username the app would never have.
export function buildInviteUrl(username) {
  if (!isValidInviteUsername(username)) return null
  return `${currentOrigin()}/join/${encodeURIComponent(username)}`
}

// Forget the saved invite
export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // storage unavailable: nothing was saved anyway
  }
}

// Remember who invited this visitor. Returns true if it was saved.
export function storePendingInvite(username, now = Date.now()) {
  if (!isValidInviteUsername(username)) return false
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ username, savedAt: now }))
    return true
  } catch {
    return false
  }
}

// The saved invite ({ username, savedAt }), or null when there is none, it is
// older than 30 days, or what is saved isn't a valid invite. Expired and junk
// entries are deleted on the way.
export function readPendingInvite(now = Date.now()) {
  let raw
  try {
    raw = localStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let saved = null
  try {
    saved = JSON.parse(raw)
  } catch {
    // not JSON: treated as junk below
  }

  const savedAt = saved && typeof saved === 'object' ? saved.savedAt : undefined
  const isValid = saved
    && typeof saved === 'object'
    && isValidInviteUsername(saved.username)
    && typeof savedAt === 'number'
    && Number.isFinite(savedAt)
    && now - savedAt <= PENDING_INVITE_MAX_AGE_MS
    && savedAt - now <= MAX_CLOCK_SKEW_MS

  if (!isValid) {
    clearPendingInvite()
    return null
  }
  return { username: saved.username, savedAt }
}
