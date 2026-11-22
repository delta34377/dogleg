import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import App from '../App'

// The Find Golfers page inside the real app (router, AppShell, the lazy
// route), with the REAL searchService and followService on top of a small
// in-memory database. Unlike App.test.js, nothing about the suggestions is
// faked: the rows below go through getSuggestedUsers' actual queries.
const mockDb = { tables: {}, failWhen: null, seq: 0 }

jest.mock('../services/supabase', () => {
  const parse = (raw) => (raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw)
  const same = (cell, value) => (typeof value === 'boolean' || value === null ? cell === value : cell != null && String(cell) === String(value))
  // "a.eq.x,b.is.null": a row matches if any part does
  const orFilter = (text) => {
    const parts = text.split(',').map((part) => {
      const [column, op, ...rest] = part.split('.')
      const value = parse(rest.join('.'))
      if (op === 'eq') return (row) => same(row[column], value)
      if (op === 'is') return (row) => (value === null ? row[column] == null : row[column] === value)
      throw new Error(`mock: unsupported or() operator ${op}`)
    })
    return (row) => parts.some((matches) => matches(row))
  }

  const makeQuery = (table) => {
    const q = { table, action: 'select', ops: [], filters: [], order: null, limit: null, rows: null }
    const matches = (row) => q.filters.every((check) => check(row))
    const run = async (mode) => {
      if (mockDb.failWhen && mockDb.failWhen(q)) return { data: null, error: { message: `${table} is unavailable` } }
      const rows = mockDb.tables[table] || []
      if (q.action === 'insert') {
        const inserted = q.rows.map((row) => ({ id: `${table}-${++mockDb.seq}`, created_at: new Date().toISOString(), ...row }))
        mockDb.tables[table] = [...rows, ...inserted]
        return { data: mode === 'single' ? inserted[0] : inserted, error: null }
      }
      if (q.action === 'delete') {
        mockDb.tables[table] = rows.filter((row) => !matches(row))
        return { data: null, error: null }
      }
      let found = rows.filter(matches)
      if (q.order) {
        const { column, ascending } = q.order
        found = [...found].sort((a, b) => ((a[column] ?? '') < (b[column] ?? '') ? -1 : (a[column] ?? '') > (b[column] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
      }
      if (q.limit !== null) found = found.slice(0, q.limit)
      if (mode === 'single') return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: 'PGRST116' } }
      if (mode === 'maybeSingle') return { data: found[0] || null, error: null }
      return { data: found, error: null }
    }
    const op = (name, fn) => (...args) => { q.ops.push([name, ...args]); fn(...args); return builder }
    const builder = {
      select: op('select', () => {}),
      insert: op('insert', (rows) => { q.action = 'insert'; q.rows = rows }),
      delete: op('delete', () => { q.action = 'delete' }),
      eq: op('eq', (c, v) => q.filters.push((row) => row[c] === v)),
      neq: op('neq', (c, v) => q.filters.push((row) => row[c] != null && row[c] !== v)),
      in: op('in', (c, vs) => q.filters.push((row) => vs.includes(row[c]))),
      not: op('not', (c, o, v) => {
        if (o !== 'is' || v !== null) throw new Error('mock: only not(column, "is", null)')
        q.filters.push((row) => row[c] != null)
      }),
      gte: op('gte', (c, v) => q.filters.push((row) => row[c] != null && new Date(row[c]) >= new Date(v))),
      or: op('or', (text) => q.filters.push(orFilter(text))),
      order: op('order', (column, options) => { q.order = { column, ascending: options?.ascending !== false } }),
      limit: op('limit', (n) => { q.limit = n }),
      range: op('range', () => {}),
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
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }) },
    },
  }
})

jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: { id: 'me' },
    profile: { id: 'me', username: 'me_golfer' },
    loading: false,
    rechecking: false,
    signOut: async () => ({ error: null }),
  }),
}))
// Parts of the shell these tests don't look at
jest.mock('../components/NotificationDropdown', () => () => null)
jest.mock('../components/IOSInstallPrompt', () => () => null)
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true })

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString()
const profile = (id, extra = {}) => ({
  id, username: id, full_name: null, avatar_url: null, bio: null, location: null,
  is_banned: false, created_at: daysAgo(400), ...extra,
})
const follow = (follower_id, following_id) => ({ id: `${follower_id}->${following_id}`, follower_id, following_id, created_at: daysAgo(3) })
const round = (user_id, extra = {}) => ({
  id: `round-${user_id}-${extra.course_id || 'x'}`, user_id, course_id: null, course_name: null, club_name: null,
  played_at: daysAgo(10), created_at: daysAgo(10), is_private: false, is_deleted: false, ...extra,
})

