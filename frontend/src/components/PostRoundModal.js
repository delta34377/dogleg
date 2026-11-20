import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModalShell from './ModalShell'
import ShareModal from './ShareModal'
import DoglegScoreChip, { formatStrokesVsUsual } from './DoglegScoreChip'
import AchievementBadges from './AchievementBadges'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'
import { getDisplayName } from '../utils/courseNameUtils'
import { calculateVsPar, getScoreColor } from '../utils/roundHelpers'
import { formatHandicap } from '../utils/handicap'

// The "you just posted a round" screen (replaces the old alert()).
//
// The database works everything out while saving (database/stats_layer.sql):
// the Dogleg Score, strokes vs your usual, achievements, and whether the
// round counts toward the handicap. This shows that off, with Share, View
// round and Done buttons.

const HEADING_ID = 'post-round-title'
const ROUNDS_FOR_AN_INDEX = 3 // the World Handicap System minimum

// The saved rounds row -> the round shape ShareModal and RoundCard use
// (the same mapping MyRounds does)
export function normalizeSavedRound(row) {
  return {
    ...row,
    date: row.played_at,
    total: row.total_score,
    holes: row.scores_by_hole || [],
    coursePars: row.course_pars,
    tee: row.tee_data,
    comment: row.caption,
    photo: row.photo_url,
  }
}

const isSet = (value) => value !== null && value !== undefined

// A hole-by-hole nine is only rated when it's exactly holes 1-9 or 10-18
function isCleanNine(round) {
  const scores = Array.isArray(round.scores_by_hole) ? round.scores_by_hole : null
  if (!scores || !scores.some(isSet)) return true // entered as a nine total
  const front = scores.slice(0, 9).filter(isSet).length
  const back = scores.slice(9, 18).filter(isSet).length
  return (front === 9 && back === 0) || (front === 0 && back === 9)
}

// What this round means for the golfer's handicap, and — when it has no
// Dogleg Score — why, and when one unlocks. Mirrors the rules in
// database/stats_layer.sql. Exported for the unit test.
export function describeRound(round, { hasHandicap = false } = {}) {
  const holes = Number.isInteger(round?.holes_played) ? round.holes_played : null
  const total = Number(round?.total_score)
  const rated = isSet(round?.differential)
  const addHandicapTip = hasHandicap ? '' : ' Add your handicap on your profile to get one right away.'

  let handicap
  if (rated) {
    handicap = holes === 9
      ? { tone: 'good', text: 'Counts toward your handicap (as a nine, paired with an expected score for the other nine).' }
      : { tone: 'good', text: 'Counts toward your handicap.' }
  } else if (holes === 9 && !hasHandicap && total >= 25 && total <= 90 && isCleanNine(round)) {
    // Nines wait for a handicap to pair with (WHS 2024); two nines can pair up
    handicap = { tone: 'pending', text: "Pending: nines join your handicap once you have one. Post another nine and we'll pair them up." }
  } else if (holes === 9) {
    handicap = { tone: 'none', text: "This nine couldn't be rated, so it won't count toward your handicap." }
  } else if (holes === 18) {
    handicap = { tone: 'none', text: "Not rated: 18-hole scores outside 45–160 don't count toward your handicap." }
  } else if (holes) {
    handicap = { tone: 'none', text: `Only complete 9- or 18-hole rounds count toward your handicap (this one has ${holes} holes).` }
  } else {
    handicap = { tone: 'none', text: "We couldn't tell how many holes this was, so it won't count toward your handicap." }
  }

  let scoreNote = null
  if (!isSet(round?.dogleg_score)) {
    if (rated) {
      // Rated, but no baseline yet: this was the first round that counts
      scoreNote = 'Your first rated round sets your baseline. Dogleg Scores — how a round compares with your usual — start with your next one.' + addHandicapTip
    } else if (handicap.tone === 'pending') {
      scoreNote = 'Your Dogleg Score unlocks once this nine counts toward your handicap.' + addHandicapTip
    } else {
      scoreNote = 'Dogleg Scores come with rounds that count toward your handicap.'
    }
  }

  return { handicap, scoreNote }
}

