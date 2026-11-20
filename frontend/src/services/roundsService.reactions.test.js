import { roundsService } from './roundsService'

// saveReaction against a tiny in-memory "reactions" table. Every query is
// recorded, and a test can hold a reply back (mockDb.hold) to control timing.
const mockDb = { rows: [], calls: [], nextError: null, insertError: null, hold: null }

jest.mock('./supabase', () => {
  const makeQuery = (table) => {
    const call = { table, action: 'select', filters: {}, ops: [] }
    mockDb.calls.push(call)

    const matches = (row) => Object.entries(call.filters).every(([col, val]) => row[col] === val)

    const run = async (mode) => {
      if (mockDb.hold) await mockDb.hold
      if (mockDb.nextError) {
        const error = mockDb.nextError
        mockDb.nextError = null
        return { data: null, error }
      }
      if (call.action === 'insert') {
        if (mockDb.insertError) return { data: null, error: mockDb.insertError }
        const row = { id: `row-${mockDb.rows.length + 1}`, ...call.insertRows[0] }
        mockDb.rows.push(row)
        return { data: mode === 'single' ? row : [row], error: null }
      }
      if (call.action === 'delete') {
        mockDb.rows = mockDb.rows.filter((row) => !matches(row))
        return { data: null, error: null }
      }
      const found = mockDb.rows.filter(matches)
      return { data: call.limit ? found.slice(0, call.limit) : found, error: null }
    }

    const query = {
      select: (...args) => { call.ops.push(['select', ...args]); return query },
      insert: (rows) => { call.action = 'insert'; call.insertRows = rows; call.ops.push(['insert', rows]); return query },
      delete: () => { call.action = 'delete'; call.ops.push(['delete']); return query },
      eq: (col, val) => { call.filters[col] = val; call.ops.push(['eq', col, val]); return query },
      limit: (n) => { call.limit = n; call.ops.push(['limit', n]); return query },
      single: () => run('single'),
      maybeSingle: () => run('maybeSingle'),
      then: (resolve, reject) => run('many').then(resolve, reject),
    }
    return query
  }

  return {
    supabase: {
      from: (table) => makeQuery(table),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }) },
    },
  }
})

const reaction = (type = 'fire', user = 'me') => ({ round_id: 'r1', user_id: user, reaction_type: type })
const myFires = () => mockDb.rows.filter((r) => r.user_id === 'me' && r.reaction_type === 'fire')
const actions = () => mockDb.calls.map((c) => c.action)

// A promise the test resolves by hand
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  mockDb.rows = []
  mockDb.calls = []
  mockDb.nextError = null
  mockDb.insertError = null
  mockDb.hold = null
})

