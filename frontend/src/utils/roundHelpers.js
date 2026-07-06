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

// Vs-par for a normalized round ({ total, holes, coursePars, front9, back9,
// par }). Sums par for only the holes actually played, so nine-hole and
// partial rounds read correctly.
export function calculateVsPar(round) {
  if (!round.par && !round.coursePars) return null
  if (round.total === null || round.total === undefined) return null

  let parForHolesPlayed = round.par || 72

  if (round.holes && round.holes.some(h => h)) {
    const playedHoleIndices = []
    round.holes.forEach((score, index) => {
      if (score !== null && score !== '' && score !== undefined) {
        playedHoleIndices.push(index)
      }
    })

    if (round.coursePars && playedHoleIndices.length > 0) {
      parForHolesPlayed = playedHoleIndices.reduce((sum, holeIndex) => {
        return sum + parseInt(round.coursePars[holeIndex] || 4)
      }, 0)
    } else if (playedHoleIndices.length > 0) {
      parForHolesPlayed = Math.round((round.par / 18) * playedHoleIndices.length)
    }
  } else if (round.front9 && !round.back9) {
    if (round.coursePars) {
      parForHolesPlayed = round.coursePars.slice(0, 9).reduce((sum, p) => sum + parseInt(p), 0)
    } else {
      parForHolesPlayed = Math.round(round.par / 2)
    }
  } else if (!round.front9 && round.back9) {
    if (round.coursePars) {
      parForHolesPlayed = round.coursePars.slice(9, 18).reduce((sum, p) => sum + parseInt(p), 0)
    } else {
      parForHolesPlayed = Math.round(round.par / 2)
    }
  }

  const diff = round.total - parForHolesPlayed
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
