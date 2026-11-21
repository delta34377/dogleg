import { StrictMode } from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import App from './App'
import { followService } from './services/followService'
import { PENDING_INVITE_KEY, readPendingInvite } from './utils/invite'

// The whole invite trip through the real app, in StrictMode like
// src/index.js: a friend opens /join/<username> signed out, signs in or signs
// up, and lands in the app following the inviter. Sign-in state lives in a
// small store standing in for AuthContext, so a test can sign the friend in
// half way through, as Supabase would. The database is a tiny in-memory
// stand-in; followService, InvitePage, AuthScreen, UsernameSetup and the
// app shell are the real code. (App.invite.test.js and App.test.js cover
// the signed-out and signed-in halves on their own.)

const mockDb = {}
const mockAuthStore = {
  state: {},
  listeners: new Set(),
  set(patch) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  },
}

const ALEX = { id: 'alex-id', username: 'alex_fairway', full_name: 'Alex Fairway', avatar_url: null }
const NEW_USER = { id: 'new-id', email: 'new@example.com' }

jest.mock('./services/supabase', () => {
  const makeQuery = (table) => {
    const q = { action: 'select', filters: [], rows: null, updates: null }
    const matches = (row) => q.filters.every((check) => check(row))
    const run = async (mode) => {
      const rows = mockDb[table] || []
      if (q.action === 'insert') {
        const inserted = q.rows.map((row, i) => ({ id: `${table}-${rows.length + i}`, ...row }))
        mockDb[table] = [...rows, ...inserted]
        return { data: mode === 'single' ? inserted[0] : inserted, error: null }
      }
      if (q.action === 'update') {
        mockDb[table] = rows.map((row) => (matches(row) ? { ...row, ...q.updates } : row))
        const updated = mockDb[table].filter(matches)
        return { data: mode === 'single' ? updated[0] : updated, error: null }
      }
      const found = rows.filter(matches)
      if (mode === 'single') {
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: 'PGRST116' } }
      }
      if (mode === 'maybeSingle') return { data: found[0] || null, error: null }
      return { data: found, error: null }
    }
    const builder = {
      select: () => builder,
      insert: (rows) => { q.action = 'insert'; q.rows = rows; return builder },
      update: (updates) => { q.action = 'update'; q.updates = updates; return builder },
      eq: (column, value) => { q.filters.push((row) => row[column] === value); return builder },
      in: (column, values) => { q.filters.push((row) => values.includes(row[column])); return builder },
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      single: () => run('single'),
      maybeSingle: () => run('maybeSingle'),
      then: (resolve, reject) => run('many').then(resolve, reject),
    }
    return builder
  }
  return {
    supabase: {
      from: (table) => makeQuery(table),
      rpc: () => Promise.resolve({ data: null, error: { message: 'not used in these tests' } }),
      auth: { getUser: () => Promise.resolve({ data: { user: mockAuthStore.state.user } }) },
    },
  }
})

jest.mock('./context/AuthContext', () => {
  const { useSyncExternalStore: useStore } = jest.requireActual('react')
  const subscribe = (listener) => {
    mockAuthStore.listeners.add(listener)
    return () => mockAuthStore.listeners.delete(listener)
  }
  return {
    AuthProvider: ({ children }) => children,
    useAuth: () => useStore(subscribe, () => mockAuthStore.state),
  }
})

// Parts of the app these tests don't look at
jest.mock('./components/Feed', () => {
  const { forwardRef: mockForwardRef } = jest.requireActual('react')
  return mockForwardRef(function MockFeed() { return <p>The Feed</p> })
})
jest.mock('./components/UserProfile', () => {
  const { useParams } = jest.requireActual('react-router-dom')
  return function MockUserProfile() {
    const { username } = useParams()
    return <h1>{`Profile of ${username}`}</h1>
  }
})
jest.mock('./components/NotificationDropdown', () => () => null)
jest.mock('./components/IOSInstallPrompt', () => () => null)
// (virtual: this Jest can't resolve the package's "exports" map)
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true })

// What signing in does to AuthContext: a user, then their profile row
function signInAs(user) {
  const profile = mockDb.profiles.find((p) => p.id === user.id) || null
  mockAuthStore.set({ user, profile })
}

