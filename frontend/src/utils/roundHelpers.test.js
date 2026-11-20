import {
  getScoreColor,
  calculateVsPar,
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
