import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { readPendingInvite } from './utils/invite'

// The invite link (/join/:username) for a signed-out visitor, through the
// real router and AppLayout. (App.test.js covers the signed-in side.)

const mockProfiles = [{ id: 'alex-id', username: 'alex_fairway', full_name: 'Alex Fairway', avatar_url: null }]

jest.mock('./services/supabase', () => {
  const query = () => {
    const filters = []
    const builder = {
      select: () => builder,
      eq: (column, value) => { filters.push((row) => row[column] === value); return builder },
      maybeSingle: async () => ({ data: mockProfiles.find((row) => filters.every((f) => f(row))) || null, error: null }),
    }
    return builder
  }
  return {
    supabase: {
      from: () => query(),
      rpc: () => Promise.resolve({ data: null, error: { message: 'not used in these tests' } }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
})
jest.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    rechecking: false,
    signUp: async () => ({ error: null }),
    signIn: async () => ({ error: null }),
    signInWithGoogle: async () => ({ error: null }),
  }),
}))
// (virtual: this Jest can't resolve the package's "exports" map)
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true })

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = jest.fn()
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // React Router's v7 notices
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('a signed-out visitor sees the invite inside the public frame, and it is remembered', async () => {
  window.history.replaceState(null, '', '/join/alex_fairway')
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })).toBeInTheDocument()
  // PublicShell's header
  expect(screen.getByRole('button', { name: 'Sign up free' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/join/alex_fairway')
  expect(readPendingInvite()?.username).toBe('alex_fairway')
})

test('Join free opens sign-up with the invite line', async () => {
  window.history.replaceState(null, '', '/join/alex_fairway')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Join free' }))

  expect(window.location.pathname).toBe('/login')
  expect(await screen.findByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  expect(screen.getByText('@alex_fairway invited you — create your free account to follow them.')).toBeInTheDocument()
})

test("the public frame's own Sign up free button opens sign-up with the invite line too", async () => {
  window.history.replaceState(null, '', '/join/alex_fairway')
  render(<App />)
  await screen.findByRole('heading', { name: 'Alex Fairway invited you to Dogleg' })
  fireEvent.click(screen.getByRole('button', { name: 'Sign up free' }))

  expect(await screen.findByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  expect(screen.getByText('@alex_fairway invited you — create your free account to follow them.')).toBeInTheDocument()
})

test('an invite for a username nobody has still shows, as @username', async () => {
  window.history.replaceState(null, '', '/join/nobody_here')
  render(<App />)
  expect(await screen.findByRole('heading', { name: '@nobody_here invited you to Dogleg' })).toBeInTheDocument()
})

test('a junk invite link goes to the landing page and saves nothing', async () => {
  window.history.replaceState(null, '', '/join/%3Cscript%3E')
  render(<App />)

  expect(await screen.findByRole('heading', { level: 1, name: /Strava for golf/ })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  expect(readPendingInvite()).toBeNull()
})
