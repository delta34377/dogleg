import { searchService, SUGGESTION_WEIGHTS } from './searchService'

// A small in-memory stand-in for the Supabase client: each query is run
// against the tables below with the filters the service asked for (eq, neq,
// in, not-is-null, gte, the simple or=() lists it uses, order, limit), so the
// tests can describe the data instead of scripting replies in call order
// (several queries run in parallel). Every query is recorded in mockDb.calls.
const mockDb = { tables: {}, calls: [], failWhen: null }

jest.mock('./supabase', () => {
  const parseValue = (raw) => {
    if (raw === 'null') return null
    if (raw === 'true') return true
    if (raw === 'false') return false
    return raw
  }
  const same = (cell, value) => (typeof value === 'boolean' ? cell === value : cell != null && String(cell) === String(value))
  // "a.eq.x,b.is.null" -> a row matches if any part matches
  const orFilter = (text) => {
    const parts = text.split(',').map((part) => {
      const [column, op, ...rest] = part.split('.')
      const value = parseValue(rest.join('.'))
      if (op === 'eq') return (row) => same(row[column], value)
      if (op === 'is') return (row) => (value === null ? row[column] == null : row[column] === value)
      throw new Error(`mock: unsupported or() operator ${op}`)
    })
    return (row) => parts.some((matches) => matches(row))
  }

  const makeQuery = (table) => {
    const call = { table, ops: [] }
    mockDb.calls.push(call)
    const filters = []
    let columns = '*'
    let order = null
    let limit = null
    const record = (name, args) => call.ops.push([name, ...args])

    const run = async () => {
      if (mockDb.failWhen && mockDb.failWhen(call)) {
        return { data: null, error: { message: `${table} is unavailable` } }
      }
      let rows = (mockDb.tables[table] || []).filter((row) => filters.every((f) => f(row)))
      if (order) {
        const { column, ascending } = order
        rows = [...rows].sort((a, b) => {
          const x = a[column] ?? ''
          const y = b[column] ?? ''
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
        })
      }
      if (limit !== null) rows = rows.slice(0, limit)
      if (columns.trim() !== '*') {
        const names = columns.split(',').map((c) => c.trim())
        rows = rows.map((row) => Object.fromEntries(names.map((n) => [n, row[n] === undefined ? null : row[n]])))
      }
      return { data: rows, error: null }
    }

    const builder = {
      select: (...args) => { record('select', args); columns = args[0] || '*'; return builder },
      eq: (...args) => { record('eq', args); const [c, v] = args; filters.push((row) => row[c] === v); return builder },
      neq: (...args) => { record('neq', args); const [c, v] = args; filters.push((row) => row[c] != null && row[c] !== v); return builder },
      in: (...args) => { record('in', args); const [c, vs] = args; filters.push((row) => vs.includes(row[c])); return builder },
      not: (...args) => {
        record('not', args)
        const [c, op, v] = args
        if (op !== 'is' || v !== null) throw new Error('mock: only not(column, "is", null) is supported')
        filters.push((row) => row[c] != null)
        return builder
      },
      gte: (...args) => { record('gte', args); const [c, v] = args; filters.push((row) => row[c] != null && new Date(row[c]) >= new Date(v)); return builder },
      or: (...args) => { record('or', args); filters.push(orFilter(args[0])); return builder },
      order: (...args) => { record('order', args); order = { column: args[0], ascending: args[1]?.ascending !== false }; return builder },
      limit: (...args) => { record('limit', args); limit = args[0]; return builder },
      then: (resolve, reject) => run().then(resolve, reject),
    }
    return builder
  }

  return { supabase: { from: (table) => makeQuery(table) } }
})

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()

const profile = (id, extra = {}) => ({
  id,
  username: id,
  full_name: `${id[0].toUpperCase()}${id.slice(1)} Golfer`,
  avatar_url: null,
  bio: null,
  location: null,
  is_banned: false,
  created_at: daysAgo(400),
  ...extra,
})
const follow = (follower_id, following_id, extra = {}) => ({ id: `${follower_id}->${following_id}`, follower_id, following_id, created_at: daysAgo(5), ...extra })
let roundSeq = 0
const round = (user_id, extra = {}) => ({
  id: `round-${++roundSeq}`,
  user_id,
  course_id: null,
  course_name: '',
  club_name: '',
  played_at: daysAgo(60),
  created_at: daysAgo(60),
  is_private: false,
  is_deleted: false,
  ...extra,
})

