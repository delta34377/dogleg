import { StrictMode } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import InvitePage, { applyPendingInvite, fetchInviterProfile, usePendingInviteFollow } from './InvitePage'
import { supabase } from '../services/supabase'
import { followService } from '../services/followService'
import { PENDING_INVITE_KEY, readPendingInvite, storePendingInvite } from '../utils/invite'

jest.mock('../services/supabase', () => ({
  supabase: { from: jest.fn() },
}))
jest.mock('../services/followService', () => ({
  followService: { isFollowing: jest.fn(), followUser: jest.fn() },
}))

let mockAuth = { user: null }
jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const ALEX = { id: 'alex-id', username: 'alex_fairway', full_name: 'Alex Fairway', avatar_url: null }

// Lets pending lookups and follows finish
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

// profiles lookups answer with `result` (or throw it, for a network failure)
function mockProfileLookup(result) {
  const maybeSingle = jest.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  supabase.from.mockImplementation(() => ({ select }))
  return { select, eq, maybeSingle }
}

// Shows where the router ended up, and the state it was given
function WhereAmI() {
  const location = useLocation()
  return (
    <div>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="state">{JSON.stringify(location.state)}</p>
    </div>
  )
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/join/:username" element={<InvitePage />} />
        <Route path="*" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  mockAuth = { user: null }
  followService.isFollowing.mockResolvedValue(false)
  followService.followUser.mockResolvedValue({ data: {}, error: null })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('InvitePage, signed out', () => {
  test("shows the inviter's name and remembers the invite", async () => {
    const lookup = mockProfileLookup({ data: ALEX, error: null })
    renderAt('/join/alex_fairway')

    expect(await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })).toBeInTheDocument()
    expect(screen.getByText('@alex_fairway')).toBeInTheDocument()
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(lookup.select).toHaveBeenCalledWith('id, username, full_name, avatar_url')
    expect(lookup.eq).toHaveBeenCalledWith('username', 'alex_fairway')
    expect(readPendingInvite()).toEqual({ username: 'alex_fairway', savedAt: expect.any(Number) })
  })

  test('shows the landing-page pitch, Join free and Log in', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    renderAt('/join/alex_fairway')
    await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })

    expect(screen.getByText('Strava for golf. Track every round. Watch your handicap drop.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join free' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
  })

  test('falls back to @username, without an error, when the profile cannot be read', async () => {
    mockProfileLookup({ data: null, error: { message: 'permission denied for table profiles' } })
    renderAt('/join/alex_fairway')

    expect(screen.getByRole('heading', { name: '@alex_fairway invited you to Dogleg' })).toBeInTheDocument()
    await waitFor(() => expect(supabase.from).toHaveBeenCalled())
    await settle()
    expect(screen.getByRole('heading', { name: '@alex_fairway invited you to Dogleg' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/error|wrong|failed/i)).not.toBeInTheDocument()
    expect(readPendingInvite()?.username).toBe('alex_fairway')
  })

  test('falls back to @username when no golfer has that name or the request fails', async () => {
    mockProfileLookup({ data: null, error: null })
    const { unmount } = renderAt('/join/nobody_here')
    await settle()
    expect(screen.getByRole('heading', { name: '@nobody_here invited you to Dogleg' })).toBeInTheDocument()
    unmount()

    mockProfileLookup(new Error('Failed to fetch'))
    renderAt('/join/alex_fairway')
    await settle()
    expect(screen.getByRole('heading', { name: '@alex_fairway invited you to Dogleg' })).toBeInTheDocument()
  })

  test('Join free opens sign-up, coming from this invite page', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    renderAt('/join/alex_fairway')
    fireEvent.click(screen.getByRole('button', { name: 'Join free' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/login')
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ mode: 'signup', from: '/join/alex_fairway' })
  })

  test('Log in opens sign-in', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    renderAt('/join/alex_fairway')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/login')
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({ mode: 'signin', from: '/join/alex_fairway' })
  })

  test('a username the app would never have goes to the home page, and nothing is saved or looked up', () => {
    mockProfileLookup({ data: ALEX, error: null })
    for (const path of ['/join/ab', '/join/%3Cscript%3E', '/join/not.a.username', `/join/${'a'.repeat(21)}`]) {
      const { unmount } = renderAt(path)
      expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
      unmount()
    }
    expect(supabase.from).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })
})

