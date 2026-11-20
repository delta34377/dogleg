import {
  getScoreColor,
  calculateVsPar,
  parForRound,
  ninesFromPar,
  NINE_PAR_MAX,
  formatTeeDetails,
  getDisplayName,
  formatDate,
  formatTimeAgo,
} from './roundHelpers'
import { getDisplayName as courseNameGetDisplayName } from './courseNameUtils'
import { formatDate as dateFormatFormatDate, formatTimeAgo as dateFormatFormatTimeAgo } from './dateFormat'

// roundHelpers holds the shared round-card logic (score colour, "+7" vs par,
// tee line). These tests use the "normalized" round shape the cards receive:
// { total, holes, coursePars, front9, back9, par }.

// A par-71 course: front nine par 36, back nine par 35.
const FRONT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5]
const BACK_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 4]
const PARS_71 = [...FRONT_PARS, ...BACK_PARS]
const sum = (numbers) => numbers.reduce((a, b) => a + b, 0)
const empty = (n, value = null) => Array(n).fill(value)

describe('calculateVsPar: totals only', () => {
  test('over, level and under par', () => {
    expect(calculateVsPar({ total: 79, par: 72 })).toBe('+7')
    expect(calculateVsPar({ total: 72, par: 72 })).toBe('E')
    expect(calculateVsPar({ total: 68, par: 72 })).toBe('-4')
  })

  test('returns null when there is no par information', () => {
    expect(calculateVsPar({ total: 79 })).toBeNull()
  })

  test.each([null, undefined])('returns null when the total is %p', (total) => {
    expect(calculateVsPar({ total, par: 72 })).toBeNull()
  })

  test('the two nines of an 18-hole round count against the full par', () => {
    expect(calculateVsPar({ total: 79, front9: 40, back9: 39, par: 72 })).toBe('+7')
  })
})

describe('calculateVsPar: nine-hole rounds entered as a total', () => {
  // Since the ENTRY-1 fix, a 9-hole Quick Score is saved with front9 = total
  // (or back9 = total for the back nine). It must be compared with the par of
  // those nine holes, never with 72: a 45 is "+9", not "-27".
  test('front nine compares with the front-nine par from the scorecard', () => {
    expect(calculateVsPar({ total: 45, front9: 45, back9: null, par: 71, coursePars: PARS_71 })).toBe('+9')
  })

  test('back nine compares with the back-nine par from the scorecard', () => {
    expect(calculateVsPar({ total: 40, front9: null, back9: 40, par: 71, coursePars: PARS_71 })).toBe('+5')
  })

  test('without a scorecard it uses half the course par, rounded', () => {
    expect(calculateVsPar({ total: 45, front9: 45, par: 72 })).toBe('+9')
    expect(calculateVsPar({ total: 45, front9: 45, par: 71 })).toBe('+9') // 35.5 rounds to 36
    expect(calculateVsPar({ total: 40, back9: 40, par: 72 })).toBe('+4')
  })

  test('an untouched hole grid (all blanks) does not hide the nine total', () => {
    const round = { total: 45, front9: 45, holes: empty(18, ''), par: 71, coursePars: PARS_71 }
    expect(calculateVsPar(round)).toBe('+9')
  })
})

describe('calculateVsPar: hole-by-hole rounds', () => {
  test('a full round uses the real course pars, not the stored round par', () => {
    // Every hole parred on a par-71 course is level par, even though the
    // round row says par 72.
    expect(calculateVsPar({ total: 71, holes: PARS_71, par: 72, coursePars: PARS_71 })).toBe('E')
  })

  test('front nine only: par of the holes actually played', () => {
    const holes = [...FRONT_PARS.map(p => p + 1), ...empty(9)]
    expect(calculateVsPar({ total: sum(holes.filter(Boolean)), holes, par: 71, coursePars: PARS_71 })).toBe('+9')
  })

  test('back nine only: par of holes 10-18', () => {
    const holes = [...empty(9), ...BACK_PARS.map(p => p + 1)]
    expect(calculateVsPar({ total: 44, holes, par: 71, coursePars: PARS_71 })).toBe('+9')
  })

  test('blank strings in the grid count as holes not played', () => {
    const holes = [...FRONT_PARS, ...empty(9, '')]
    expect(calculateVsPar({ total: 36, holes, par: 71, coursePars: PARS_71 })).toBe('E')
  })

  test('pars stored as text are added up as numbers', () => {
    const textPars = PARS_71.map(String)
    expect(calculateVsPar({ total: 75, holes: PARS_71, par: 71, coursePars: textPars })).toBe('+4')
  })

  test('a hole with no par on the scorecard counts as a par 4', () => {
    const pars = [...PARS_71]
    pars[2] = null // hole 3 (really a par 3) is missing
    expect(calculateVsPar({ total: 71, holes: PARS_71, par: 71, coursePars: pars })).toBe('-1')
  })

  test('without a scorecard, played holes get an equal share of the course par', () => {
    const holes = [...empty(9, 5), ...empty(9)]
    expect(calculateVsPar({ total: 45, holes, par: 72 })).toBe('+9') // 72 / 18 * 9 = 36
  })
})

