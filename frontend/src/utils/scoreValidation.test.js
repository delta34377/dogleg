import {
  HARD_LIMITS,
  localDateString,
  parseScore,
  parseCoursePars,
  fillEighteen,
  eighteenMismatch,
  buildQuickEntry,
  buildHoleEntry,
  validateRound,
} from './scoreValidation'

const TODAY = '2026-11-20'
const holesOf = (n, score = '5') => Array.from({ length: 18 }, (_, i) => (i < n ? score : ''))
const check = (entry, extra = {}) => validateRound({ date: TODAY, putts: null, ...entry, ...extra }, { today: TODAY })

describe('localDateString', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 11:30 pm local on Nov 19 — in US time zones the UTC date is already Nov 20
    expect(localDateString(new Date(2026, 10, 19, 23, 30))).toBe('2026-11-19')
    expect(localDateString(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})

describe('parseScore', () => {
  it('reads whole numbers and treats empty as null', () => {
    expect(parseScore('85')).toBe(85)
    expect(parseScore(72)).toBe(72)
    expect(parseScore('')).toBeNull()
    expect(parseScore(null)).toBeNull()
    expect(parseScore(undefined)).toBeNull()
  })

  it('flags anything that is not a whole number', () => {
    expect(parseScore('-3')).toBeNaN()
    expect(parseScore('4.5')).toBeNaN()
    expect(parseScore('abc')).toBeNaN()
  })

  it('keeps 0 as 0 so validation can reject it (it used to become null)', () => {
    expect(parseScore('0')).toBe(0)
  })
})

describe('parseCoursePars', () => {
  it('converts string pars to numbers', () => {
    const pars = ['4', '5', '3', '4', '4', '4', '3', '5', '4', '4', '4', '3', '5', '4', '4', '3', '4', '5']
    expect(parseCoursePars(pars)).toEqual(pars.map(Number))
  })

  it('accepts a nine-hole card', () => {
    expect(parseCoursePars([4, 4, 3, 5, 4, 4, 3, 4, 5])).toHaveLength(9)
  })

  it('returns null instead of inventing pars', () => {
    expect(parseCoursePars(null)).toBeNull()
    expect(parseCoursePars(undefined)).toBeNull()
    expect(parseCoursePars([])).toBeNull()
    expect(parseCoursePars(['4', '', '3', '4', '4', '4', '3', '5', '4'])).toBeNull()
    expect(parseCoursePars(Array(18).fill('0'))).toBeNull()
    expect(parseCoursePars([4, 4, 4])).toBeNull()
  })
})

describe('fillEighteen', () => {
  const none = { front9: false, back9: false, total: false }

  it('adds up two typed nines', () => {
    const typed = { ...none, front9: true, back9: true }
    expect(fillEighteen({ front9: '42', back9: '45', total: '' }, typed)).toEqual({ front9: '42', back9: '45', total: '87' })
  })

  it('never rewrites a typed total when one nine is typed after it (ENTRY-1)', () => {
    // Old behaviour: Total 85, then Front 9 40 -> total silently became 40
    const typed = { ...none, total: true, front9: true }
    expect(fillEighteen({ front9: '40', back9: '', total: '85' }, typed)).toEqual({ front9: '40', back9: '45', total: '85' })
  })

  it('fills the front nine from total and back nine', () => {
    const typed = { ...none, total: true, back9: true }
    expect(fillEighteen({ front9: '', back9: '44', total: '90' }, typed)).toEqual({ front9: '46', back9: '44', total: '90' })
  })

  it('does not invent a total from a single nine', () => {
    const typed = { ...none, front9: true }
    expect(fillEighteen({ front9: '40', back9: '', total: '40' }, typed)).toEqual({ front9: '40', back9: '', total: '' })
  })

  it('clears a filled-in box once its basis is gone', () => {
    // total had been filled in from 42 + 45; the golfer clears the back nine
    const typed = { ...none, front9: true, back9: false }
    expect(fillEighteen({ front9: '42', back9: '', total: '87' }, typed)).toEqual({ front9: '42', back9: '', total: '' })
  })

  it('leaves all three alone when all three were typed', () => {
    const typed = { front9: true, back9: true, total: true }
    expect(fillEighteen({ front9: '40', back9: '46', total: '85' }, typed)).toEqual({ front9: '40', back9: '46', total: '85' })
  })

  it('leaves the derived box empty when the numbers make no sense', () => {
    const typed = { ...none, total: true, front9: true }
    expect(fillEighteen({ front9: '50', back9: '', total: '45' }, typed).back9).toBe('')
  })
})

describe('eighteenMismatch', () => {
  it('explains three boxes that do not add up', () => {
    expect(eighteenMismatch({ front9: '40', back9: '46', total: '85' })).toMatch(/86/)
  })

  it('is quiet when they add up or a box is empty', () => {
    expect(eighteenMismatch({ front9: '40', back9: '45', total: '85' })).toBeNull()
    expect(eighteenMismatch({ front9: '40', back9: '', total: '85' })).toBeNull()
  })
})

describe('buildQuickEntry', () => {
  it('saves a front-nine score as total and front9 (C2)', () => {
    expect(buildQuickEntry({ holes: 9, side: 'front', nineScore: '47' }))
      .toEqual({ holesDeclared: 9, total: 47, front9: 47, back9: null, scores: null })
  })

  it('saves a back-nine score as total and back9', () => {
    expect(buildQuickEntry({ holes: 9, side: 'back', nineScore: '44' }))
      .toEqual({ holesDeclared: 9, total: 44, front9: null, back9: 44, scores: null })
  })

  it('saves an 18-hole total, with nines when given', () => {
    expect(buildQuickEntry({ holes: 18, values: { front9: '42', back9: '45', total: '87' } }))
      .toEqual({ holesDeclared: 18, total: 87, front9: 42, back9: 45, scores: null })
    expect(buildQuickEntry({ holes: 18, values: { front9: '', back9: '', total: '88' } }))
      .toEqual({ holesDeclared: 18, total: 88, front9: null, back9: null, scores: null })
  })
})

describe('buildHoleEntry', () => {
  it('totals a full card and declares 18 holes', () => {
    const entry = buildHoleEntry(holesOf(18, '5'))
    expect(entry).toMatchObject({ holesDeclared: 18, total: 90, front9: 45, back9: 45, filled: 18 })
    expect(entry.scores).toHaveLength(18)
  })

  it('declares 9 for a clean front nine', () => {
    expect(buildHoleEntry(holesOf(9, '5'))).toMatchObject({ holesDeclared: 9, total: 45, front9: 45, back9: null, cleanNine: 'front' })
  })

  it('declares nothing for a partial round', () => {
    const entry = buildHoleEntry(holesOf(17, '5'))
    expect(entry.holesDeclared).toBeNull()
    expect(entry.filled).toBe(17)
  })

  it('spots nine scattered holes', () => {
    const values = holesOf(5, '5').map((v, i) => (i >= 9 && i < 13 ? '5' : v))
    const entry = buildHoleEntry(values)
    expect(entry.filled).toBe(9)
    expect(entry.cleanNine).toBeNull()
  })

  it('keeps empty holes as null', () => {
    expect(buildHoleEntry(holesOf(1, '4')).scores.slice(0, 3)).toEqual([4, null, null])
  })
})

describe('validateRound: hard limits (C8)', () => {
  it('accepts a normal 18-hole round', () => {
    expect(check(buildQuickEntry({ holes: 18, values: { total: '88' } }))).toEqual({ errors: [], warnings: [] })
  })

  it('requires a score', () => {
    expect(check(buildQuickEntry({ holes: 18, values: {} })).errors).toEqual(['Enter your score.'])
    expect(check(buildQuickEntry({ holes: 9, nineScore: '' })).errors).toEqual(['Enter your score.'])
  })

  it('points a lone nine in 18-hole mode at the 9-hole option', () => {
    const { errors } = check(buildQuickEntry({ holes: 18, values: { front9: '45' } }))
    expect(errors[0]).toMatch(/9 holes/)
  })

  it(`blocks totals outside ${HARD_LIMITS.total.min}-${HARD_LIMITS.total.max}`, () => {
    expect(check(buildQuickEntry({ holes: 18, values: { total: '8' } })).errors).toHaveLength(1)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '201' } })).errors).toHaveLength(1)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '9' } })).errors).toHaveLength(0)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '200' } })).errors).toHaveLength(0)
  })

  it('blocks a nine over 120', () => {
    expect(check(buildQuickEntry({ holes: 9, nineScore: '121' })).errors[0]).toMatch(/120/)
    expect(check(buildQuickEntry({ holes: 18, values: { front9: '121', back9: '40', total: '161' } })).errors[0]).toMatch(/Front 9/)
  })

  it('blocks nines that do not add up to the total', () => {
    const { errors } = check(buildQuickEntry({ holes: 18, values: { front9: '40', back9: '46', total: '85' } }))
    expect(errors[0]).toMatch(/86/)
  })

  it('blocks a total that is not more than the one nine entered', () => {
    expect(check(buildQuickEntry({ holes: 18, values: { front9: '50', total: '45' } })).errors[0]).toMatch(/more than your front 9/)
  })

  it('blocks hole scores outside 1-20, naming the holes', () => {
    const values = holesOf(18, '5')
    values[2] = '0'
    values[6] = '21'
    const { errors } = check(buildHoleEntry(values))
    expect(errors).toEqual(['Holes 3 and 7: each hole score must be a whole number from 1 to 20.'])
  })

  it('blocks negative or decimal hole scores', () => {
    const values = holesOf(18, '5')
    values[0] = '-3'
    expect(check(buildHoleEntry(values)).errors[0]).toMatch(/^Hole 1:/)
  })

  it('requires at least one hole in hole-by-hole mode', () => {
    expect(check(buildHoleEntry(holesOf(0))).errors).toEqual(['Enter at least one hole score.'])
  })

  it('blocks future dates and year typos, using the local date', () => {
    const entry = buildQuickEntry({ holes: 18, values: { total: '88' } })
    expect(check(entry, { date: '2026-11-21' }).errors).toEqual(["The date can't be in the future."])
    expect(check(entry, { date: '1926-11-20' }).errors[0]).toMatch(/typo/)
    expect(check(entry, { date: '' }).errors).toEqual(['Pick the date you played.'])
    expect(check(entry, { date: TODAY }).errors).toEqual([])
  })

  it('checks putts when given', () => {
    const entry = buildQuickEntry({ holes: 18, values: { total: '88' } })
    expect(check(entry, { putts: 32 }).errors).toEqual([])
    expect(check(entry, { putts: 100 }).errors).toHaveLength(1)
    expect(check(entry, { putts: 88 }).errors).toHaveLength(1)
  })

  it('skips the "Are you sure?" checks while there are errors', () => {
    const result = check(buildQuickEntry({ holes: 18, values: { total: '40' } }), { date: '2099-01-01' })
    expect(result.errors).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })
})

