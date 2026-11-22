import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import AuthScreen from './AuthScreen'
import { storePendingInvite } from '../../utils/invite'

const mockAuth = {}
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

function WhereAmI() {
  const location = useLocation()
  return <p data-testid="path">{location.pathname}</p>
}

// AuthScreen at /login, opened with router state (mode, from) like the app does
function renderLogin(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AuthScreen />} />
        <Route path="*" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>
  )
}

// The headline paragraph (its two lines are separate spans)
const headline = () => screen.getByText((_, element) =>
  element.tagName === 'P' && element.textContent.startsWith('Strava for golf.'))
const isSignUpForm = () => !!screen.queryByRole('button', { name: 'Create Account' })
const isSignInForm = () => !!screen.queryByRole('button', { name: 'Sign In' })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  Object.assign(mockAuth, {
    user: null,
    loading: false,
    signUp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signIn: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithPhone: jest.fn(),
    verifyPhoneOTP: jest.fn(),
    signInWithGoogle: jest.fn().mockResolvedValue({ error: null }),
    resetPassword: jest.fn(),
  })
})

describe('wording', () => {
  test('matches the landing page: headline and three feature points', () => {
    renderLogin({ mode: 'signup' })
    expect(headline()).toHaveTextContent('Strava for golf. Track every round. Watch your handicap drop.')
    expect(screen.getByText('📈 A real handicap, automatically')).toBeInTheDocument()
    expect(screen.getByText('🐶 A Dogleg Score for every round')).toBeInTheDocument()
    expect(screen.getByText("👥 Your friends' rounds in one feed")).toBeInTheDocument()
    expect(screen.queryByText(/Your Golf Life, Socialized/)).not.toBeInTheDocument()
  })

  test('the sign-in form says the same', () => {
    renderLogin()
    expect(isSignInForm()).toBe(true)
    expect(headline()).toHaveTextContent('Strava for golf. Track every round. Watch your handicap drop.')
  })

  test('the sign-up form keeps all its fields', () => {
    renderLogin({ mode: 'signup' })
    expect(screen.getByPlaceholderText('johndoe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('••••••••')).toHaveLength(2)
    expect(screen.getByLabelText(/I am at least 13 years old/)).toBeInTheDocument()
    expect(screen.getByLabelText(/newsletter/)).toBeInTheDocument()
  })

  test('a visitor from a shared round still gets the round line', () => {
    renderLogin({ mode: 'signup', from: '/rounds/UM6QVL' })
    expect(screen.getByText('Create a free account to react and comment on this round.')).toBeInTheDocument()
  })
})

describe('arriving from an invite link', () => {
  test('shows who invited them, and opens on sign-up by default', () => {
    storePendingInvite('alex_fairway')
    renderLogin({ from: '/join/alex_fairway' })
    expect(isSignUpForm()).toBe(true)
    expect(screen.getByText('@alex_fairway invited you — create your free account to follow them.')).toBeInTheDocument()
  })

  test('Log in from the invite page opens sign-in, with a matching line', () => {
    storePendingInvite('alex_fairway')
    renderLogin({ mode: 'signin', from: '/join/alex_fairway' })
    expect(isSignInForm()).toBe(true)
    expect(screen.getByText('Sign in to follow @alex_fairway.')).toBeInTheDocument()

    // Switching to sign-up switches the line too
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(screen.getByText('@alex_fairway invited you — create your free account to follow them.')).toBeInTheDocument()
  })

  test('no remembered invite (expired, storage blocked): no invite line', () => {
    renderLogin({ mode: 'signup', from: '/join/alex_fairway' })
    expect(screen.queryByText(/invited you/)).not.toBeInTheDocument()
  })

  test('a junk invite in storage is never shown', () => {
    localStorage.setItem('dogleg_pending_invite', JSON.stringify({ username: '<img src=x>', savedAt: Date.now() }))
    renderLogin({ mode: 'signup' })
    expect(screen.queryByText(/invited you/)).not.toBeInTheDocument()
  })

  test('the line shows on the landing-page sign-up too, while the invite is remembered', () => {
    storePendingInvite('alex_fairway')
    renderLogin({ mode: 'signup' })
    expect(screen.getByText('@alex_fairway invited you — create your free account to follow them.')).toBeInTheDocument()
  })

  test('after signing in they go to the Feed, where the invite is applied', async () => {
    storePendingInvite('alex_fairway')
    renderLogin({ mode: 'signin', from: '/join/alex_fairway' })
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'pal@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/))
    expect(mockAuth.signIn).toHaveBeenCalledWith('pal@example.com', 'secret123')
  })

  test("the sign-up confirmation email opens the Feed, not the invite page", async () => {
    storePendingInvite('alex_fairway')
    renderLogin({ from: '/join/alex_fairway' })
    fireEvent.change(screen.getByPlaceholderText('johndoe'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Bie' } })
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'new@example.com' } })
    const [password, confirm] = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(password, { target: { value: 'secret123' } })
    fireEvent.change(confirm, { target: { value: 'secret123' } })
    fireEvent.click(screen.getByLabelText(/I am at least 13 years old/))
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() => expect(mockAuth.signUp).toHaveBeenCalled())
    expect(mockAuth.signUp.mock.calls[0][3]).toBe('/')
    expect(await screen.findByText('Check your email to confirm your account!')).toBeInTheDocument()
  })

  test('Google sign-in does not save the invite page as the place to come back to', async () => {
    storePendingInvite('alex_fairway')
    sessionStorage.setItem('redirectAfterLogin', '/rounds/OLD')
    renderLogin({ from: '/join/alex_fairway' })
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))

    await waitFor(() => expect(mockAuth.signInWithGoogle).toHaveBeenCalled())
    expect(sessionStorage.getItem('redirectAfterLogin')).toBeNull()
  })

  test('an already signed-in visitor goes to the Feed', () => {
    storePendingInvite('alex_fairway')
    mockAuth.user = { id: 'me' }
    renderLogin({ from: '/join/alex_fairway' })
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
  })
})

// Without a remembered invite nobody is followed automatically, so the
// Feed would be a dead end: they go back to the invite link, which (signed
// in) opens the inviter's profile with its Follow button.
describe('arriving from an invite link the browser could not remember', () => {
  const blockStorage = () => {
    const blocked = () => { throw new Error('SecurityError') }
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('after signing in they go back to the invite link', async () => {
    blockStorage()
    renderLogin({ mode: 'signin', from: '/join/alex_fairway' })
    expect(screen.queryByText(/follow @alex_fairway/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'pal@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/join/alex_fairway'))
  })

  test("the sign-up confirmation email opens the invite link (the inviter's profile)", async () => {
    renderLogin({ from: '/join/alex_fairway' }) // nothing remembered
    expect(isSignUpForm()).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('johndoe'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Bie' } })
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'new@example.com' } })
    const [password, confirm] = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(password, { target: { value: 'secret123' } })
    fireEvent.change(confirm, { target: { value: 'secret123' } })
    fireEvent.click(screen.getByLabelText(/I am at least 13 years old/))
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() => expect(mockAuth.signUp).toHaveBeenCalled())
    expect(mockAuth.signUp.mock.calls[0][3]).toBe('/join/alex_fairway')
  })

  test("a remembered invite from someone else doesn't count", () => {
    storePendingInvite('someone_else')
    mockAuth.user = { id: 'me' }
    renderLogin({ from: '/join/alex_fairway' })
    expect(screen.getByTestId('path')).toHaveTextContent('/join/alex_fairway')
  })
})
