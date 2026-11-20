import {
  roundsService,
  createRoundId,
  photoExtension,
  photoPathFromUrl,
} from './roundsService'

// A tiny stand-in for the Supabase client. Every database call takes the
// next reply from mockDb.replies (in order) and records what was asked, so
// each test can say exactly what the server answers.
const mockDb = { replies: [], calls: [], uploads: [], uploadReplies: [], removes: [] }

jest.mock('./supabase', () => {
  const PUBLIC = 'https://example.supabase.co/storage/v1/object/public/round-photos/'

  const makeQuery = (table) => {
    const call = { table, ops: [] }
    mockDb.calls.push(call)
    const reply = () => Promise.resolve(mockDb.replies.shift() || { data: null, error: null })
    const query = {}
    ;['select', 'insert', 'delete', 'eq', 'not', 'or', 'order', 'limit', 'range', 'in'].forEach((name) => {
      query[name] = (...args) => {
        call.ops.push([name, ...args])
        return query
      }
    })
    query.single = () => reply()
    query.maybeSingle = () => reply()
    query.then = (resolve, reject) => reply().then(resolve, reject)
    return query
  }

  const bucket = {
    upload: (path, file, options) => {
      mockDb.uploads.push({ path, file, options })
      return Promise.resolve(mockDb.uploadReplies.shift() || { data: { path }, error: null })
    },
    getPublicUrl: (path) => ({ data: { publicUrl: PUBLIC + path } }),
    remove: (paths) => {
      mockDb.removes.push(...paths)
      return Promise.resolve({ data: [], error: null })
    },
  }

  return {
    supabase: {
      from: (table) => makeQuery(table),
      storage: { from: () => bucket },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
    },
  }
})

const ROUND_ID = '11111111-2222-4333-8444-555555555555'
const PHOTO_URL = `https://example.supabase.co/storage/v1/object/public/round-photos/user-1/${ROUND_ID}.jpg`

const baseRound = (extra = {}) => ({
  id: ROUND_ID,
  userId: 'user-1',
  course_id: 'c1',
  course_name: 'Pine Valley',
  date: '2026-11-20T00:00:00',
  total: 47,
  front9: 47,
  back9: null,
  holes: [],
  holesDeclared: 9,
  par: 72,
  coursePars: null,
  photo: null,
  ...extra,
})

const insertedRows = () =>
  mockDb.calls
    .filter((c) => c.table === 'rounds')
    .flatMap((c) => c.ops.filter(([op]) => op === 'insert').map(([, rows]) => rows[0]))

const photo = () => new Blob(['jpeg bytes'], { type: 'image/jpeg' })

beforeEach(() => {
  mockDb.replies = []
  mockDb.calls = []
  mockDb.uploads = []
  mockDb.uploadReplies = []
  mockDb.removes = []
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('helpers', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  describe('createRoundId', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'crypto')
    const useCrypto = (value) => Object.defineProperty(window, 'crypto', { value, configurable: true })

    afterEach(() => {
      if (original) Object.defineProperty(window, 'crypto', original)
      else delete window.crypto
    })

    it('uses crypto.randomUUID when the browser has it', () => {
      useCrypto({ randomUUID: () => ROUND_ID })
      expect(createRoundId()).toBe(ROUND_ID)
    })

    it('builds a version-4 UUID from getRandomValues on older browsers', () => {
      useCrypto({ getRandomValues: (bytes) => bytes.fill(0xff) })
      expect(createRoundId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    })

    it('still makes distinct version-4 UUIDs with no crypto at all', () => {
      useCrypto(undefined)
      const a = createRoundId()
      const b = createRoundId()
      expect(a).toMatch(UUID_V4)
      expect(b).toMatch(UUID_V4)
      expect(a).not.toBe(b)
    })
  })

  it('takes the extension from the real type', () => {
    expect(photoExtension('image/jpeg')).toBe('jpg')
    expect(photoExtension('image/png')).toBe('png')
    expect(photoExtension('')).toBe('jpg')
  })

  it('finds the storage path in a public photo URL', () => {
    expect(photoPathFromUrl(PHOTO_URL)).toBe(`user-1/${ROUND_ID}.jpg`)
    expect(photoPathFromUrl(PHOTO_URL + '?t=1')).toBe(`user-1/${ROUND_ID}.jpg`)
    expect(photoPathFromUrl('https://elsewhere.example/pic.jpg')).toBeNull()
    expect(photoPathFromUrl(null)).toBeNull()
  })
})

