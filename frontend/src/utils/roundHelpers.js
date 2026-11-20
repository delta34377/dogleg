import { getDisplayName } from './courseNameUtils'
import { formatDate, formatTimeAgo } from './dateFormat'

// Canonical round-card helpers. These were copy-pasted into Feed, MyRounds,
// SingleRound, and UserProfile ("EXACT SAME AS X" comments everywhere) while
// this file held an older, unused color scheme. Now the cards import from
// here and there is exactly one set of semantics.

// Score-color semantics, one place:
//   under par → green (good), even → neutral ink, over par → orange.
// Red is reserved for double-bogey-or-worse cells inside the scorecard grid.
export function getScoreColor(vsPar) {
  if (!vsPar) return 'text-gray-700'
  if (vsPar === 'E' || vsPar === 0) return 'text-gray-700'
  if (typeof vsPar === 'string' && vsPar.startsWith('+')) return 'text-orange-600'
  if (typeof vsPar === 'number' && vsPar > 0) return 'text-orange-600'
  return 'text-green-600'
}

// A stored par of 40 or less is the par of ONE nine: the round was played on
// a nine-hole course, and the database copies courses.total_par (27-40
// there) into rounds.par. Anything above that is an 18-hole par. The
// database uses the same rule (dogleg_nine_par, and the "par x 2" rating for
// an 18 on a nine-hole course, in database/stats_layer.sql), and ScoreEntry's
// live "vs par" preview gives the same answers on nine-hole courses.
export const NINE_PAR_MAX = 40

// { nine, eighteen } for a stored par, or null when there isn't one
export function ninesFromPar(par) {
  const p = Number(par)
  if (!Number.isFinite(p) || p <= 0) return null
  return p <= NINE_PAR_MAX
    ? { nine: p, eighteen: p * 2 }        // a nine-hole course, played once or twice
    : { nine: Math.round(p / 2), eighteen: p }
}

const toPar = (value) => {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}
const isPlayed = (score) => score !== null && score !== '' && score !== undefined
const sum = (numbers) => numbers.reduce((total, n) => total + n, 0)

// The scorecard as 18 numbers (null where a hole has no par), or null when
// there is no scorecard at all. A nine-hole course's card (pars for holes
// 1-9 only, either 9 long or padded with nulls) is read again for holes
// 10-18: an 18 there is the same nine played twice.
export function cardFor(coursePars) {
  if (!Array.isArray(coursePars)) return null
  const card = Array.from({ length: 18 }, (_, i) => toPar(coursePars[i]))
  if (card.every(p => p === null)) return null
  if (card.slice(9).some(p => p !== null)) return card
  return card.map((_, i) => card[i % 9])
}

// The par to compare a normalized round with, for the holes it covers (null
// when there is none). The round cards and ShareModal's share image both go
// through here, via calculateVsPar, so they always agree.
export function parForRound(round) {
  const card = cardFor(round.coursePars)
  const storedPar = toPar(round.par)
  // No stored par: fall back to what the scorecard adds up to
  const basePar = storedPar ?? (card ? sum(card.map(p => p ?? 4)) : null)
  const pars = ninesFromPar(basePar)
  if (!pars) return null

  // Hole by hole: the par of just the holes played
  const holes = Array.isArray(round.holes) ? round.holes : []
  const played = holes.flatMap((score, index) => (isPlayed(score) ? [index] : []))
  if (played.length > 0) {
    // A hole missing from the scorecard counts as a par 4
    if (card) return sum(played.map(i => card[i] ?? 4))
    return Math.round((pars.eighteen / 18) * played.length)
  }

  // One nine entered as a total: the par of that nine
  if (!!round.front9 !== !!round.back9) {
    const nine = card && (round.front9 ? card.slice(0, 9) : card.slice(9, 18))
    if (nine && nine.every(p => p !== null)) return sum(nine)
    return pars.nine
  }

  // Both nines: 18 holes
  if (round.front9 && round.back9) return pars.eighteen

  // A total only. holes_played (worked out by the database) says how many
  // holes it covers; without it, compare with the stored par as it is.
  if (round.holes_played === 18) return pars.eighteen
  if (round.holes_played === 9) return pars.nine
  return basePar
}

// Vs-par for a normalized round ({ total, holes, coursePars, front9, back9,
// par, holes_played }): "+7", "E", "-2", or null when there is no par to
// compare with. Uses the par of only the holes actually played, so
// nine-hole and partial rounds read correctly.
export function calculateVsPar(round) {
  if (!round) return null
  const total = Number(round.total)
  if (round.total === null || round.total === undefined || round.total === '' || !Number.isFinite(total)) return null

  const par = parForRound(round)
  if (par === null) return null

  const diff = total - par
  if (diff === 0) return 'E'
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

export function formatTeeDetails(tee) {
  if (!tee) return null
  let details = tee.tee_name || tee.tee_color || 'Tees'
  details += ' tees'

  const extraDetails = []
  if (tee.total_length) {
    extraDetails.push(`${tee.total_length}${tee.measure_unit || 'y'}`)
  }
  if (tee.slope && tee.course_rating) {
    extraDetails.push(`${tee.slope}/${tee.course_rating}`)
  } else if (tee.slope) {
    extraDetails.push(`Slope: ${tee.slope}`)
  }

  if (extraDetails.length > 0) {
    details += ` • ${extraDetails.join(' • ')}`
  }

  return details
}

export { getDisplayName, formatDate, formatTimeAgo }