const suggest = (limit) => searchService.getSuggestedUsers('me', limit)
const names = (data) => data.map((u) => u.username)
const reasonOf = (data, username) => data.find((u) => u.username === username)?.reason

beforeEach(() => {
  mockDb.tables = { profiles: [profile('me')], follows: [], rounds: [] }
  mockDb.calls = []
  mockDb.failWhen = null
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

describe('each signal', () => {
  test('"Follows you": someone who follows the user but is not followed back', async () => {
    mockDb.tables.profiles.push(profile('fan'))
    mockDb.tables.follows.push(follow('fan', 'me'))

    const { data, error } = await suggest()
    expect(error).toBeNull()
    expect(data).toEqual([{
      id: 'fan', username: 'fan', full_name: 'Fan Golfer', avatar_url: null, bio: null, location: null,
      reason: 'Follows you',
    }])
  })

  test('"Followed by @alice": a golfer followed by someone the user follows', async () => {
    mockDb.tables.profiles.push(profile('alice'), profile('carol'))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'carol'))

    const { data } = await suggest()
    expect(names(data)).toEqual(['carol'])
    expect(reasonOf(data, 'carol')).toBe('Followed by @alice')
  })

  test('"Followed by N people you follow", ranked above a golfer only one of them follows', async () => {
    mockDb.tables.profiles.push(profile('alice'), profile('bob'), profile('dave'), profile('carol'), profile('erin'))
    mockDb.tables.follows.push(
      follow('me', 'alice'), follow('me', 'bob'), follow('me', 'dave'),
      follow('alice', 'erin'),
      follow('alice', 'carol'), follow('bob', 'carol'), follow('dave', 'carol'),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['carol', 'erin'])
    expect(reasonOf(data, 'carol')).toBe('Followed by 3 people you follow')
    expect(reasonOf(data, 'erin')).toBe('Followed by @alice')
  })

  test('the friend is not named when their profile has no username', async () => {
    mockDb.tables.profiles.push(profile('alice', { username: null }), profile('carol'))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'carol'))

    const { data } = await suggest()
    expect(reasonOf(data, 'carol')).toBe('Followed by someone you follow')
  })

  test('"Plays <course>": a recent round at a course the user has played, named like everywhere else in the app', async () => {
    mockDb.tables.profiles.push(profile('pat'), profile('stranger'))
    mockDb.tables.rounds.push(
      round('me', { course_id: 'c-1', course_name: 'Black', club_name: 'Bethpage State Park', played_at: daysAgo(200) }),
      round('pat', { course_id: 'c-1', course_name: 'Black', club_name: 'Bethpage State Park' }),
      round('stranger', { course_id: 'c-2', course_name: 'Old Course', club_name: 'St Andrews Links' }),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['pat', 'stranger']) // stranger only as a plain fallback
    expect(reasonOf(data, 'pat')).toBe('Plays Black @ Bethpage State Park')
    expect(reasonOf(data, 'stranger')).toBeNull()
  })

  test('falls back to the club name when a round has no course id (custom courses are "-1")', async () => {
    mockDb.tables.profiles.push(profile('pat'), profile('quinn'))
    mockDb.tables.rounds.push(
      round('me', { course_id: '-1', course_name: '', club_name: 'MUNICIPAL GOLF CLUB OF THE PINES' }),
      round('pat', { course_id: null, club_name: 'Municipal Golf Club of the Pines ' }),
      round('quinn', { course_id: '-1', club_name: 'Some Other Club' }),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['pat', 'quinn'])
    expect(reasonOf(data, 'quinn')).toBeNull()
    // ALL CAPS club names get the app's proper-casing
    expect(reasonOf(data, 'pat')).toBe('Plays Municipal Golf Club of the Pines')
  })

  test('"Active this week" and "Active recently" from recently posted rounds; older ones say nothing', async () => {
    mockDb.tables.profiles.push(profile('weekly'), profile('monthly'), profile('dormant'))
    mockDb.tables.rounds.push(
      round('weekly', { created_at: daysAgo(2) }),
      round('monthly', { created_at: daysAgo(20) }),
      round('dormant', { created_at: daysAgo(70) }),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['weekly', 'monthly', 'dormant'])
    expect(reasonOf(data, 'weekly')).toBe('Active this week')
    expect(reasonOf(data, 'monthly')).toBe('Active recently')
    expect(reasonOf(data, 'dormant')).toBeNull()
  })

  test('fallback: the newest accounts with a username ("New to Dogleg" when under a month old)', async () => {
    mockDb.tables.profiles.push(
      profile('newbie', { created_at: daysAgo(3) }),
      profile('veteran', { created_at: daysAgo(900) }),
      profile('middle', { created_at: daysAgo(100) }),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['newbie', 'middle', 'veteran'])
    expect(reasonOf(data, 'newbie')).toBe('New to Dogleg')
    expect(reasonOf(data, 'veteran')).toBeNull()
  })
})

