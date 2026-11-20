import {
  ANALYTICS_OPTOUT_KEY,
  getAnalyticsChoice,
  getAnalyticsOptOut,
  setAnalyticsOptOut,
} from './analyticsConsent'

beforeEach(() => {
  window.localStorage.clear()
  window.gtag = jest.fn()
})

afterEach(() => {
  delete window.gtag
  jest.restoreAllMocks()
})

it('has no choice and is not opted out by default', () => {
  expect(getAnalyticsChoice()).toBeNull()
  expect(getAnalyticsOptOut()).toBe(false)
})

it('reads the same values index.html reads', () => {
  window.localStorage.setItem(ANALYTICS_OPTOUT_KEY, '1')
  expect(getAnalyticsChoice()).toBe('off')
  expect(getAnalyticsOptOut()).toBe(true)

  window.localStorage.setItem(ANALYTICS_OPTOUT_KEY, '0')
  expect(getAnalyticsChoice()).toBe('on')
  expect(getAnalyticsOptOut()).toBe(false)

  window.localStorage.setItem(ANALYTICS_OPTOUT_KEY, 'something else')
  expect(getAnalyticsChoice()).toBeNull()
})

it('opting out saves "1" and denies all four consent types', () => {
  expect(setAnalyticsOptOut(true)).toBe(true)
  expect(window.localStorage.getItem(ANALYTICS_OPTOUT_KEY)).toBe('1')
  expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
})

it('opting back in saves "0" and grants analytics cookies only', () => {
  setAnalyticsOptOut(true)
  expect(setAnalyticsOptOut(false)).toBe(true)
  expect(window.localStorage.getItem(ANALYTICS_OPTOUT_KEY)).toBe('0')
  expect(window.gtag).toHaveBeenLastCalledWith('consent', 'update', { analytics_storage: 'granted' })
})

it('deletes existing Google Analytics cookies when opting out, and keeps others', () => {
  document.cookie = '_ga=GA1.1.123.456; path=/'
  document.cookie = '_ga_5H72L3N9MF=GS1.1.789; path=/'
  document.cookie = 'unrelated=keep-me; path=/'

  setAnalyticsOptOut(true)

  expect(document.cookie).not.toMatch(/_ga/)
  expect(document.cookie).toMatch(/unrelated=keep-me/)
})

it('still works when gtag is missing (blocked by an ad blocker)', () => {
  delete window.gtag
  expect(() => setAnalyticsOptOut(true)).not.toThrow()
  expect(getAnalyticsOptOut()).toBe(true)
})

it('does not crash when storage is blocked, and reports it was not saved', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('SecurityError')
  })
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError')
  })

  expect(setAnalyticsOptOut(true)).toBe(false)
  // The choice still reaches Google Analytics for this page
  expect(window.gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied' }))
  expect(getAnalyticsChoice()).toBeNull()
})
