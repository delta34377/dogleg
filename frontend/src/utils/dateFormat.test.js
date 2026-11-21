import { parseLocalDate, formatDate, formatTimeAgo } from './dateFormat'
import { formatChartDate, formatFullDate, dateAxisProps } from '../components/StatsPage'

// The Stats page imports the Supabase client (through AuthContext). Swap it
// for an empty stand-in so these date tests never touch the network.
jest.mock('../services/supabase', () => ({ supabase: {} }))

// IMPORTANT: several of these tests only catch the "one day early" bug when
// they run in a time zone WEST of Greenwich (all of the US). In a UTC time
// zone the buggy code and the fixed code give the same answer. CI therefore
// runs the tests with TZ=America/Los_Angeles; to do the same locally:
//   TZ=America/Los_Angeles npm test
// (Setting process.env.TZ inside a test file has no effect under Jest.)

// "Now" for every test below, unless a test says otherwise:
// Wednesday 15 July 2026, midday local time.
const NOW = new Date(2026, 6, 15, 12, 0, 0)

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('parseLocalDate', () => {
  test('a date-only string is that calendar day at local midnight, not UTC midnight', () => {
    // new Date('2026-07-04') would be 4 July 00:00 UTC, which is still
    // 3 July in the US. That was the "round shows one day early" bug.
    const date = parseLocalDate('2026-07-04')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6) // months count from 0, so 6 = July
    expect(date.getDate()).toBe(4)
    expect(date.getTime()).toBe(new Date(2026, 6, 4).getTime())
  })

  test('the "T00:00:00" form the app used to save is also read as local midnight', () => {
    expect(parseLocalDate('2026-07-04T00:00:00').getTime()).toBe(new Date(2026, 6, 4).getTime())
  })

  test('a full timestamp with a time zone keeps its exact moment', () => {
    expect(parseLocalDate('2026-07-04T18:30:00Z').getTime()).toBe(Date.UTC(2026, 6, 4, 18, 30))
    expect(parseLocalDate('2026-07-04T18:30:00+00:00').getTime()).toBe(Date.UTC(2026, 6, 4, 18, 30))
  })

  test.each([null, undefined, '', 'not a date'])('returns null for %p', (value) => {
    expect(parseLocalDate(value)).toBeNull()
  })
})

describe('formatDate', () => {
  test('today and yesterday get words instead of dates', () => {
    expect(formatDate('2026-07-15')).toBe('Today')
    expect(formatDate('2026-07-14')).toBe('Yesterday')
  })

  test('older dates this year show month and day only', () => {
    expect(formatDate('2026-06-30')).toBe('Jun 30')
    expect(formatDate('2026-01-01')).toBe('Jan 1')
  })

  test('dates from another year include the year', () => {
    expect(formatDate('2025-06-30')).toBe('Jun 30, 2025')
    expect(formatDate('2025-07-15')).toBe('Jul 15, 2025')
  })

  test('a round played on the 4th shows the 4th, not the 3rd (time zone regression)', () => {
    expect(formatDate('2026-07-04')).toBe('Jul 4')
  })

  test('a future date is shown as a date (there is no "Tomorrow")', () => {
    expect(formatDate('2026-07-16')).toBe('Jul 16')
  })

  test('late-evening local timestamps still count as that day', () => {
    expect(formatDate('2026-07-14T23:30:00')).toBe('Yesterday')
    expect(formatDate('2026-07-15T00:05:00')).toBe('Today')
  })

  test('on New Year\'s Day, New Year\'s Eve is "Yesterday" and older days show last year', () => {
    jest.setSystemTime(new Date(2026, 0, 1, 9, 0, 0))
    expect(formatDate('2025-12-31')).toBe('Yesterday')
    expect(formatDate('2025-12-30')).toBe('Dec 30, 2025')
  })

  test('the day after the clocks change is still exactly one day', () => {
    // US daylight saving ended on 1 Nov 2026, so that day was 25 hours long
    jest.setSystemTime(new Date(2026, 10, 2, 8, 0, 0))
    expect(formatDate('2026-11-01')).toBe('Yesterday')
    expect(formatDate('2026-10-31')).toBe('Oct 31')
  })

  test.each([null, undefined, '', 'garbage'])('returns an empty string for %p', (value) => {
    expect(formatDate(value)).toBe('')
  })
})