beforeEach(() => {
  Object.assign(mockDb, {
    profiles: [ALEX, { id: NEW_USER.id, username: 'new_golfer', full_name: 'New Golfer' }],
    follows: [],
  })
  mockAuthStore.listeners.clear()
  mockAuthStore.state = {
    user: null,
    profile: null,
    loading: false,
    rechecking: false,
    signIn: jest.fn(async () => {
      signInAs(NEW_USER)
      return { data: {}, error: null }
    }),
    signUp: jest.fn(async () => ({ data: {}, error: null })),
    signInWithGoogle: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    updateProfile: jest.fn(async (updates) => {
      const me = mockAuthStore.state.user
      mockDb.profiles = mockDb.profiles.map((p) => (p.id === me.id ? { ...p, ...updates } : p))
      const profile = mockDb.profiles.find((p) => p.id === me.id)
      mockAuthStore.set({ profile })
      return { data: profile, error: null }
    }),
    loadProfile: jest.fn(async () => {}),
  }
  localStorage.clear()
  sessionStorage.clear()
  window.scrollTo = jest.fn()
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // React Router's v7 notices
})

afterEach(() => {
  jest.restoreAllMocks()
})

const renderApp = (path) => {
  window.history.replaceState(null, '', path)
  return render(<StrictMode><App /></StrictMode>)
}

const signInWithEmail = () => {
  fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'new@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
}

const followsOfNewUser = () => mockDb.follows.filter((f) => f.follower_id === NEW_USER.id)

test('invite page -> Log in -> signed in on the Feed, following the inviter exactly once', async () => {
  const followUser = jest.spyOn(followService, 'followUser')
  renderApp('/join/alex_fairway')
  await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })
  // The page's own Log in button (the header has one too)
  fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Log in' }))

  expect(await screen.findByText('Sign in to follow @alex_fairway.')).toBeInTheDocument()
  signInWithEmail()

  expect(await screen.findByText("You're now following @alex_fairway")).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  expect(screen.getByText('The Feed')).toBeInTheDocument()
  expect(followsOfNewUser()).toEqual([expect.objectContaining({ following_id: 'alex-id' })])
  expect(followUser).toHaveBeenCalledTimes(1) // StrictMode runs effects twice
  expect(readPendingInvite()).toBeNull()
})

test('Google sign-up: the follow waits for the username, then happens once', async () => {
  const { unmount } = renderApp('/join/alex_fairway')
  fireEvent.click(await screen.findByRole('button', { name: 'Join free' }))
  fireEvent.click(await screen.findByRole('button', { name: /Continue with Google/ }))
  await waitFor(() => expect(mockAuthStore.state.signInWithGoogle).toHaveBeenCalled())
  // Nothing saved to come back to: Google returns to "/", which is right
  expect(sessionStorage.getItem('redirectAfterLogin')).toBeNull()

  // Back from Google (a fresh page load at "/") as a new account with no
  // username yet
  unmount()
  mockDb.profiles = mockDb.profiles.map((p) => (p.id === NEW_USER.id ? { ...p, username: null } : p))
  signInAs(NEW_USER)
  renderApp('/')

  const usernameBox = await screen.findByRole('textbox')
  expect(screen.getByText(/choose a username/)).toBeInTheDocument()
  expect(followsOfNewUser()).toEqual([])
  expect(readPendingInvite()?.username).toBe('alex_fairway')

  fireEvent.change(usernameBox, { target: { value: 'new_golfer' } })
  fireEvent.click(screen.getByRole('button', { name: /Let's Go/ }))

  expect(await screen.findByText("You're now following @alex_fairway")).toBeInTheDocument()
  expect(followsOfNewUser()).toHaveLength(1)
  expect(readPendingInvite()).toBeNull()
})

test("storage blocked: after signing in they land on the inviter's profile instead", async () => {
  const blocked = () => { throw new Error('SecurityError') }
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)

  renderApp('/join/alex_fairway')
  await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })
  // The page's own Log in button (the header has one too)
  fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Log in' }))
  await screen.findByRole('button', { name: 'Sign In' })
  signInWithEmail()

  expect(await screen.findByRole('heading', { name: 'Profile of alex_fairway' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/profile/alex_fairway')
  expect(followsOfNewUser()).toEqual([])
  expect(screen.queryByText(/You're now following/)).not.toBeInTheDocument()
})

test('an invite saved weeks ago that has expired is ignored after sign-in', async () => {
  localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ username: 'alex_fairway', savedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 }))
  signInAs(NEW_USER)
  renderApp('/')

  expect(await screen.findByText('The Feed')).toBeInTheDocument()
  await waitFor(() => expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull())
  expect(followsOfNewUser()).toEqual([])
})