describe('saveRound', () => {
  it('sends the client id and holes_declared, and none of the computed columns (C2)', async () => {
    const saved = { id: ROUND_ID, short_code: 'K7FX9M', dogleg_score: 7.1 }
    mockDb.replies.push({ data: saved, error: null })

    const result = await roundsService.saveRound(baseRound())

    expect(result).toEqual({ data: saved, error: null })
    const [row] = insertedRows()
    expect(row).toMatchObject({ id: ROUND_ID, user_id: 'user-1', total_score: 47, front9: 47, back9: null, holes_declared: 9 })
    // No made-up par card when the course has no pars (STATS-7)
    expect(row.course_pars).toBeNull()
    ;['holes_played', 'differential', 'dogleg_score', 'strokes_vs_usual', 'achievements', 'short_code', 'is_deleted']
      .forEach((column) => expect(row).not.toHaveProperty(column))
  })

  it('retries once without holes_declared on an older database (PGRST204)', async () => {
    mockDb.replies.push(
      { data: null, error: { code: 'PGRST204', message: "Could not find the 'holes_declared' column" } },
      { data: { id: ROUND_ID, short_code: 'ABC234' }, error: null },
    )

    const result = await roundsService.saveRound(baseRound())

    expect(result.error).toBeNull()
    const rows = insertedRows()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveProperty('holes_declared', 9)
    expect(rows[1]).not.toHaveProperty('holes_declared')
    expect(rows[1].id).toBe(ROUND_ID)
  })

  it('treats a duplicate id as success: the earlier try already saved it (23505)', async () => {
    const existing = { id: ROUND_ID, short_code: 'K7FX9M', total_score: 47 }
    mockDb.replies.push(
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "rounds_pkey"' } },
      { data: existing, error: null },
    )

    const result = await roundsService.saveRound(baseRound())

    expect(result).toEqual({ data: existing, error: null })
    const lookup = mockDb.calls[1]
    expect(lookup.ops).toContainEqual(['eq', 'id', ROUND_ID])
  })

  it('returns a unique violation that is not about our id', async () => {
    const error = { code: '23505', message: 'duplicate short_code' }
    mockDb.replies.push({ data: null, error }, { data: null, error: null })

    const result = await roundsService.saveRound(baseRound())

    expect(result).toEqual({ data: null, error, stage: 'round' })
  })

  it('passes the server check_violation message through (23514)', async () => {
    const error = { code: '23514', message: 'Hole scores must be between 1 and 20' }
    mockDb.replies.push({ data: null, error })

    const result = await roundsService.saveRound(baseRound())

    expect(result.error.message).toBe('Hole scores must be between 1 and 20')
    expect(result.stage).toBe('round')
  })

  it('uploads the photo to {user}/{round}.jpg before inserting', async () => {
    mockDb.replies.push({ data: { id: ROUND_ID, short_code: 'K7FX9M' }, error: null })

    await roundsService.saveRound(baseRound({ photo: photo() }))

    expect(mockDb.uploads).toHaveLength(1)
    expect(mockDb.uploads[0].path).toBe(`user-1/${ROUND_ID}.jpg`)
    expect(mockDb.uploads[0].options).toMatchObject({ contentType: 'image/jpeg' })
    expect(insertedRows()[0].photo_url).toBe(PHOTO_URL)
  })

  it('stops before inserting when the photo upload fails, so the caller can ask (ENTRY-7)', async () => {
    mockDb.uploadReplies.push({ data: null, error: { message: 'Network request failed' } })

    const result = await roundsService.saveRound(baseRound({ photo: photo() }))

    expect(result.stage).toBe('photo')
    expect(result.data).toBeNull()
    expect(insertedRows()).toHaveLength(0)
  })

  it('removes the uploaded photo when the server refuses the round', async () => {
    mockDb.replies.push({ data: null, error: { code: '23514', message: 'Total score must be between 9 and 200' } })

    const result = await roundsService.saveRound(baseRound({ photo: photo() }))

    expect(result.stage).toBe('round')
    expect(mockDb.removes).toEqual([`user-1/${ROUND_ID}.jpg`])
  })

  it('keeps the photo after a network error, because the round may have been saved', async () => {
    mockDb.replies.push({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' } })

    await roundsService.saveRound(baseRound({ photo: photo() }))

    expect(mockDb.removes).toEqual([])
  })

  it('reuses a photo an earlier try already uploaded', async () => {
    mockDb.uploadReplies.push(
      { data: null, error: { statusCode: '409', message: 'The resource already exists' } },
      { data: null, error: { message: 'new row violates row-level security policy' } }, // no UPDATE policy
    )
    mockDb.replies.push({ data: { id: ROUND_ID, short_code: 'K7FX9M' }, error: null })

    const result = await roundsService.saveRound(baseRound({ photo: photo() }))

    expect(result.error).toBeNull()
    expect(mockDb.uploads.map((u) => u.options.upsert)).toEqual([false, true])
    expect(insertedRows()[0].photo_url).toBe(PHOTO_URL)
  })

  it('fetches the short code when the insert reply has none', async () => {
    mockDb.replies.push(
      { data: { id: ROUND_ID, short_code: null }, error: null },
      { data: { short_code: 'K7FX9M' }, error: null },
    )

    const result = await roundsService.saveRound(baseRound())

    expect(result.data.short_code).toBe('K7FX9M')
  })
})

describe('deleteRound', () => {
  it('deletes the row and then its photo', async () => {
    mockDb.replies.push(
      { data: { photo_url: PHOTO_URL }, error: null },
      { data: [{ id: ROUND_ID }], error: null },
    )

    const result = await roundsService.deleteRound(ROUND_ID)

    expect(result.error).toBeNull()
    expect(mockDb.removes).toEqual([`user-1/${ROUND_ID}.jpg`])
  })

  it('reports an error when nothing was deleted, and keeps the photo', async () => {
    mockDb.replies.push(
      { data: { photo_url: PHOTO_URL }, error: null },
      { data: [], error: null },
    )

    const result = await roundsService.deleteRound(ROUND_ID)

    expect(result.error).toBeInstanceOf(Error)
    expect(mockDb.removes).toEqual([])
  })

  it("never touches a photo outside the user's own folder", async () => {
    mockDb.replies.push(
      { data: { photo_url: PHOTO_URL.replace('user-1/', 'someone-else/') }, error: null },
      { data: [{ id: ROUND_ID }], error: null },
    )

    await roundsService.deleteRound(ROUND_ID)

    expect(mockDb.removes).toEqual([])
  })
})
