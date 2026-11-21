// Score entry rules: what a golfer can type, how the Quick Score boxes fill
// each other in, and which scores we refuse or double-check before saving.
//
// Everything here is a plain function (no React, no network) so it can be
// unit tested — see scoreValidation.test.js.
//
// The HARD limits must match the database (database/security_hardening.sql
// raises a check_violation for anything outside them). The database is the
// real guard; checking here too just gives the golfer a friendly message
// before anything is sent. The SOFT limits only ask "Are you sure?".

export const HARD_LIMITS = {
  total: { min: 9, max: 200 },  // total_score
  hole: { min: 1, max: 20 },    // every entry in scores_by_hole
  nine: { min: 1, max: 120 },   // front9 / back9
  putts: { min: 0, max: 99 },   // total_putts (client-side only)
}

export const SOFT_LIMITS = {
  eighteen: { low: 60, high: 150 },
  nine: { low: 27, high: 75 },
  holeHigh: 12, // any single hole above this gets a double-check
}

// Rounds dated before this are almost certainly a typo in the year
export const EARLIEST_DATE = '2000-01-01'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Today's date as YYYY-MM-DD in the golfer's OWN time zone. (Using
// toISOString() here would give the UTC date, which is already "tomorrow"
// on a US evening — ENTRY-10.)
export function localDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Turns what's in a score box into a number.
//   ''/null/undefined -> null (box left empty)
//   '85' or 85        -> 85
//   anything else ('-3', '4.5', 'abc') -> NaN, which validation reports
export function parseScore(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  if (!/^\d+$/.test(text)) return NaN
  return parseInt(text, 10)
}

const isWholeNumber = (n) => Number.isInteger(n)

// Course pars as numbers, or null when we don't really know them.
// courses.pars arrives as strings ("4"), and some courses have no pars at
// all. We never invent pars: a fake all-4s card would count a 3 on a par 3
// as a birdie in the stats (STATS-7).
export function parseCoursePars(pars) {
  if (!Array.isArray(pars)) return null
  if (pars.length !== 9 && pars.length !== 18) return null
  const numbers = pars.map((p) => parseScore(p))
  if (numbers.some((p) => p === null || !isWholeNumber(p) || p < 3 || p > 6)) return null
  return numbers
}

// ---------------------------------------------------------------------------
// Quick Score, 18 holes: Front 9, Back 9 and Total.
//
// Any two boxes the golfer typed decide the third, which we fill in for
// them: front + back -> total, total + front -> back, total + back -> front.
// A box the golfer typed is never overwritten. (The old code turned
// "Total 85, then Front 9 40" into a total of 40 — ENTRY-1.)
// ---------------------------------------------------------------------------

export const QUICK_FIELDS = ['front9', 'back9', 'total']

// values: { front9, back9, total } as the strings in the boxes
// typed:  { front9, back9, total } — true for boxes the golfer typed
// Returns the new box values.
export function fillEighteen(values, typed) {
  const out = { ...values }
  const typedFields = QUICK_FIELDS.filter((f) => typed[f] && String(values[f] ?? '') !== '')

  // Boxes the golfer didn't type were filled in by us; recompute them
  QUICK_FIELDS.forEach((f) => {
    if (!typedFields.includes(f)) out[f] = ''
  })

  if (typedFields.length !== 2) return out

  const n = (f) => parseScore(out[f])
  const derived = QUICK_FIELDS.find((f) => !typedFields.includes(f))
  let value
  if (derived === 'total') value = n('front9') + n('back9')
  else if (derived === 'back9') value = n('total') - n('front9')
  else value = n('total') - n('back9')

  // Leave it empty when the typed numbers don't make sense (e.g. a total
  // smaller than the front nine); validation explains the problem on Save
  out[derived] = isWholeNumber(value) && value > 0 ? String(value) : ''
  return out
}

// When the golfer typed all three boxes and they don't add up, a sentence
// saying so; otherwise null.
export function eighteenMismatch(values) {
  const f = parseScore(values.front9)
  const b = parseScore(values.back9)
  const t = parseScore(values.total)
  if (![f, b, t].every(isWholeNumber)) return null
  if (f + b === t) return null
  return `Front 9 (${f}) + Back 9 (${b}) = ${f + b}, but your total says ${t}.`
}

// ---------------------------------------------------------------------------
// Building the numbers we save
// ---------------------------------------------------------------------------

// Quick Score. holes is 9 or 18; for 9, side says which nine was played.
// A 9-hole score is saved as the total AND as that nine (front9 or back9),
// so the database uses that nine's ratings even before holes_declared
// exists.
export function buildQuickEntry({ holes, side = 'front', values = {}, nineScore = '' }) {
  if (holes === 9) {
    const score = parseScore(nineScore)
    return {
      holesDeclared: 9,
      total: score,
      front9: side === 'back' ? null : score,
      back9: side === 'back' ? score : null,
      scores: null,
    }
  }
  return {
    holesDeclared: 18,
    total: parseScore(values.total),
    front9: parseScore(values.front9),
    back9: parseScore(values.back9),
    scores: null,
  }
}

// Hole by hole. holeValues is the 18 strings from the hole boxes.
export function buildHoleEntry(holeValues) {
  const scores = Array.from({ length: 18 }, (_, i) => parseScore(holeValues?.[i]))
  const filledIndexes = scores.map((s, i) => (s === null ? -1 : i)).filter((i) => i >= 0)
  const filled = filledIndexes.length
  const valid = scores.every((s) => s === null || isWholeNumber(s))

  const sum = (from, to) => {
    const part = scores.slice(from, to).filter((s) => s !== null)
    return part.length > 0 && valid ? part.reduce((a, s) => a + s, 0) : null
  }
  const front9 = sum(0, 9)
  const back9 = sum(9, 18)
  const total = front9 === null && back9 === null ? null : (front9 || 0) + (back9 || 0)

  // Which clean nine (all of 1-9, or all of 10-18) — the only 9-hole
  // shapes the handicap can rate
  let cleanNine = null
  if (filled === 9 && filledIndexes.every((i) => i < 9)) cleanNine = 'front'
  if (filled === 9 && filledIndexes.every((i) => i >= 9)) cleanNine = 'back'

  return {
    // Only 9 or 18 are meaningful; partial rounds are left to the database
    holesDeclared: filled === 18 ? 18 : filled === 9 ? 9 : null,
    total: valid ? total : NaN,
    front9: valid ? front9 : null,
    back9: valid ? back9 : null,
    scores,
    filled,
    cleanNine,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const listHoles = (numbers) => {
  if (numbers.length === 1) return `Hole ${numbers[0]}`
  return `Holes ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

// entry: from buildQuickEntry / buildHoleEntry, plus
//   date:  'YYYY-MM-DD' from the date picker
//   putts: total putts (number, null or NaN)
// options.today: today's local date (passed in so tests are stable)
//
// Returns { errors, warnings }. Errors block saving; warnings ask "Are you
// sure?". Warnings are only worked out when there are no errors.
export function validateRound(entry, { today = localDateString() } = {}) {
  const errors = []
  const warnings = []
  const { total, front9, back9, scores, holesDeclared } = entry
  const isHoleByHole = Array.isArray(scores)
  const { total: T, hole: H, nine: N, putts: P } = HARD_LIMITS

  // --- the score itself ---
  if (isHoleByHole) {
    const bad = []
    scores.forEach((s, i) => {
      if (s !== null && (!isWholeNumber(s) || s < H.min || s > H.max)) bad.push(i + 1)
    })
    // The database also limits each nine's sum (front9 / back9), so nine
    // holes of 14 (126) are refused even though every hole is within limits
    const bigNine = [['front 9', front9], ['back 9', back9]].find(([, v]) => v !== null && v > N.max)
    if (bad.length > 0) {
      errors.push(`${listHoles(bad)}: each hole score must be a whole number from ${H.min} to ${H.max}.`)
    } else if (entry.filled === 0 || total === null) {
      errors.push('Enter at least one hole score.')
    } else if (total < T.min) {
      errors.push(`Your total must be at least ${T.min}. Enter the rest of your holes.`)
    } else if (total > T.max) {
      errors.push(`Your total must be ${T.max} or less.`)
    } else if (bigNine) {
      errors.push(`Your ${bigNine[0]} adds up to ${bigNine[1]}, but each nine must be ${N.max} strokes or less. Check your hole scores.`)
    }
  } else {
    const nineChecks = [['Front 9', front9], ['Back 9', back9]]
    const badNine = nineChecks.find(([, v]) => v !== null && (!isWholeNumber(v) || v < N.min || v > N.max))

    if (total === null) {
      if (holesDeclared === 18 && (front9 !== null || back9 !== null)) {
        errors.push('Enter your total, or both nines. Played only nine holes? Choose "9 holes" above.')
      } else {
        errors.push('Enter your score.')
      }
    } else if (!isWholeNumber(total)) {
      errors.push('Scores must be whole numbers.')
    } else if (total < T.min || total > T.max) {
      errors.push(`Your score must be between ${T.min} and ${T.max}.`)
    } else if (badNine) {
      errors.push(holesDeclared === 9
        ? `A 9-hole score must be ${N.max} or less.`
        : `${badNine[0]} must be a whole number from ${N.min} to ${N.max}.`)
    } else if (front9 !== null && back9 !== null && front9 + back9 !== total) {
      errors.push(`Front 9 (${front9}) + Back 9 (${back9}) = ${front9 + back9}, but your total says ${total}. Fix one of them.`)
    } else if (holesDeclared === 18 && front9 !== null && back9 === null && front9 >= total) {
      errors.push('Your total must be more than your front 9.')
    } else if (holesDeclared === 18 && back9 !== null && front9 === null && back9 >= total) {
      errors.push('Your total must be more than your back 9.')
    }
  }

  // --- date ---
  const date = entry.date
  if (!date || !DATE_PATTERN.test(date)) {
    errors.push('Pick the date you played.')
  } else if (date > today) {
    errors.push("The date can't be in the future.")
  } else if (date < EARLIEST_DATE) {
    errors.push('Check the date — that year looks like a typo.')
  }

  // --- putts (optional) ---
  const putts = entry.putts
  if (putts !== null && putts !== undefined) {
    if (!isWholeNumber(putts) || putts < P.min || putts > P.max) {
      errors.push(`Putts must be a whole number from ${P.min} to ${P.max}.`)
    } else if (isWholeNumber(total) && putts >= total) {
      errors.push('Your putts must be fewer than your total strokes.')
    }
  }

  if (errors.length > 0) return { errors, warnings }

  // --- "Are you sure?" checks ---
  if (holesDeclared === 18) {
    const { low, high } = SOFT_LIMITS.eighteen
    if (total < low) {
      warnings.push(isHoleByHole || front9 !== null || back9 !== null
        ? `${total} for 18 holes is lower than we usually see.`
        : `${total} for 18 holes is lower than we usually see. Played only nine? Choose "9 holes" instead.`)
    } else if (total > high) {
      warnings.push(`${total} for 18 holes is higher than we usually see.`)
    }
  } else if (holesDeclared === 9) {
    const { low, high } = SOFT_LIMITS.nine
    if (total < low) warnings.push(`${total} for 9 holes is lower than we usually see.`)
    else if (total > high) warnings.push(`${total} for 9 holes is higher than we usually see.`)
  }

  if (isHoleByHole) {
    if (entry.filled !== 18 && entry.filled !== 9) {
      warnings.push(`You entered ${entry.filled} holes. Only complete 9- or 18-hole rounds count toward your handicap and Dogleg Score.`)
    } else if (entry.filled === 9 && !entry.cleanNine) {
      warnings.push("Your 9 holes aren't one front or back nine, so this round won't count toward your handicap.")
    }

    const big = []
    scores.forEach((s, i) => {
      if (s !== null && s > SOFT_LIMITS.holeHigh) big.push(i + 1)
    })
    if (big.length > 0) {
      warnings.push(`${listHoles(big)}: more than ${SOFT_LIMITS.holeHigh} strokes on a hole.`)
    }
  }

  return { errors, warnings }
}
