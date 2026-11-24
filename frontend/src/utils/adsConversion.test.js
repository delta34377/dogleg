import { trackSignUp, trackSignUpIfNew, SIGNUP_CONVERSION } from './adsConversion'

afterEach(() => {
  delete window.gtag
})

it('sends the Analytics sign_up event and the Google Ads conversion', () => {
  window.gtag = jest.fn()
  trackSignUp('google')
  expect(window.gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' })
  expect(window.gtag).toHaveBeenCalledWith('event', 'conversion', {
    send_to: SIGNUP_CONVERSION,
    value: 1.0,
    currency: 'USD',
  })
})

it('defaults the method to email', () => {
  window.gtag = jest.fn()
  trackSignUp()
  expect(window.gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'email' })
})

it('does nothing when gtag is missing (blocked by an ad blocker)', () => {
  expect(() => trackSignUp('email')).not.toThrow()
})

it('never throws when gtag itself fails', () => {
  window.gtag = jest.fn(() => { throw new Error('boom') })
  expect(() => trackSignUp('email')).not.toThrow()
})

describe('trackSignUpIfNew', () => {
  const NOW = Date.parse('2026-11-24T12:00:00Z')
  const newUser = { id: 'u1', created_at: '2026-11-24T11:50:00Z', app_metadata: { provider: 'google' } }

  beforeEach(() => {
    window.localStorage.clear()
    window.gtag = jest.fn()
  })

  it('counts a sign-in by a brand-new account once', () => {
    expect(trackSignUpIfNew(newUser, NOW)).toBe(true)
    expect(window.gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'conversion', expect.objectContaining({ send_to: SIGNUP_CONVERSION }))
    window.gtag.mockClear()
    expect(trackSignUpIfNew(newUser, NOW)).toBe(false)
    expect(window.gtag).not.toHaveBeenCalled()
  })

  it('counts an email sign-up confirmed hours later', () => {
    const user = { id: 'u2', created_at: '2026-11-24T01:00:00Z' }
    expect(trackSignUpIfNew(user, NOW)).toBe(true)
    expect(window.gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'email' })
  })

  it('ignores accounts older than a day', () => {
    const user = { id: 'u3', created_at: '2026-11-20T12:00:00Z' }
    expect(trackSignUpIfNew(user, NOW)).toBe(false)
    expect(window.gtag).not.toHaveBeenCalled()
  })

  it('ignores a missing user or creation time', () => {
    expect(trackSignUpIfNew(null, NOW)).toBe(false)
    expect(trackSignUpIfNew({ id: 'u4' }, NOW)).toBe(false)
    expect(window.gtag).not.toHaveBeenCalled()
  })
})