describe('formatTimeAgo', () => {
  const secondsAgo = (s) => new Date(NOW.getTime() - s * 1000).toISOString()

  test('under a minute is "just now"', () => {
    expect(formatTimeAgo(secondsAgo(0))).toBe('just now')
    expect(formatTimeAgo(secondsAgo(59))).toBe('just now')
  })

  test('minutes and hours are compact', () => {
    expect(formatTimeAgo(secondsAgo(60))).toBe('1m')
    expect(formatTimeAgo(secondsAgo(12 * 60))).toBe('12m')
    expect(formatTimeAgo(secondsAgo(3 * 3600))).toBe('3h')
    expect(formatTimeAgo(secondsAgo(23 * 3600 + 59 * 60))).toBe('23h')
  })

  test('after a day it falls back to formatDate', () => {
    expect(formatTimeAgo(secondsAgo(2 * 86400))).toBe('Jul 13')
    expect(formatTimeAgo('2025-03-02T10:00:00')).toBe('Mar 2, 2025')
  })

  test('a timestamp slightly in the future (phone clock ahead) shows "just now"', () => {
    expect(formatTimeAgo(secondsAgo(-90))).toBe('just now')
  })

  test.each([null, undefined, ''])('returns an empty string for %p', (value) => {
    expect(formatTimeAgo(value)).toBe('')
  })
})

// The chart helpers live in components/StatsPage.js. PRs #3, #4 and #5 were
// all fixes to how they label dates, so the exact behaviour is locked in here.
describe('Stats page chart dates (PRs #3, #4 and #5)', () => {
  test('per-round ticks read "Jul 15"', () => {
    expect(formatChartDate('2026-07-15')).toBe('Jul 15')
    expect(formatChartDate('')).toBe('')
  })

  test('tooltips and the Best Round tile always include the year (PRs #3, #4)', () => {
    expect(formatFullDate('2024-07-15')).toBe('Jul 15, 2024')
    // The Best Round tile passes String(played_at).slice(0, 10)
    expect(formatFullDate(String('2025-07-12T00:00:00+00:00').slice(0, 10))).toBe('Jul 12, 2025')
    expect(formatFullDate(null)).toBe('')
  })

  test('first-of-month dates are not pushed back into the previous month', () => {
    // Only true because the helpers add 'T00:00:00' (local midnight).
    expect(formatChartDate('2026-08-01')).toBe('Aug 1')
    expect(formatFullDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  test('a chart within one calendar year ticks per round, labelled with the day', () => {
    const data = [{ date: '2026-03-02' }, { date: '2026-03-20' }, { date: null }, { date: '2026-07-15' }]
    const props = dateAxisProps(data)
    expect(props.ticks).toBeUndefined() // recharts picks the ticks itself
    expect(props.tickFormatter('2026-07-15')).toBe('Jul 15')
  })

  test('an empty chart is treated as single-year', () => {
    expect(dateAxisProps([]).ticks).toBeUndefined()
  })

  test('a chart spanning two years ticks once per month, on that month\'s first round (PR #5)', () => {
    const data = [
      { date: '2025-12-05' },
      { date: '2025-12-20' },
      { date: '2026-01-03' },
      { date: '2026-01-28' },
      { date: '2026-03-09' },
    ]
    expect(dateAxisProps(data).ticks).toEqual(['2025-12-05', '2026-01-03', '2026-03-09'])
  })

  test('multi-year ticks read "Aug \'26": month and year, no day number (PR #4 -> #5)', () => {
    // PR #4 labelled these "Jul 15 '24"; PR #5 dropped the day because the
    // ticks now sit on month starts and the tooltip carries the exact date.
    const { tickFormatter } = dateAxisProps([{ date: '2025-08-10' }, { date: '2026-08-02' }])
    expect(tickFormatter('2026-08-02')).toBe("Aug '26")
    expect(tickFormatter('2025-08-10')).toBe("Aug '25")
    // 1 January must not turn into "Dec '26" (wrong month AND wrong year)
    expect(tickFormatter('2026-01-01')).toBe("Jan '26")
    expect(tickFormatter('')).toBe('')
  })
})
