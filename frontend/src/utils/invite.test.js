import {
  PENDING_INVITE_KEY,
  PENDING_INVITE_MAX_AGE_MS,
  isValidInviteUsername,
  buildInviteUrl,
  storePendingInvite,
  readPendingInvite,
  clearPendingInvite,
} from './invite'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('isValidInviteUsername', () => {
  test('accepts the usernames the app gives out', () => {
    for (const ok of ['abc', 'alex_fairway', 'golfer99', '___', 'a'.repeat(20), 'Alex_F']) {
      expect(isValidInviteUsername(ok)).toBe(true)
    }
  })

  test('rejects anything else', () => {
    for (const bad of [
      '', 'ab', 'a'.repeat(21), 'alex fairway', 'alex.fairway', 'alex-f', 'alex/f',
      '<script>', '"><img src=x>', '../etc', 'émile', ' alex', 'alex\n',
      undefined, null, 42, {}, ['alex_fairway'],
    ]) {
      expect(isValidInviteUsername(bad)).toBe(false)
    }
  })
})

describe('buildInviteUrl', () => {
  test('is this site plus /join/<username>', () => {
    expect(buildInviteUrl('alex_fairway')).toBe(`${window.location.origin}/join/alex_fairway`)
  })

  test('gives no link for a username the app would never have', () => {
    expect(buildInviteUrl('')).toBeNull()
    expect(buildInviteUrl(undefined)).toBeNull()
    expect(buildInviteUrl('<script>')).toBeNull()
  })
})

describe('the pending invite', () => {
  test('is saved as { username, savedAt } and read back', () => {
    expect(storePendingInvite('alex_fairway', NOW)).toBe(true)
    expect(JSON.parse(localStorage.getItem(PENDING_INVITE_KEY))).toEqual({ username: 'alex_fairway', savedAt: NOW })
    expect(readPendingInvite(NOW + DAY)).toEqual({ username: 'alex_fairway', savedAt: NOW })
  })

  test('a newer invite replaces the older one', () => {
    storePendingInvite('alex_fairway', NOW)
    storePendingInvite('pal', NOW + 1000)
    expect(readPendingInvite(NOW + 2000)).toEqual({ username: 'pal', savedAt: NOW + 1000 })
  })

  test('an invalid username is never saved', () => {
    expect(storePendingInvite('<script>', NOW)).toBe(false)
    expect(storePendingInvite(undefined, NOW)).toBe(false)
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })

  test('is still there after 30 days and forgotten after that', () => {
    storePendingInvite('alex_fairway', NOW)
    expect(readPendingInvite(NOW + PENDING_INVITE_MAX_AGE_MS)).not.toBeNull()
    expect(readPendingInvite(NOW + PENDING_INVITE_MAX_AGE_MS + 1)).toBeNull()
    // and deleted, so it doesn't come back
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
  })

  test('a slightly wrong clock is fine, a time far in the future is junk', () => {
    storePendingInvite('alex_fairway', NOW + 60 * 60 * 1000)
    expect(readPendingInvite(NOW)).not.toBeNull()
    storePendingInvite('alex_fairway', NOW + 2 * DAY)
    expect(readPendingInvite(NOW)).toBeNull()
  })

  test('junk in storage reads as no invite and is cleaned up', () => {
    const junk = [
      'not json',
      'null',
      '"alex_fairway"',
      JSON.stringify({ username: '<script>', savedAt: NOW }),
      JSON.stringify({ username: 'alex_fairway' }),
      JSON.stringify({ username: 'alex_fairway', savedAt: 'yesterday' }),
      JSON.stringify({ username: 'alex_fairway', savedAt: null }),
      JSON.stringify([{ username: 'alex_fairway', savedAt: NOW }]),
    ]
    for (const value of junk) {
      localStorage.setItem(PENDING_INVITE_KEY, value)
      expect(readPendingInvite(NOW)).toBeNull()
      expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull()
    }
  })

  test('only the username and time come back, nothing else that was stored', () => {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ username: 'alex_fairway', savedAt: NOW, extra: '<b>' }))
    expect(readPendingInvite(NOW)).toEqual({ username: 'alex_fairway', savedAt: NOW })
  })

  test('clearPendingInvite forgets it', () => {
    storePendingInvite('alex_fairway', NOW)
    clearPendingInvite()
    expect(readPendingInvite(NOW)).toBeNull()
  })

  test('uses the current time by default', () => {
    expect(storePendingInvite('alex_fairway')).toBe(true)
    expect(readPendingInvite()).toEqual({ username: 'alex_fairway', savedAt: expect.any(Number) })
  })
})

describe('when storage is unavailable (private browsing, storage blocked)', () => {
  const blockStorage = () => {
    const blocked = () => { throw new Error('SecurityError') }
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
  }

  test('nothing throws: saving fails quietly and there is no invite', () => {
    blockStorage()
    expect(storePendingInvite('alex_fairway', NOW)).toBe(false)
    expect(readPendingInvite(NOW)).toBeNull()
    expect(() => clearPendingInvite()).not.toThrow()
  })

  test('junk that cannot be deleted still reads as no invite', () => {
    localStorage.setItem(PENDING_INVITE_KEY, 'not json')
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(readPendingInvite(NOW)).toBeNull()
  })
})