describe('validateRound: soft limits (C8)', () => {
  it('double-checks 18-hole totals under 60 or over 150, suggesting 9 holes', () => {
    expect(check(buildQuickEntry({ holes: 18, values: { total: '47' } })).warnings[0]).toMatch(/9 holes/)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '151' } })).warnings).toHaveLength(1)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '60' } })).warnings).toHaveLength(0)
    expect(check(buildQuickEntry({ holes: 18, values: { total: '150' } })).warnings).toHaveLength(0)
  })

  it('double-checks 9-hole totals under 27 or over 75', () => {
    expect(check(buildQuickEntry({ holes: 9, nineScore: '26' })).warnings).toHaveLength(1)
    expect(check(buildQuickEntry({ holes: 9, nineScore: '76' })).warnings).toHaveLength(1)
    expect(check(buildQuickEntry({ holes: 9, nineScore: '45' })).warnings).toHaveLength(0)
  })

  it('double-checks any hole over 12', () => {
    const values = holesOf(18, '5')
    values[4] = '13'
    expect(check(buildHoleEntry(values)).warnings).toEqual(['Hole 5: more than 12 strokes on a hole.'])
  })

  it('warns that a partial or scattered card will not count', () => {
    expect(check(buildHoleEntry(holesOf(17, '5'))).warnings[0]).toMatch(/17 holes/)
    const scattered = holesOf(5, '5').map((v, i) => (i >= 9 && i < 13 ? '5' : v))
    expect(check(buildHoleEntry(scattered)).warnings[0]).toMatch(/front or back nine/)
  })
})
