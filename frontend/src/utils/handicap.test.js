import { parseHandicapInput, formatHandicap } from './handicap'

describe('parseHandicapInput', () => {
  test('empty box means "not set"', () => {
    expect(parseHandicapInput('')).toEqual({ value: null, error: null })
    expect(parseHandicapInput('   ')).toEqual({ value: null, error: null })
    expect(parseHandicapInput(undefined)).toEqual({ value: null, error: null })
  })

  test('accepts scratch (0), whole numbers and one decimal', () => {
    expect(parseHandicapInput('0')).toEqual({ value: 0, error: null })
    expect(parseHandicapInput('15')).toEqual({ value: 15, error: null })
    expect(parseHandicapInput('12.4')).toEqual({ value: 12.4, error: null })
    expect(parseHandicapInput('12,4')).toEqual({ value: 12.4, error: null })
    expect(parseHandicapInput('54')).toEqual({ value: 54, error: null })
  })

  test('stores plus handicaps as negative numbers', () => {
    expect(parseHandicapInput('+2.4')).toEqual({ value: -2.4, error: null })
    expect(parseHandicapInput('+10')).toEqual({ value: -10, error: null })
    expect(parseHandicapInput('+0')).toEqual({ value: 0, error: null })
    expect(Object.is(parseHandicapInput('+0').value, -0)).toBe(false)
  })

  test('rejects out-of-range and malformed values', () => {
    expect(parseHandicapInput('54.1').error).toBeTruthy()
    expect(parseHandicapInput('150').error).toBeTruthy()
    expect(parseHandicapInput('+10.1').error).toBeTruthy()
    expect(parseHandicapInput('12.45').error).toBeTruthy()
    expect(parseHandicapInput('abc').error).toBeTruthy()
    expect(parseHandicapInput('-2').error).toMatch(/\+ sign/)
  })
})

describe('formatHandicap', () => {
  test('shows plus handicaps with a + sign', () => {
    expect(formatHandicap(-2.4)).toBe('+2.4')
    expect(formatHandicap(-10)).toBe('+10')
  })

  test('shows regular handicaps and scratch as plain numbers', () => {
    expect(formatHandicap(0)).toBe('0')
    expect(formatHandicap(12)).toBe('12')
    expect(formatHandicap(12.4)).toBe('12.4')
    expect(formatHandicap('12.4')).toBe('12.4')
  })

  test('returns an empty string when there is no handicap', () => {
    expect(formatHandicap(null)).toBe('')
    expect(formatHandicap(undefined)).toBe('')
    expect(formatHandicap('')).toBe('')
  })

  test('round-trips with parseHandicapInput', () => {
    for (const text of ['0', '7', '12.4', '+2.4', '+10', '54']) {
      expect(formatHandicap(parseHandicapInput(text).value)).toBe(text)
    }
  })
})
