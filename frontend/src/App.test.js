import { render, screen, fireEvent, within, waitFor, act, isInaccessible } from '@testing-library/react'
import App, { importWithRecovery, isStaleChunkError } from './App'
import { roundsService } from './services/roundsService'
import { readPendingInvite, storePendingInvite } from './utils/invite'

// The real app (router, shell, Feed, search page, profile page) on top of a
// tiny in-memory stand-in for the database. followService and the reaction
// calls in roundsService are the real code; only the feed and profile-round
// queries are faked here, read from the same tables.
const mockDb = {}

function mockResetDb() {
  Object.assign(mockDb, {
    seq: 0,
    profiles: [],
    rounds: [],
    follows: [],
    reactions: [],
    comments: [],
    failures: {}, // table -> errors returned by its next queries, in order
  })
}

jest.mock('./services/supabase', () => {
  const makeQuery = (table) => {
    const q = { action: 'select', filters: [], head: false, limit: null, rows: null }
    const matches = (row) => q.filters.every((check) => check(row))

    const run = async (mode) => {
      const failure = mockDb.failures[table]?.shift()
      if (failure) return { data: null, count: null, error: failure }
      const rows = mockDb[table] || []

      if (q.action === 'insert') {
        const inserted = q.rows.map((row) => ({ id: `${table}-${++mockDb.seq}`, ...row }))
        mockDb[table] = [...rows, ...inserted]
        return { data: mode === 'single' ? inserted[0] : inserted, error: null }
      }
      if (q.action === 'delete') {
        mockDb[table] = rows.filter((row) => !matches(row))
        return { data: null, error: null }
      }

      let found = rows.filter(matches)
      if (q.head) return { data: null, count: found.length, error: null }
      if (q.limit !== null) found = found.slice(0, q.limit)
      if (mode === 'single') {
        return found.length === 1
          ? { data: found[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
      }
      if (mode === 'maybeSingle') return { data: found[0] || null, error: null }
      return { data: found, error: null }
    }

    const builder = {
      select: (columns, options) => { if (options?.head) q.head = true; return builder },
      insert: (rows) => { q.action = 'insert'; q.rows = rows; return builder },
      delete: () => { q.action = 'delete'; return builder },
      eq: (column, value) => { q.filters.push((row) => row[column] === value); return builder },
      in: (column, values) => { q.filters.push((row) => values.includes(row[column])); return builder },
      not: (column, op, value) => { q.filters.push((row) => row[column] !== value); return builder },
      or: () => builder,
      order: () => builder,
      range: () => builder,
      limit: (n) => { q.limit = n; return builder },
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

jest.mock('./services/roundsService', () => {
  const actual = jest.requireActual('./services/roundsService')
  const withAuthor = (round) => ({ ...round, profiles: mockDb.profiles.find((p) => p.id === round.user_id) })
  return {
    ...actual,
    roundsService: {
      ...actual.roundsService,
      // The rounds of the golfers the user follows, newest first (as stored)
      getFeedWithDiscovery: async (limit, offset) => {
        const followed = mockDb.follows.filter((f) => f.follower_id === 'me').map((f) => f.following_id)
        const rounds = mockDb.rounds.filter((r) => followed.includes(r.user_id)).map(withAuthor)
        return { data: { rounds: rounds.slice(offset, offset + limit) }, error: null }
      },
      getUserRounds: async (userId, limit, offset) => ({
        data: mockDb.rounds.filter((r) => r.user_id === userId).slice(offset, offset + limit),
        error: null,
      }),
    },
  }
})

jest.mock('./services/searchService', () => ({
  searchService: {
    getSuggestedUsers: async () => ({ data: mockDb.suggested || [], error: null }),
    searchUsers: async () => ({ data: [], error: null }),
  },
}))
jest.mock('./services/statsService', () => ({
  statsService: { getRoundStatsFields: async () => ({ data: {}, error: null }) },
}))
jest.mock('./services/feedSettingsService', () => ({
  getFeedSettings: async () => ({ mode: 'following', discoveryRatio: 0, feedLimit: 10 }),
  subscribeToFeedSettings: () => () => {},
}))
jest.mock('./context/AuthContext', () => ({
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
jest.mock('./components/NotificationDropdown', () => () => null)
jest.mock('./components/IOSInstallPrompt', () => () => null)
jest.mock('./components/ProfileStatsCard', () => () => null)
// (virtual: this Jest can't resolve the package's "exports" map)
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true })

const FRIEND = { id: 'friend', username: 'friend', full_name: 'Friend' }
const PAL = { id: 'pal', username: 'pal', full_name: 'Pal' }
const FRIEND_ROUND = { id: 'round-friend', user_id: 'friend', course_name: 'Friendly Links', total_score: 82, played_at: '2026-07-04', is_private: false }
const PAL_ROUND = { id: 'round-pal', user_id: 'pal', course_name: 'Pals Pines', total_score: 90, played_at: '2026-07-03', is_private: false }

// The one card on screen for a round. The hidden Feed stays in the DOM while
// another page is shown but, as for a real user, role queries leave it out.
const card = (courseName) => {
  const cards = screen.getAllByRole('article').filter((article) => within(article).queryByText(courseName))
  if (cards.length !== 1) throw new Error(`Expected one card on screen for ${courseName}, found ${cards.length}`)
  return cards[0]
}
const findCard = (courseName) => waitFor(() => card(courseName))
// The Feed's own card for a round while the Feed is hidden behind another page
const hiddenFeedCard = (courseName) => {
  const cards = screen.getAllByRole('article', { hidden: true })
    .filter((article) => isInaccessible(article) && within(article).queryByText(courseName))
  if (cards.length !== 1) throw new Error(`Expected one hidden Feed card for ${courseName}, found ${cards.length}`)
  return cards[0]
}
const isMine = (button) => button.className.includes('bg-green-50')
const myReactions = () => mockDb.reactions.filter((r) => r.user_id === 'me')

beforeEach(() => {
  mockResetDb()
  mockDb.profiles = [{ id: 'me', username: 'me_golfer' }, FRIEND, PAL]
  mockDb.rounds = [FRIEND_ROUND, PAL_ROUND]
  mockDb.suggested = [FRIEND]
  window.history.replaceState(null, '', '/')
  window.scrollTo = jest.fn()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // React Router's v7 notices
})

afterEach(() => {
  jest.restoreAllMocks()
  document.body.style.overflow = ''
})

describe('the Feed after visiting other pages (SHELL-1)', () => {
  test('a new user who follows a golfer from the empty Feed sees their round on coming back', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Find Golfers to Follow' }))

    expect(await screen.findByRole('heading', { name: 'Suggested Users' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }))
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument()
    expect(mockDb.follows).toEqual([expect.objectContaining({ follower_id: 'me', following_id: 'friend' })])

    // Back to the Feed with the tab bar
    fireEvent.click(screen.getAllByRole('link', { name: /Feed/ })[0])

    expect(await findCard('Friendly Links')).toBeInTheDocument()
    expect(screen.queryByText('No rounds in your feed yet')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  test("following another golfer puts their round in a Feed that already had rounds", async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]
    mockDb.suggested = [PAL]

    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Search users' }))
    expect(await screen.findByRole('heading', { name: 'Suggested Users' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }))
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument()

    // The search page's own back chevron
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(await findCard('Pals Pines')).toBeInTheDocument()
    expect(card('Friendly Links')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  test("a reaction made on a golfer's profile shows on the Feed card when the user comes back", async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]

    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    // Open the poster's profile from the Feed card and react there
    fireEvent.click(within(card('Friendly Links')).getByText('friend'))
    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()
    fireEvent.click(within(await findCard('Friendly Links')).getByTitle('fire'))
    await waitFor(() => expect(myReactions()).toHaveLength(1))
    // The reaction was made on the profile's card: the Feed's, hidden behind
    // it, still shows the round as it was
    expect(isMine(within(hiddenFeedCard('Friendly Links')).getByTitle('fire'))).toBe(false)

    // Back to the Feed with the header's back arrow
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))

    const feedFire = () => within(card('Friendly Links')).getByTitle('fire')
    await waitFor(() => expect(isMine(feedFire())).toBe(true))
    expect(feedFire()).toHaveTextContent('1')

    // The card now matches the database, so a tap removes the reaction
    fireEvent.click(feedFire())
    await waitFor(() => expect(myReactions()).toHaveLength(0))
    expect(isMine(feedFire())).toBe(false)
  })

  test('tapping an out-of-date Feed card adds the reaction it shows as missing, never removes it', async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]

    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    fireEvent.click(within(card('Friendly Links')).getByText('friend'))
    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()
    fireEvent.click(within(await findCard('Friendly Links')).getByTitle('fire'))
    await waitFor(() => expect(myReactions()).toHaveLength(1))

    // Bad signal: the Feed can't refresh its cards, so this one is stale
    mockDb.failures.reactions = [{ message: 'offline' }]
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    const feedFire = () => within(card('Friendly Links')).getByTitle('fire')
    await waitFor(() => expect(mockDb.failures.reactions).toHaveLength(0))
    expect(isMine(feedFire())).toBe(false)

    // The user taps fire, meaning "add it". It used to delete the reaction.
    const save = jest.spyOn(roundsService, 'saveReaction')
    fireEvent.click(feedFire())
    expect(isMine(feedFire())).toBe(true)
    expect(save).toHaveBeenCalledWith('round-friend', 'fire', true)
    await act(() => save.mock.results[0].value)
    expect(myReactions()).toHaveLength(1)
    expect(isMine(feedFire())).toBe(true)
  })
})

describe('reactions with no signal (SHELL-1)', () => {
  test('two quick taps that both fail leave the card as the database has it', async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]
    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    // Fire on, then off again, before either save has answered; both fail
    mockDb.failures.reactions = [{ message: 'offline' }, { message: 'offline' }]
    const save = jest.spyOn(roundsService, 'saveReaction')
    const feedFire = () => within(card('Friendly Links')).getByTitle('fire')
    fireEvent.click(feedFire())
    fireEvent.click(feedFire())
    expect(save.mock.calls).toEqual([['round-friend', 'fire', true], ['round-friend', 'fire', false]])

    await act(() => Promise.all(save.mock.results.map((result) => result.value)))
    expect(mockDb.failures.reactions).toHaveLength(0)
    expect(myReactions()).toHaveLength(0)
    // Not reacted, like the database. (Putting it back to "the opposite of
    // the last tap" showed it reacted.)
    expect(isMine(feedFire())).toBe(false)
    expect(feedFire()).not.toHaveTextContent('1')
  })
})

describe('Feed pop-ups on leaving the Feed (SHELL-3)', () => {
  test('Back from the Feed closes its Share pop-up and unlocks scrolling', async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]
    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    // Visit the search page and come back, so there is a page to go Back to
    fireEvent.click(screen.getByRole('link', { name: 'Search users' }))
    expect(await screen.findByRole('heading', { name: 'Suggested Users' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('link', { name: /Feed/ })[0])
    await waitFor(() => expect(window.location.pathname).toBe('/'))

    fireEvent.click(within(await findCard('Friendly Links')).getByRole('button', { name: /Share/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    // The phone's Back button
    act(() => window.history.back())
    await waitFor(() => expect(window.location.pathname).toBe('/search-users'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})

describe("the header's back arrow (SHELL-2)", () => {
  test('on a page that is the first in this tab (e.g. after the sign-in redirect) it goes to the Feed', async () => {
    // An earlier entry outside the app (e.g. Google's sign-in page) that
    // Back must not go to
    window.history.pushState(null, '', '/somewhere-else')
    // This page after the sign-in redirect: a fresh key, but index 0
    window.history.pushState({ usr: null, key: 'aftersignin', idx: 0 }, '', '/profile/friend')
    const entries = window.history.length

    render(<App />)
    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.history.length).toBe(entries) // replaced, not added
    expect(await screen.findByText('No rounds in your feed yet')).toBeInTheDocument()
  })

  test('after moving within the app it goes back one page', async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]
    render(<App />)
    expect(await findCard('Friendly Links')).toBeInTheDocument()

    fireEvent.click(within(card('Friendly Links')).getByText('friend'))
    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()
    expect(window.history.state.idx).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.history.state.idx).toBe(0)
  })
})

describe('profile load errors (SHELL-5)', () => {
  test('a golfer that does not exist shows "Page not found" without trapping the Back button', async () => {
    mockDb.suggested = [{ id: 'ghost', username: 'ghost' }] // no profile row any more
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Search users' }))
    fireEvent.click(await screen.findByText('ghost'))

    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/404')

    act(() => window.history.back())
    await waitFor(() => expect(window.location.pathname).toBe('/search-users'))
    expect(await screen.findByText('Suggested Users')).toBeInTheDocument()
  })

  test('a profile that fails to load says so (not "Page not found") and can be retried', async () => {
    mockDb.failures.profiles = [{ code: '503', message: 'Service unavailable' }]
    window.history.replaceState(null, '', '/profile/friend')
    render(<App />)

    expect(await screen.findByText("Couldn't load this profile")).toBeInTheDocument()
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile/friend')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()
  })
})

describe('invite links, signed in', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("a friend's invite opened before signing up is followed once the account is ready", async () => {
    storePendingInvite('friend')
    render(<App />)

    // The toast, the follow, and the inviter's round in the Feed
    expect(await screen.findByText("You're now following @friend")).toBeInTheDocument()
    expect(mockDb.follows).toEqual([expect.objectContaining({ follower_id: 'me', following_id: 'friend' })])
    expect(await findCard('Friendly Links')).toBeInTheDocument()
    expect(readPendingInvite()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText("You're now following @friend")).not.toBeInTheDocument()
  })

  test('the toast closes by itself after a few seconds', async () => {
    storePendingInvite('friend')
    jest.useFakeTimers()
    try {
      render(<App />)
      expect(await screen.findByText("You're now following @friend")).toBeInTheDocument()

      act(() => { jest.advanceTimersByTime(5900) })
      expect(screen.getByText("You're now following @friend")).toBeInTheDocument()
      act(() => { jest.advanceTimersByTime(200) })
      expect(screen.queryByText("You're now following @friend")).not.toBeInTheDocument()
    } finally {
      jest.useRealTimers()
    }
  })

  test('an invite from someone already followed: no toast, no second follow', async () => {
    mockDb.follows = [{ follower_id: 'me', following_id: 'friend' }]
    storePendingInvite('friend')
    render(<App />)

    expect(await findCard('Friendly Links')).toBeInTheDocument()
    await waitFor(() => expect(readPendingInvite()).toBeNull())
    expect(mockDb.follows).toHaveLength(1)
    expect(screen.queryByText(/You're now following/)).not.toBeInTheDocument()
  })

  test("opening an invite link while signed in shows the inviter's profile and follows nobody", async () => {
    storePendingInvite('pal')
    window.history.replaceState(null, '', '/join/friend')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'friend' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile/friend')
    expect(readPendingInvite()).toBeNull()
    expect(mockDb.follows).toEqual([])
    expect(screen.queryByText(/You're now following/)).not.toBeInTheDocument()
  })

  test('the empty Feed offers an Invite friends button next to Find Golfers to Follow', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Find Golfers to Follow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument()
  })
})

describe('lazy page loading (SHELL-4)', () => {
  const RELOAD_KEY = 'dogleg-chunk-reload'
  const page = { default: () => null }
  const chunkError = () =>
    Object.assign(new Error('Loading chunk 42 failed.\n(error: /static/js/42.chunk.js)'), { name: 'ChunkLoadError' })
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  const goOffline = () => jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)

  // Follows a promise without awaiting it, so a test can check it is still pending
  const track = (promise) => {
    const state = { settled: false }
    promise.then(
      (value) => Object.assign(state, { settled: true, value }),
      (error) => Object.assign(state, { settled: true, error })
    )
    return state
  }

  let reload
  beforeEach(() => {
    sessionStorage.clear()
    reload = jest.fn()
  })

  test('recognises the errors a missing page file gives', () => {
    expect(isStaleChunkError(chunkError())).toBe(true)
    expect(isStaleChunkError(new Error('Loading CSS chunk 7 failed.'))).toBe(true)
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /x.js'))).toBe(true)
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })

  test('online, a page file missing after a deploy reloads once to get the new version', async () => {
    const state = track(importWithRecovery(() => Promise.reject(chunkError()), reload))
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(state.settled).toBe(false) // the spinner stays while the page reloads
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1')
  })

  test('if that reload did not help, the error screen shows instead of reloading again', async () => {
    sessionStorage.setItem(RELOAD_KEY, '1')
    await expect(importWithRecovery(() => Promise.reject(chunkError()), reload)).rejects.toThrow('Loading chunk 42 failed')
    expect(reload).not.toHaveBeenCalled()
  })

  test('any other error shows the error screen without a reload', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'map')")
    await expect(importWithRecovery(() => Promise.reject(bug), reload)).rejects.toBe(bug)
    expect(reload).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  test('offline: no reload; it waits for the connection and tries once more', async () => {
    const onLine = goOffline()
    const importPage = jest.fn()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValueOnce(page)

    const state = track(importWithRecovery(importPage, reload))
    await flush()
    expect(reload).not.toHaveBeenCalled()
    expect(state.settled).toBe(false) // the spinner stays
    expect(importPage).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()

    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(importPage).toHaveBeenCalledTimes(2)
    expect(state.value).toBe(page)
    expect(reload).not.toHaveBeenCalled()
  })

  test('offline, and the retry once online fails with a stale page file: reload once then', async () => {
    const onLine = goOffline()
    const importPage = jest.fn().mockRejectedValue(chunkError())

    const state = track(importWithRecovery(importPage, reload))
    await flush()
    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await flush()

    expect(importPage).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(state.settled).toBe(false)
  })

  test('offline, and the retry fails for another reason: the error screen shows', async () => {
    const onLine = goOffline()
    const bug = new Error('boom')
    const importPage = jest.fn()
      .mockRejectedValueOnce(chunkError())
      .mockRejectedValueOnce(bug)

    const state = track(importWithRecovery(importPage, reload))
    await flush()
    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await flush()

    expect(state.error).toBe(bug)
    expect(importPage).toHaveBeenCalledTimes(2) // only once more
    expect(reload).not.toHaveBeenCalled()
  })

  test('a page that loads clears the reload marker', async () => {
    sessionStorage.setItem(RELOAD_KEY, '1')
    await expect(importWithRecovery(() => Promise.resolve(page), reload)).resolves.toBe(page)
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })
})