describe('who is never suggested', () => {
  test('the user themselves, in every signal', async () => {
    mockDb.tables.profiles = [profile('me', { created_at: daysAgo(1) }), profile('alice')]
    mockDb.tables.follows.push(follow('me', 'me'), follow('me', 'alice'), follow('alice', 'me'))
    mockDb.tables.rounds.push(round('me', { course_id: 'c-1', created_at: daysAgo(1) }))

    const { data } = await suggest()
    expect(names(data)).not.toContain('me')
  })

  test('people the user already follows, even when they also follow back, play the same course and are new', async () => {
    mockDb.tables.profiles.push(profile('alice', { created_at: daysAgo(2) }), profile('bob'))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'me'), follow('me', 'bob'), follow('bob', 'alice'))
    mockDb.tables.rounds.push(
      round('me', { course_id: 'c-1' }),
      round('alice', { course_id: 'c-1', created_at: daysAgo(1) }),
    )

    const { data } = await suggest()
    expect(data).toEqual([])
  })

  test('profiles with no username (which used to link to /profile/null) or a blank one', async () => {
    mockDb.tables.profiles.push(
      profile('nameless', { username: null, created_at: daysAgo(1) }),
      profile('blank', { username: '   ', created_at: daysAgo(1) }),
      profile('fan'),
    )
    mockDb.tables.follows.push(follow('nameless', 'me'), follow('blank', 'me'), follow('fan', 'me'))
    mockDb.tables.rounds.push(round('nameless', { created_at: daysAgo(1) }))

    const { data } = await suggest()
    expect(names(data)).toEqual(['fan'])
    expect(data.map((u) => u.id)).not.toContain('nameless')
  })

  test('banned golfers, whichever signal found them', async () => {
    mockDb.tables.profiles.push(
      profile('alice'),
      profile('banned_fan', { is_banned: true }),
      profile('banned_fof', { is_banned: true }),
      profile('banned_new', { is_banned: true, created_at: daysAgo(1) }),
      profile('ok', { created_at: daysAgo(1) }),
    )
    mockDb.tables.follows.push(follow('banned_fan', 'me'), follow('me', 'alice'), follow('alice', 'banned_fof'))
    // RLS would normally hide a banned golfer's rounds; even if one gets through it is not used
    mockDb.tables.rounds.push(round('banned_fan', { created_at: daysAgo(1) }))

    const { data } = await suggest()
    expect(names(data)).toEqual(['ok'])
  })

  test('private and hidden rounds are never used', async () => {
    mockDb.tables.profiles.push(profile('secret'), profile('hidden'))
    mockDb.tables.rounds.push(
      round('me', { course_id: 'c-1' }),
      round('secret', { course_id: 'c-1', created_at: daysAgo(1), is_private: true }),
      round('hidden', { course_id: 'c-1', created_at: daysAgo(1), is_deleted: true }),
    )

    const { data } = await suggest()
    expect(data.map((u) => u.reason)).toEqual([null, null]) // only the plain fallback
    expect(mockDb.calls.some((c) => c.table === 'rounds' && c.ops.some(([op, f]) => op === 'or' && /is_private/.test(f)))).toBe(true)
  })

  test("a user's own hidden round does not count as a course they play", async () => {
    mockDb.tables.profiles.push(profile('pat'))
    mockDb.tables.rounds.push(
      round('me', { course_id: 'c-1', is_deleted: true }),
      round('pat', { course_id: 'c-1', created_at: daysAgo(40) }),
    )

    const { data } = await suggest()
    expect(reasonOf(data, 'pat')).toBeNull()
  })
})

