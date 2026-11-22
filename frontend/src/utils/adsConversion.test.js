import { trackSignUp, SIGNUP_CONVERSION } from './adsConversion'

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
