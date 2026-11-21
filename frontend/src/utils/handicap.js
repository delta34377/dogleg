// Reading and showing the manual handicap a golfer types on their profile.
//
// Golf writes better-than-scratch handicaps with a plus sign ("+2.4"). The
// stats engine (database/stats_layer.sql) does plain arithmetic with
// profiles.handicap — 0.52 × handicap + 1.2 for nine-hole rounds and
// handicap + 3 as a first Dogleg Score baseline — so, like the World Handicap
// System, a plus handicap must be stored as a NEGATIVE number: "+2.4" is
// saved as -2.4. These helpers convert between what people type and what is
// stored.

export const HANDICAP_MIN = -10 // stored value for a "+10" handicap
export const HANDICAP_MAX = 54 // the WHS maximum

// Turns the text from the input box into the number to save.
// Returns { value, error }: value is null for an empty box ("not set").
export function parseHandicapInput(text) {
  // Accept a decimal comma too ("12,4"), which many phone keyboards produce
  const trimmed = String(text ?? '').trim().replace(',', '.')
  if (trimmed === '') return { value: null, error: null }

  if (trimmed.startsWith('-')) {
    return { value: null, error: 'Plus handicaps are written with a + sign, for example +2.4.' }
  }

  const match = /^(\+)?(\d{1,3})(?:\.(\d))?$/.exec(trimmed)
  if (!match) {
    return { value: null, error: 'Enter a handicap like 12, 12.4 or +2.4 (one decimal at most).' }
  }

  const magnitude = Number(`${match[2]}.${match[3] || '0'}`)
  const value = match[1] ? -magnitude : magnitude
  if (value < HANDICAP_MIN || value > HANDICAP_MAX) {
    return { value: null, error: 'Handicaps go from +10 to 54.' }
  }

  // "+0" would otherwise become -0
  return { value: value === 0 ? 0 : value, error: null }
}

// Shows a stored handicap the way golfers write it: -2.4 → "+2.4", 12 → "12".
// Returns '' when there is no handicap.
export function formatHandicap(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''

  const rounded = Math.round(Math.abs(number) * 10) / 10
  if (number < 0 && rounded > 0) return `+${rounded}`
  return String(rounded)
}