describe('calculateVsPar: nine-hole courses (a stored par of 40 or less)', () => {
  // On a nine-hole course the database stores the course's par, 36, as the
  // round's par, and course_pars as the nine's card padded with nulls (or
  // null when the course has no card). An 18 there is the nine played twice.
  const NINE_CARD = [4, 4, 3, 5, 4, 4, 3, 5, 4]                // par 36
  const PADDED_NINE_CARD = [...NINE_CARD, ...empty(9)]         // as rounds.course_pars stores it
  const twice = (scores) => [...scores, ...scores]

  test('18 holes as two nines compare with twice the nine par, not with 36', () => {
    const round = { front9: 42, back9: 44, total: 86, par: 36, holes_played: 18 }
    expect(calculateVsPar(round)).toBe('+14')
    expect(calculateVsPar({ ...round, coursePars: PADDED_NINE_CARD })).toBe('+14')
    expect(calculateVsPar({ ...round, coursePars: NINE_CARD })).toBe('+14')
  })

  test('an 18-hole total on its own (holes_played 18) also compares with twice the nine', () => {
    expect(calculateVsPar({ total: 86, par: 36, holes_played: 18 })).toBe('+14')
  })

  test('a nine with no scorecard compares with the course par itself, not half of it', () => {
    // course_pars null (the client no longer sends a made-up card): a 45 is
    // "+9", not "+27"
    expect(calculateVsPar({ front9: 45, total: 45, par: 36, coursePars: null, holes_played: 9 })).toBe('+9')
    expect(calculateVsPar({ total: 45, par: 36, holes_played: 9 })).toBe('+9')
  })

  test('a hole-by-hole nine with no scorecard: an equal share of the 18-hole par (72)', () => {
    const holes = [...empty(9, 5), ...empty(9)]
    expect(calculateVsPar({ total: 45, holes, par: 36, coursePars: null })).toBe('+9')
  })

  test('hole by hole over 18: holes 10-18 read the nine\'s pars again', () => {
    // A par-34 nine, so "a par 4 on every hole we have no par for" (36)
    // would give a different answer
    const PAR_34 = [4, 3, 4, 3, 5, 4, 3, 4, 4]
    const bogeys = twice(PAR_34.map(p => p + 1))
    expect(calculateVsPar({ total: 86, holes: bogeys, par: 34, coursePars: PAR_34 })).toBe('+18')
    expect(calculateVsPar({ total: 86, holes: bogeys, par: 34, coursePars: [...PAR_34, ...empty(9)] })).toBe('+18')
    expect(calculateVsPar({ total: 68, holes: twice(PAR_34), par: 34, coursePars: PAR_34 })).toBe('E')
    expect(calculateVsPar({ total: 72, holes: twice(NINE_CARD), par: 36, coursePars: PADDED_NINE_CARD })).toBe('E')
  })

  test('the nine played once, hole by hole, uses the card', () => {
    const holes = [...NINE_CARD.map(p => p + 1), ...empty(9)]
    expect(calculateVsPar({ total: 45, holes, par: 36, coursePars: PADDED_NINE_CARD })).toBe('+9')
  })

  test('a lone "back nine" total there is still the same nine', () => {
    expect(calculateVsPar({ back9: 40, total: 40, par: 36, coursePars: PADDED_NINE_CARD })).toBe('+4')
  })
})

