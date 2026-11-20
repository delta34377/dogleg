import {
  getSafeRedirectPath,
  saveRedirectAfterLogin,
  takeRedirectAfterLogin,
  clearRedirectAfterLogin,
} from './safeRedirect'

describe('getSafeRedirectPath', () => {
  test('keeps normal same-site paths, including query strings', () => {
    expect(getSafeRedirectPath('/')).toBe('/')
    expect(getSafeRedirectPath('/rounds/ABC123')).toBe('/rounds/ABC123')
    expect(getSafeRedirectPath('/profile/mike?tab=rounds')).toBe('/profile/mike?tab=rounds')
  })

  test('rejects anything that could leave the site', () => {
    expect(getSafeRedirectPath('//evil.com')).toBe('/')
    expect(getSafeRedirectPath('/\\evil.com')).toBe('/')
    expect(getSafeRedirectPath('https://evil.com')).toBe('/')
    expect(getSafeRedirectPath('data:text/html,hello')).toBe('/')
    expect(getSafeRedirectPath('/\t/evil.com')).toBe('/')
    expect(getSafeRedirectPath('/\n/evil.com')).toBe('/')
  })

  test('rejects non-strings and empty values', () => {
    expect(getSafeRedirectPath(undefined)).toBe('/')
    expect(getSafeRedirectPath(null)).toBe('/')
    expect(getSafeRedirectPath('')).toBe('/')
    expect(getSafeRedirectPath({ pathname: '/x' })).toBe('/')
  })

  test('never redirects back to the login or reset screens', () => {
    expect(getSafeRedirectPath('/login')).toBe('/')
    expect(getSafeRedirectPath('/login?x=1')).toBe('/')
    expect(getSafeRedirectPath('/reset-password')).toBe('/')
    // ...but a similar-looking real page is fine
    expect(getSafeRedirectPath('/loginhelp')).toBe('/loginhelp')
  })

  test('uses the given fallback', () => {
    expect(getSafeRedirectPath('//evil.com', null)).toBeNull()
    expect(getSafeRedirectPath('/stats', null)).toBe('/stats')
  })
})

describe('redirectAfterLogin storage', () => {
  beforeEach(() => sessionStorage.clear())

  test('saves a valid path and returns it exactly once', () => {
    saveRedirectAfterLogin('/rounds/ABC123')
    expect(takeRedirectAfterLogin()).toBe('/rounds/ABC123')
    expect(takeRedirectAfterLogin()).toBeNull()
  })

  test('does not save unsafe paths or the home page', () => {
    saveRedirectAfterLogin('//evil.com')
    expect(takeRedirectAfterLogin()).toBeNull()
    saveRedirectAfterLogin('/')
    expect(takeRedirectAfterLogin()).toBeNull()
  })

  test('ignores a tampered stored value', () => {
    sessionStorage.setItem('redirectAfterLogin', '//evil.com')
    expect(takeRedirectAfterLogin()).toBeNull()
    expect(sessionStorage.getItem('redirectAfterLogin')).toBeNull()
  })

  test('clear removes a saved path', () => {
    saveRedirectAfterLogin('/stats')
    clearRedirectAfterLogin()
    expect(takeRedirectAfterLogin()).toBeNull()
  })
})