describe('InvitePage, signed in', () => {
  test("goes straight to the inviter's profile and forgets any remembered invite", () => {
    mockAuth = { user: { id: 'me' }, profile: { id: 'me', username: 'me_golfer' } }
    storePendingInvite('someone_else')
    renderAt('/join/alex_fairway')

    expect(screen.getByTestId('path')).toHaveTextContent('/profile/alex_fairway')
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('fetchInviterProfile', () => {
  test('returns the public profile, or null data when there is none', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    expect(await fetchInviterProfile('alex_fairway')).toEqual({ data: ALEX, error: null })
    mockProfileLookup({ data: null, error: null })
    expect(await fetchInviterProfile('alex_fairway')).toEqual({ data: null, error: null })
  })

  test('never throws', async () => {
    const failure = new Error('Failed to fetch')
    mockProfileLookup(failure)
    expect(await fetchInviterProfile('alex_fairway')).toEqual({ data: null, error: failure })
    supabase.from.mockImplementation(() => { throw failure })
    expect(await fetchInviterProfile('alex_fairway')).toEqual({ data: null, error: failure })
  })

  test('does not query for an invalid username', async () => {
    expect(await fetchInviterProfile('<script>')).toEqual({ data: null, error: null })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('applyPendingInvite', () => {
  const ME = { userId: 'me', username: 'me_golfer' }

  test('follows the inviter once and forgets the invite', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    storePendingInvite('alex_fairway')

    expect(await applyPendingInvite(ME)).toEqual({ status: 'followed', username: 'alex_fairway' })
    expect(followService.followUser).toHaveBeenCalledTimes(1)
    expect(followService.followUser).toHaveBeenCalledWith('alex-id')
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()

    // Nothing left to do the second time
    expect(await applyPendingInvite(ME)).toEqual({ status: 'none' })
    expect(followService.followUser).toHaveBeenCalledTimes(1)
  })

  test('does nothing without an invite', async () => {
    expect(await applyPendingInvite(ME)).toEqual({ status: 'none' })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(followService.followUser).not.toHaveBeenCalled()
  })

  test('waits for a username: the invite stays until there is one', async () => {
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite({ userId: 'me', username: null })).toEqual({ status: 'waiting' })
    expect(await applyPendingInvite({ userId: null, username: 'me_golfer' })).toEqual({ status: 'waiting' })
    expect(readPendingInvite()?.username).toBe('alex_fairway')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('your own invite link is just forgotten', async () => {
    storePendingInvite('me_golfer')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'self', username: 'me_golfer' })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(followService.followUser).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()

    // Same account found by the lookup (e.g. different letter case)
    mockProfileLookup({ data: { ...ALEX, id: 'me' }, error: null })
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'self', username: 'alex_fairway' })
    expect(followService.followUser).not.toHaveBeenCalled()
  })

  test('no golfer with that username: forgotten, nobody followed', async () => {
    mockProfileLookup({ data: null, error: null })
    storePendingInvite('gone_golfer')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'not_found', username: 'gone_golfer' })
    expect(followService.followUser).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })

  test('a failed lookup: forgotten, so it is not retried forever', async () => {
    mockProfileLookup({ data: null, error: { message: 'boom' } })
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'error', username: 'alex_fairway' })
    expect(followService.followUser).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()

    mockProfileLookup(new Error('Failed to fetch'))
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'error', username: 'alex_fairway' })
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })

  test('a failed follow: forgotten, and not reported as followed', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    followService.followUser.mockResolvedValue({ data: null, error: { message: 'insert failed' } })
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'error', username: 'alex_fairway' })
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()

    followService.followUser.mockRejectedValue(new Error('offline'))
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'error', username: 'alex_fairway' })
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })

  test('already following: no second follow', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    followService.isFollowing.mockResolvedValue(true)
    storePendingInvite('alex_fairway')
    expect(await applyPendingInvite(ME)).toEqual({ status: 'already_following', username: 'alex_fairway' })
    expect(followService.isFollowing).toHaveBeenCalledWith('alex-id')
    expect(followService.followUser).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })
})

describe('usePendingInviteFollow (used by the app shell)', () => {
  function Harness({ userId, username }) {
    const [followed, dismiss] = usePendingInviteFollow(userId, username)
    return followed ? (
      <div>
        <p>now following {followed}</p>
        <button type="button" onClick={dismiss}>dismiss</button>
      </div>
    ) : <p>nothing</p>
  }

  test('follows once under StrictMode and reports who', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    storePendingInvite('alex_fairway')
    render(<StrictMode><Harness userId="me" username="me_golfer" /></StrictMode>)

    expect(await screen.findByText('now following alex_fairway')).toBeInTheDocument()
    expect(followService.followUser).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))
    expect(screen.getByText('nothing')).toBeInTheDocument()
  })

  test('waits for the username, then follows', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    storePendingInvite('alex_fairway')
    const { rerender } = render(<Harness userId="me" username={undefined} />)
    await settle()
    expect(followService.followUser).not.toHaveBeenCalled()
    expect(readPendingInvite()?.username).toBe('alex_fairway')

    rerender(<Harness userId="me" username="me_golfer" />)
    expect(await screen.findByText('now following alex_fairway')).toBeInTheDocument()
    expect(followService.followUser).toHaveBeenCalledTimes(1)
  })

  test('runs only once even if the username changes later', async () => {
    mockProfileLookup({ data: ALEX, error: null })
    storePendingInvite('alex_fairway')
    const { rerender } = render(<Harness userId="me" username="me_golfer" />)
    await screen.findByText('now following alex_fairway')

    storePendingInvite('pal_99')
    rerender(<Harness userId="me" username="me_golfer_2" />)
    await settle()
    expect(followService.followUser).toHaveBeenCalledTimes(1)
  })

  test('shows nothing when the follow did not happen', async () => {
    mockProfileLookup({ data: null, error: null })
    storePendingInvite('gone_golfer')
    render(<Harness userId="me" username="me_golfer" />)
    await settle()
    expect(screen.getByText('nothing')).toBeInTheDocument()
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })
})