const TONE_CLASSES = {
  good: 'bg-green-50 text-green-800 border-green-200',
  pending: 'bg-amber-50 text-amber-900 border-amber-200',
  none: 'bg-gray-50 text-gray-600 border-gray-200',
}
const TONE_ICONS = { good: '✓', pending: '⏳', none: 'ℹ️' }

function StrokesVsUsual({ value }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const sign = n > 0 ? '+' : n < 0 ? '−' : '±'
  const color = n > 0 ? 'text-green-700' : n < 0 ? 'text-orange-600' : 'text-gray-800'
  return (
    <p className="text-sm text-gray-700">
      <span className={`font-bold tabular-nums ${color}`}>{sign}{Math.abs(n).toFixed(1)}</span>{' '}
      strokes vs your usual
      {/* "+" alone could read as "over", golf's usual meaning — so spell it out */}
      <span className="block text-xs text-gray-500">{formatStrokesVsUsual(n)}</span>
    </p>
  )
}

function PostRoundModal({ round: savedRound, onClose }) {
  const navigate = useNavigate()
  const { user, profile, loadProfile } = useAuth()
  const [round, setRound] = useState(savedRound)
  const [refreshing, setRefreshing] = useState(!isSet(savedRound?.dogleg_score))
  const [ratedRounds, setRatedRounds] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const headingRef = useRef(null)
  const panelRef = useRef(null)

  // Once, when the modal opens: catch up with what the database did after
  // the save — a new handicap index, and (for nines) scores that posting
  // this round may have unlocked.
  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const tasks = []

      if (user?.id) {
        tasks.push(Promise.resolve(loadProfile(user.id)).catch(() => {}))

        tasks.push((async () => {
          try {
            const { count } = await supabase
              .from('rounds')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .not('differential', 'is', null)
              .or('is_deleted.is.null,is_deleted.eq.false')
            if (!cancelled && Number.isInteger(count)) setRatedRounds(count)
          } catch {
            // Only used for the "N more rounds" hint
          }
        })())
      }

      if (savedRound?.id && !isSet(savedRound.dogleg_score)) {
        tasks.push((async () => {
          try {
            const { data } = await supabase
              .from('rounds')
              .select('differential, dogleg_score, strokes_vs_usual, short_code')
              .eq('id', savedRound.id)
              .maybeSingle()
            if (!cancelled && data) {
              setRound(prev => ({
                ...prev,
                differential: data.differential,
                dogleg_score: data.dogleg_score,
                strokes_vs_usual: data.strokes_vs_usual,
                short_code: prev.short_code || data.short_code,
              }))
            }
          } catch {
            // Keep what the save returned
          }
        })())
      }

      await Promise.all(tasks)
      if (!cancelled) setRefreshing(false)
    }

    refresh()
    return () => { cancelled = true }
    // Run once per opened modal: loadProfile changes on every AuthContext
    // render and would otherwise loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRound?.id, user?.id])

  // Accessibility: name the dialog, move focus into it, and give focus back
  // when it closes
  useEffect(() => {
    if (showShare) return undefined
    const previouslyFocused = document.activeElement
    const heading = headingRef.current
    heading?.closest('[role="dialog"]')?.setAttribute('aria-labelledby', HEADING_ID)
    heading?.focus()
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.()
    }
  }, [showShare])

  // Keep Tab / Shift+Tab inside the dialog
  const trapFocus = (event) => {
    if (event.key !== 'Tab' || !panelRef.current) return
    // Keys from a dialog opened on top (it's portaled elsewhere) are its own
    if (!panelRef.current.contains(event.target)) return
    const focusable = panelRef.current.querySelectorAll('button:not([disabled]), a[href]')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Escape / backdrop. Ignored while the Dogleg Score explainer is open on
  // top: Escape there should close only the explainer.
  const handleDismiss = () => {
    if (document.querySelectorAll('[role="dialog"]').length > 1) return
    onClose()
  }

  if (!round) return null

  const shareRound = normalizeSavedRound(round)

  if (showShare) {
    // Shown instead of (not on top of) the payoff, so Escape closes just this
    return (
      <ShareModal
        round={shareRound}
        username={profile?.username || 'golfer'}
        onClose={() => setShowShare(false)}
      />
    )
  }

  const hasHandicap = isSet(profile?.handicap_index) || isSet(profile?.handicap)
  const { handicap, scoreNote } = describeRound(round, { hasHandicap })
  // Vs par only when the par is trustworthy (a nine without a par card
  // would be compared with half of the course par, which can be wrong)
  const vsPar = round.holes_played === 18 || Array.isArray(round.course_pars)
    ? calculateVsPar(shareRound)
    : null
  const courseLabel = getDisplayName(round)
  const roundPath = `/rounds/${encodeURIComponent(round.short_code || round.id)}`

  let indexLine = null
  if (isSet(profile?.handicap_index)) {
    indexLine = `Your handicap index: ${formatHandicap(profile.handicap_index)}`
  } else if (ratedRounds !== null && ratedRounds < ROUNDS_FOR_AN_INDEX) {
    const more = ROUNDS_FOR_AN_INDEX - ratedRounds
    indexLine = `${more} more rated ${more === 1 ? 'round' : 'rounds'} until your handicap index.`
  }

  return (
    <ModalShell onClose={handleDismiss} maxWidth="max-w-md">
      <div ref={panelRef} onKeyDown={trapFocus} className="p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Round posted</p>
        <h2
          id={HEADING_ID}
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-2xl font-bold text-gray-900 focus:outline-none"
        >
          You shot {round.total_score}
          {vsPar && <span className={`ml-2 text-xl ${getScoreColor(vsPar)}`}>({vsPar})</span>}
        </h2>
        <p className="text-sm text-gray-600 mt-0.5">
          {courseLabel}
          {round.holes_played === 9 && ' · 9 holes'}
        </p>

        {/* The Dogleg Score — the payoff */}
        <div className="mt-5 min-h-[4.5rem] flex flex-col items-center justify-center gap-3">
          {isSet(round.dogleg_score) ? (
            <>
              {/* Scaled up: this is the big moment (tap it for the explainer) */}
              <div className="scale-125 my-1">
                <DoglegScoreChip score={round.dogleg_score} strokesVsUsual={round.strokes_vs_usual} size="lg" />
              </div>
              <StrokesVsUsual value={round.strokes_vs_usual} />
            </>
          ) : refreshing ? (
            <p className="text-sm text-gray-500 animate-pulse">Working out your Dogleg Score…</p>
          ) : (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
              <span aria-hidden="true">🐶 </span>{scoreNote}
            </p>
          )}
        </div>

        {/* Badges stamped on this round (PRs, milestones) */}
        {Array.isArray(round.achievements) && round.achievements.length > 0 && (
          <div className="mt-4 flex justify-center">
            <AchievementBadges achievements={round.achievements} />
          </div>
        )}

        {/* Handicap */}
        {!refreshing && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm text-left ${TONE_CLASSES[handicap.tone]}`}>
            <span aria-hidden="true" className="mr-1">{TONE_ICONS[handicap.tone]}</span>
            {handicap.text}
            {indexLine && <span className="block mt-1 font-semibold">{indexLine}</span>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => setShowShare(true)}
            className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            Share
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(roundPath)}
              className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-800 font-semibold hover:bg-gray-50"
            >
              View round
            </button>
            <button
              type="button"
              onClick={() => navigate('/my-rounds')}
              className="flex-1 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 text-white font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

export default PostRoundModal