describe('calculateVsPar: 18-hole courses keep working as before', () => {
  test('a par-72 round with holes_played 18', () => {
    expect(calculateVsPar({ total: 79, par: 72, holes_played: 18 })).toBe('+7')
    expect(calculateVsPar({ front9: 40, back9: 39, total: 79, par: 72, holes_played: 18, coursePars: PARS_71 })).toBe('+7')
  })

  test('a total-only nine (holes_played 9) on an 18-hole course compares with half the par', () => {
    expect(calculateVsPar({ total: 45, par: 72, holes_played: 9 })).toBe('+9')
  })

  test('a nine whose scorecard is incomplete uses half the course par instead of breaking', () => {
    const pars = [...FRONT_PARS, ...empty(9)].map((p, i) => (i === 12 ? 4 : p)) // one back-nine par only
    expect(calculateVsPar({ back9: 40, total: 40, par: 71, coursePars: pars })).toBe('+4') // 71 / 2 rounds to 36
  })

  test('a stored par but a scorecard with no pars at all', () => {
    expect(calculateVsPar({ front9: 45, total: 45, par: 72, coursePars: empty(18) })).toBe('+9')
  })

  test('no stored par: the scorecard decides', () => {
    expect(calculateVsPar({ total: 75, par: null, coursePars: PARS_71 })).toBe('+4')
  })
})

describe('ninesFromPar', () => {
  test.each([
    [36, { nine: 36, eighteen: 72 }],
    [NINE_PAR_MAX, { nine: 40, eighteen: 80 }],
    [27, { nine: 27, eighteen: 54 }],
    [72, { nine: 36, eighteen: 72 }],
    [71, { nine: 36, eighteen: 71 }],
    ['70', { nine: 35, eighteen: 70 }],
  ])('par %p', (par, expected) => {
    expect(ninesFromPar(par)).toEqual(expected)
  })

  test.each([null, undefined, 0, '', 'abc'])('%p has no par', (par) => {
    expect(ninesFromPar(par)).toBeNull()
  })
})

test('parForRound is what calculateVsPar compares with', () => {
  expect(parForRound({ front9: 42, back9: 44, total: 86, par: 36, holes_played: 18 })).toBe(72)
  expect(parForRound({ front9: 45, total: 45, par: 36 })).toBe(36)
  expect(parForRound({ total: 79 })).toBeNull()
})

describe('getScoreColor', () => {
  test.each([['E'], [0], [null], [undefined], ['']])('%p is neutral', (value) => {
    expect(getScoreColor(value)).toBe('text-gray-700')
  })

  test.each([['+3'], [3]])('%p (over par) is orange', (value) => {
    expect(getScoreColor(value)).toBe('text-orange-600')
  })

  test.each([['-2'], [-2]])('%p (under par) is green', (value) => {
    expect(getScoreColor(value)).toBe('text-green-600')
  })

  test('works on what calculateVsPar returns', () => {
    expect(getScoreColor(calculateVsPar({ total: 79, par: 72 }))).toBe('text-orange-600')
    expect(getScoreColor(calculateVsPar({ total: 72, par: 72 }))).toBe('text-gray-700')
    expect(getScoreColor(calculateVsPar({ total: 70, par: 72 }))).toBe('text-green-600')
  })
})

describe('formatTeeDetails', () => {
  test('name, length, slope and rating', () => {
    expect(formatTeeDetails({ tee_name: 'Blue', total_length: 6512, slope: 131, course_rating: 71.8 }))
      .toBe('Blue tees • 6512y • 131/71.8')
  })

  test('uses the measure unit when the course is in metres', () => {
    expect(formatTeeDetails({ tee_name: 'White', total_length: 5954, measure_unit: 'm' }))
      .toBe('White tees • 5954m')
  })

  test('falls back to the tee colour and shows slope alone when there is no rating', () => {
    expect(formatTeeDetails({ tee_color: 'Red', slope: 118 })).toBe('Red tees • Slope: 118')
  })

  test('a rating without a slope is not shown', () => {
    expect(formatTeeDetails({ tee_name: 'Gold', course_rating: 73.4 })).toBe('Gold tees')
  })

  test.each([null, undefined])('returns null for %p', (tee) => {
    expect(formatTeeDetails(tee)).toBeNull()
  })
})

test('re-exports the shared name and date helpers rather than copies of them', () => {
  expect(getDisplayName).toBe(courseNameGetDisplayName)
  expect(formatDate).toBe(dateFormatFormatDate)
  expect(formatTimeAgo).toBe(dateFormatFormatTimeAgo)
})
