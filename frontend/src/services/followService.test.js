import { followService } from './followService'

// Each database call takes the next reply from mockDb.replies, in order
const mockDb = { replies: [] }

jest.mock('./supabase', () => {
  const makeQuery = () => {
    const reply = () => Promise.resolve(mockDb.replies.shift() || { data: null, error: null })
    const query = {}
    ;['select', 'insert', 'delete', 'eq', 'in'].forEach((name) => {
      query[name] = () => query
    })
    query.single = () => reply()
    query.maybeSingle = () => reply()
    query.then = (resolve, reject) => reply().then(resolve, reject)
    return query
  }
  return {
    supabase: {
      from: () => makeQuery(),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }) },
    },
  }
})

let events
const listener = (event) => events.push(event)

beforeEach(() => {
  mockDb.replies = []
  events = []
  window.addEventListener('feedRefresh', listener)
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  window.removeEventListener('feedRefresh', listener)
  console.error.mockRestore()
  console.log.mockRestore()
})

describe('follow changes tell the Feed', () => {
  test('a new follow sends feedRefresh with who was followed', async () => {
    mockDb.replies = [
      { data: null, error: null },                                            // not following yet
      { data: { follower_id: 'me', following_id: 'friend' }, error: null }, // the insert
    ]
    const { error } = await followService.followUser('friend')
    expect(error).toBeNull()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ reason: 'follow', userId: 'friend', following: true })
  })

  test('following someone already followed still sends it (another page may be out of date)', async () => {
    mockDb.replies = [{ data: { follower_id: 'me', following_id: 'friend' }, error: null }]
    await followService.followUser('friend')
    expect(events.map((e) => e.detail)).toEqual([{ reason: 'follow', userId: 'friend', following: true }])
  })

  test('an unfollow sends it with following: false', async () => {
    mockDb.replies = [{ error: null }]
    const { error } = await followService.unfollowUser('friend')
    expect(error).toBeNull()
    expect(events.map((e) => e.detail)).toEqual([{ reason: 'follow', userId: 'friend', following: false }])
  })

  test('a failed follow or unfollow sends nothing', async () => {
    mockDb.replies = [
      { data: null, error: null },
      { data: null, error: { message: 'offline' } },
      { error: { message: 'offline' } },
    ]
    expect((await followService.followUser('friend')).error).toEqual({ message: 'offline' })
    expect((await followService.unfollowUser('friend')).error).toEqual({ message: 'offline' })
    expect(events).toHaveLength(0)
  })

  test('a Feed listener that throws does not turn a saved follow into a failure', async () => {
    const angry = () => { throw new Error('listener broke') }
    window.addEventListener('feedRefresh', angry)
    // jsdom reports listener errors on window 'error'; keep the test output quiet
    const swallow = (e) => e.preventDefault()
    window.addEventListener('error', swallow)
    try {
      mockDb.replies = [{ error: null }]
      const { error } = await followService.unfollowUser('friend')
      expect(error).toBeNull()
    } finally {
      window.removeEventListener('feedRefresh', angry)
      window.removeEventListener('error', swallow)
    }
  })
})

test('a follow is still reported as saved where the announcement cannot be made', async () => {
  const original = window.CustomEvent
  window.CustomEvent = undefined // a very old browser
  try {
    mockDb.replies = [{ error: null }]
    const { error } = await followService.unfollowUser('friend')
    expect(error).toBeNull()
    expect(events).toHaveLength(0)
  } finally {
    window.CustomEvent = original
  }
})

describe('getFollowStatuses', () => {
  test('lists every asked-about user', async () => {
    mockDb.replies = [{ data: [{ following_id: 'a' }], error: null }]
    expect(await followService.getFollowStatuses(['a', 'b'])).toEqual({ a: true, b: false })
  })

  test('a failed lookup lists no one, so callers can tell "unknown" from "not following"', async () => {
    mockDb.replies = [{ data: null, error: { message: 'offline' } }]
    expect(await followService.getFollowStatuses(['a', 'b'])).toEqual({})
  })
})