describe('ranking', () => {
  test('each golfer appears once, with their strongest reason; signals add up', async () => {
    mockDb.tables.profiles.push(profile('alice'), profile('both'), profile('fan'), profile('player'))
    mockDb.tables.follows.push(
      follow('me', 'alice'),
      follow('both', 'me'), follow('alice', 'both'),
      follow('fan', 'me'),
    )
    mockDb.tables.rounds.push(
      round('me', { course_id: 'c-1', course_name: 'Pebble Beach Golf Links', club_name: 'Pebble Beach Golf Links' }),
      round('both', { course_id: 'c-1', created_at: daysAgo(1) }),
      round('both', { course_id: 'c-1', created_at: daysAgo(3) }),
      round('player', { course_id: 'c-1', created_at: daysAgo(45) }),
    )

    const { data } = await suggest()
    expect(names(data)).toEqual(['both', 'fan', 'player'])
    expect(reasonOf(data, 'both')).toBe('Follows you')
    expect(reasonOf(data, 'fan')).toBe('Follows you')
    expect(reasonOf(data, 'player')).toBe('Plays Pebble Beach Golf Links')
    expect(new Set(data.map((u) => u.id)).size).toBe(data.length)
  })

  test('"Follows you" outranks everything else on its own', async () => {
    const W = SUGGESTION_WEIGHTS
    const bestOther = W.friendOfFriend + W.friendOfFriendExtra * W.friendOfFriendMaxExtra
    expect(W.followsYou).toBeGreaterThan(bestOther)
    expect(W.followsYou).toBeGreaterThan(W.sameCourse + W.sameCourseExtra * W.sameCourseMaxExtra + W.activeThisWeek)
  })

  test('equal scores go to the more recently active golfer', async () => {
    mockDb.tables.profiles.push(profile('older'), profile('newer'))
    mockDb.tables.follows.push(follow('older', 'me', { created_at: daysAgo(30) }), follow('newer', 'me', { created_at: daysAgo(1) }))

    const { data } = await suggest()
    expect(names(data)).toEqual(['newer', 'older'])
  })

  test('returns at most `limit` golfers (10 by default), best first', async () => {
    for (let i = 0; i < 15; i += 1) {
      const id = `fan${String(i).padStart(2, '0')}`
      mockDb.tables.profiles.push(profile(id))
      mockDb.tables.follows.push(follow(id, 'me', { created_at: daysAgo(i + 1) }))
    }
    for (let i = 0; i < 15; i += 1) mockDb.tables.profiles.push(profile(`new${i}`, { created_at: daysAgo(1) }))

    const ten = await suggest()
    expect(ten.data).toHaveLength(10)
    expect(names(ten.data)).toEqual(['fan00', 'fan01', 'fan02', 'fan03', 'fan04', 'fan05', 'fan06', 'fan07', 'fan08', 'fan09'])

    const three = await suggest(3)
    expect(names(three.data)).toEqual(['fan00', 'fan01', 'fan02'])
  })
})

describe('query budget', () => {
  test('at most six queries, each with a limit', async () => {
    mockDb.tables.profiles.push(profile('alice'), profile('carol'), profile('fan'), profile('pat'))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'carol'), follow('fan', 'me'))
    mockDb.tables.rounds.push(round('me', { course_id: 'c-1' }), round('pat', { course_id: 'c-1', created_at: daysAgo(2) }))

    const { data } = await suggest()
    expect(names(data)).toEqual(expect.arrayContaining(['carol', 'fan', 'pat']))
    expect(mockDb.calls.length).toBeLessThanOrEqual(6)
    for (const call of mockDb.calls) {
      expect(call.ops.some(([op]) => op === 'limit')).toBe(true)
    }
  })

  test('with every signal in play and lots of newer accounts: still six, and older candidates are looked up', async () => {
    mockDb.tables.profiles.push(profile('alice'), profile('carol'), profile('fan'), profile('pat'))
    for (let i = 0; i < 40; i += 1) mockDb.tables.profiles.push(profile(`new${i}`, { created_at: daysAgo(1) }))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'carol'), follow('fan', 'me'))
    mockDb.tables.rounds.push(round('me', { course_id: 'c-1' }), round('pat', { course_id: 'c-1', created_at: daysAgo(2) }))

    const { data } = await suggest()
    // fan, pat and carol are too old for the newest-profiles query: their
    // profiles come from the last query, alice's too (she is named)
    expect(names(data).slice(0, 3)).toEqual(['fan', 'pat', 'carol'])
    expect(reasonOf(data, 'carol')).toBe('Followed by @alice')
    expect(data).toHaveLength(10)
    expect(mockDb.calls).toHaveLength(6)
    const lookup = mockDb.calls[mockDb.calls.length - 1]
    expect(lookup.table).toBe('profiles')
    const [, , ids] = lookup.ops.find(([op]) => op === 'in')
    expect([...ids].sort()).toEqual(['alice', 'carol', 'fan', 'pat'])
  })
})