describe('saveReaction with an explicit target', () => {
  test('adds a reaction that is not there', async () => {
    const result = await roundsService.saveReaction('r1', 'fire', true)
    expect(result.error).toBeNull()
    expect(result.removed).toBe(false)
    expect(myFires()).toHaveLength(1)
    expect(myFires()[0]).toMatchObject({ round_id: 'r1', reaction_type: 'fire', emoji: 'fire' })
  })

  test('adding a reaction that is already there succeeds and adds nothing (a stale card)', async () => {
    mockDb.rows = [{ id: 'old', ...reaction() }]
    const result = await roundsService.saveReaction('r1', 'fire', true)
    expect(result.error).toBeNull()
    expect(result.removed).toBe(false)
    expect(myFires()).toHaveLength(1) // not removed, not duplicated
    expect(actions()).not.toContain('insert')
    expect(actions()).not.toContain('delete')
  })

  test('losing an insert race to a unique index (23505) counts as success', async () => {
    // The lookup finds nothing, then the insert hits the duplicate
    mockDb.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const result = await roundsService.saveReaction('r1', 'fire', true)
    expect(result.error).toBeNull()
    expect(result.removed).toBe(false)
    expect(actions()).toEqual(['select', 'insert'])
  })

  test('any other insert error is reported', async () => {
    mockDb.insertError = { code: '42501', message: 'permission denied' }
    const result = await roundsService.saveReaction('r1', 'fire', true)
    expect(result.error).toEqual({ code: '42501', message: 'permission denied' })
  })

  test('removes a reaction (every copy) without looking it up first', async () => {
    mockDb.rows = [{ id: 'a', ...reaction() }, { id: 'b', ...reaction() }, { id: 'c', ...reaction('clap') }, { id: 'd', ...reaction('fire', 'friend') }]
    const result = await roundsService.saveReaction('r1', 'fire', false)
    expect(result.error).toBeNull()
    expect(result.removed).toBe(true)
    expect(myFires()).toHaveLength(0)
    expect(mockDb.rows.map((r) => r.id)).toEqual(['c', 'd']) // the user's other reaction and a friend's stay
    expect(actions()).toEqual(['delete'])
    expect(mockDb.calls[0].filters).toEqual({ user_id: 'me', round_id: 'r1', reaction_type: 'fire' })
  })

  test('removing a reaction that is already gone succeeds (a stale card)', async () => {
    const result = await roundsService.saveReaction('r1', 'fire', false)
    expect(result.error).toBeNull()
    expect(result.removed).toBe(true)
    expect(myFires()).toHaveLength(0)
  })

  test('a failed lookup is reported and nothing is written', async () => {
    mockDb.nextError = { message: 'offline' }
    const result = await roundsService.saveReaction('r1', 'fire', true)
    expect(result.error).toEqual({ message: 'offline' })
    expect(actions()).toEqual(['select'])
  })

  test('a failed write is reported', async () => {
    mockDb.rows = [{ id: 'old', ...reaction() }]
    mockDb.nextError = { message: 'offline' }
    const result = await roundsService.saveReaction('r1', 'fire', false)
    expect(result.error).toEqual({ message: 'offline' })
    expect(myFires()).toHaveLength(1)
  })
})

describe('saveReaction without a target (old callers)', () => {
  test('still toggles what the database holds', async () => {
    const added = await roundsService.saveReaction('r1', 'fire')
    expect(added.removed).toBe(false)
    expect(myFires()).toHaveLength(1)

    const removed = await roundsService.saveReaction('r1', 'fire')
    expect(removed.removed).toBe(true)
    expect(myFires()).toHaveLength(0)
  })
})

describe('saveReaction ordering', () => {
  test('calls for the same reaction run one after another, and the last tap wins', async () => {
    const gate = deferred()
    mockDb.hold = gate.promise

    // Tap on, then off, then on again before anything has answered
    const first = roundsService.saveReaction('r1', 'fire', true)
    const second = roundsService.saveReaction('r1', 'fire', false)
    const third = roundsService.saveReaction('r1', 'fire', true)

    // Only the first call has reached the database so far
    await new Promise((r) => setTimeout(r, 0))
    expect(mockDb.calls).toHaveLength(1)

    mockDb.hold = null
    gate.resolve()
    const results = await Promise.all([first, second, third])

    expect(results.map((r) => r.superseded)).toEqual([true, true, false])
    expect(results.every((r) => r.error === null)).toBe(true)
    expect(myFires()).toHaveLength(1) // on, as last tapped
  })

  test('different reactions and rounds do not wait for each other', async () => {
    const gate = deferred()
    mockDb.hold = gate.promise
    const fire = roundsService.saveReaction('r1', 'fire', true)
    const clap = roundsService.saveReaction('r1', 'clap', true)
    const otherRound = roundsService.saveReaction('r2', 'fire', true)

    await new Promise((r) => setTimeout(r, 0))
    expect(mockDb.calls).toHaveLength(3)

    mockDb.hold = null
    gate.resolve()
    const results = await Promise.all([fire, clap, otherRound])
    expect(results.map((r) => r.superseded)).toEqual([false, false, false])
  })

  test('a failed call does not block the next one', async () => {
    mockDb.nextError = { message: 'offline' }
    const failed = roundsService.saveReaction('r1', 'fire', true)
    const next = roundsService.saveReaction('r1', 'fire', true)
    expect((await failed).error).toEqual({ message: 'offline' })
    expect((await next).error).toBeNull()
    expect(myFires()).toHaveLength(1)
  })
})