const cards = () => within(screen.getByRole('list')).getAllByRole('listitem')
const cardFor = (username) => {
  const found = cards().filter((card) => within(card).queryByText(username, { exact: true }))
  if (found.length !== 1) throw new Error(`Expected one card for ${username}, found ${found.length}`)
  return found[0]
}

beforeEach(() => {
  mockDb.failWhen = null
  mockDb.seq = 0
  mockDb.tables = {
    profiles: [
      profile('me'),
      profile('alice'),                                     // already followed
      profile('fan', { full_name: 'Fan Golfer' }),          // follows me
      profile('carol'),                                     // alice follows her
      profile('pat', { location: 'Austin, TX' }),           // plays my course
      profile('nameless', { username: null, created_at: daysAgo(1) }),
      profile('blank', { username: '  ', created_at: daysAgo(1) }),
      profile('banned_fan', { is_banned: true, created_at: daysAgo(1) }),
      profile('newbie', { created_at: daysAgo(2) }),
    ],
    follows: [
      follow('me', 'alice'), follow('alice', 'me'),
      follow('fan', 'me'), follow('banned_fan', 'me'), follow('nameless', 'me'),
      follow('alice', 'carol'),
    ],
    rounds: [
      round('me', { course_id: 'c-1', course_name: 'Pebble Beach Golf Links', club_name: 'Pebble Beach Golf Links', played_at: daysAgo(120), created_at: daysAgo(120) }),
      round('pat', { course_id: 'c-1', course_name: 'Pebble Beach Golf Links', club_name: 'Pebble Beach Golf Links', created_at: daysAgo(40) }),
      round('pat', { course_id: 'c-2', course_name: 'Private Course', is_private: true, created_at: daysAgo(1) }),
      round('alice', { course_id: 'c-1', created_at: daysAgo(1) }),
    ],
  }
  window.history.replaceState(null, '', '/search-users')
  window.scrollTo = jest.fn()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // React Router's v7 notices
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('the signed-in Find Golfers page lists real suggestions, best first, each with its reason', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Suggested golfers' })).toBeInTheDocument()
  expect(await screen.findByText('Follows you')).toBeInTheDocument()

  expect(cards().map((card) => within(card).getByRole('link').getAttribute('href')))
    .toEqual(['/profile/fan', '/profile/carol', '/profile/pat', '/profile/newbie'])
  expect(within(cardFor('fan')).getByText('Fan Golfer')).toBeInTheDocument()
  expect(within(cardFor('carol')).getByText('Followed by @alice')).toBeInTheDocument()
  expect(within(cardFor('pat')).getByText('Plays Pebble Beach Golf Links')).toBeInTheDocument()
  expect(within(cardFor('pat')).getByText('Austin, TX')).toBeInTheDocument()
  expect(within(cardFor('newbie')).getByText('New to Dogleg')).toBeInTheDocument()

  // Never: the user, someone already followed, no username, banned
  const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
  for (const hidden of ['me', 'alice', 'null', 'undefined', 'banned_fan', '%20%20', '  ']) {
    expect(hrefs).not.toContain(`/profile/${hidden}`)
  }
  expect(screen.queryByText('banned_fan')).not.toBeInTheDocument()
})

test('following a suggested golfer saves the follow and keeps them on the list as "Following"', async () => {
  render(<App />)
  await screen.findByText('Follows you')

  fireEvent.click(within(cardFor('carol')).getByRole('button', { name: 'Follow' }))
  expect(await within(cardFor('carol')).findByRole('button', { name: 'Following' })).toBeInTheDocument()
  expect(mockDb.tables.follows).toContainEqual(expect.objectContaining({ follower_id: 'me', following_id: 'carol' }))
  expect(within(cardFor('fan')).getByRole('button', { name: 'Follow' })).toBeInTheDocument()
})

test('if the follows cannot be read for the suggestions, golfers already followed still stay off the list', async () => {
  // Only the suggestions' own follows read fails; the page's status check works
  mockDb.failWhen = (q) => q.table === 'follows' && q.ops.some(([name, text]) => name === 'or' && /following_id\.eq\.me/.test(text))
  render(<App />)

  expect(await screen.findByText('New to Dogleg')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('link', { name: /alice/ })).not.toBeInTheDocument())
  expect(screen.getByRole('link', { name: /pat/ })).toBeInTheDocument()
  expect(screen.queryByText('Follows you')).not.toBeInTheDocument() // that signal needed the follows
})

test('when nothing can be read the page says so instead of "nothing to suggest", and Try again recovers', async () => {
  mockDb.failWhen = (q) => q.action === 'select' && q.table !== 'follows'
  render(<App />)

  expect(await screen.findByText("Couldn't load suggestions")).toBeInTheDocument()
  expect(screen.queryByText('No golfers to suggest yet')).not.toBeInTheDocument()

  mockDb.failWhen = null
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Follows you')).toBeInTheDocument()
})