test('the newest-profiles fallback asks for undated profiles last (Postgres sorts NULLs first when descending)', async () => {
  await suggest()
  const newest = mockDb.calls.find((c) => c.table === 'profiles' && c.ops.some(([op, column]) => op === 'order' && column === 'created_at'))
  expect(newest.ops).toContainEqual(['order', 'created_at', { ascending: false, nullsFirst: false }])
})

describe('when a query fails', () => {
  const isFollowsOfMe = (call) => call.table === 'follows' && call.ops.some(([op, f]) => op === 'or' && String(f).includes('me'))
  const isRecentRounds = (call) => call.table === 'rounds' && call.ops.some(([op]) => op === 'gte')
  const isNewest = (call) => call.table === 'profiles' && call.ops.some(([op, column]) => op === 'order' && column === 'created_at')

  beforeEach(() => {
    mockDb.tables.profiles.push(profile('alice'), profile('carol'), profile('fan'), profile('pat'), profile('newbie', { created_at: daysAgo(1) }))
    mockDb.tables.follows.push(follow('me', 'alice'), follow('alice', 'carol'), follow('fan', 'me'))
    mockDb.tables.rounds.push(round('me', { course_id: 'c-1', course_name: 'Augusta National' }), round('pat', { course_id: 'c-1', created_at: daysAgo(2) }))
  })

  test('the follows query: its signals are dropped, the others still work', async () => {
    mockDb.failWhen = isFollowsOfMe
    const { data, error } = await suggest()
    expect(error).toBeNull()
    expect(reasonOf(data, 'pat')).toBe('Plays Augusta National')
    expect(reasonOf(data, 'newbie')).toBe('New to Dogleg')
    // friends of friends need the follows: carol is only a plain fallback now
    expect(reasonOf(data, 'carol')).toBeNull()
  })

  test('the recent rounds query: no course or activity reasons, the rest stay', async () => {
    mockDb.failWhen = isRecentRounds
    const { data, error } = await suggest()
    expect(error).toBeNull()
    expect(reasonOf(data, 'fan')).toBe('Follows you')
    expect(reasonOf(data, 'carol')).toBe('Followed by @alice')
    expect(reasonOf(data, 'pat')).toBeNull()
  })

  test('the newest-profiles query: the signal-based suggestions still come back', async () => {
    mockDb.failWhen = isNewest
    const { data, error } = await suggest()
    expect(error).toBeNull()
    expect(names(data)).toEqual(['fan', 'pat', 'carol'])
    expect(reasonOf(data, 'pat')).toBe('Plays Augusta National')
  })

  test('the friends-of-friends query', async () => {
    mockDb.failWhen = (call) => call.table === 'follows' && call.ops.some(([op]) => op === 'in')
    const { data } = await suggest()
    expect(names(data)).toEqual(['fan', 'pat', 'newbie', 'carol'])
    expect(reasonOf(data, 'carol')).toBeNull()
  })

  test('every query: an empty list and the error, nothing thrown', async () => {
    mockDb.failWhen = () => true
    const { data, error } = await suggest()
    expect(data).toEqual([])
    expect(error).toEqual(expect.objectContaining({ message: expect.any(String) }))
  })

  test('a client that throws is caught too', async () => {
    const { supabase } = require('./supabase')
    const original = supabase.from
    supabase.from = () => { throw new Error('client broke') }
    try {
      const { data, error } = await suggest()
      expect(data).toEqual([])
      expect(error).toBeTruthy()
    } finally {
      supabase.from = original
    }
  })
})
