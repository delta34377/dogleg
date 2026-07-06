// Dogleg Score chip — the 0.0–10.0 "how good was this round FOR YOU" metric.
// Spec: docs/stats_pivot_plan.md. Always a tier-colored pill, never a bare
// number, so it can't be misread as a gross score or a handicap. Tapping any
// chip opens the explainer modal.
import { useState } from 'react'
import { DoglegScoreModal } from './DoglegScoreInfo'

const TIERS = [
  { min: 9.0, label: 'Career Day', chip: 'bg-amber-400 text-amber-950', accent: 'text-amber-700' },
  { min: 8.0, label: 'Heater',     chip: 'bg-emerald-700 text-white',   accent: 'text-emerald-700' },
  { min: 6.5, label: null,         chip: 'bg-emerald-100 text-emerald-800', accent: 'text-emerald-700' },
  { min: 0.0, label: null,         chip: 'bg-gray-100 text-gray-600',   accent: 'text-gray-500' },
]

export function getDoglegTier(score) {
  return TIERS.find(t => Number(score) >= t.min) || TIERS[TIERS.length - 1]
}

export function formatStrokesVsUsual(strokesVsUsual) {
  if (strokesVsUsual === null || strokesVsUsual === undefined) return null
  const n = Number(strokesVsUsual)
  const abs = Math.abs(n).toFixed(1)
  if (n > 0) return `${abs} strokes better than your usual`
  if (n < 0) return `${abs} strokes off your usual`
  return 'right at your usual'
}

// Same sentence, third-person — for rounds that aren't the viewer's own
export function formatStrokesVsUsualTheirs(strokesVsUsual) {
  const mine = formatStrokesVsUsual(strokesVsUsual)
  return mine ? mine.replace('your usual', 'their usual') : null
}

function DoglegScoreChip({ score, strokesVsUsual, isOwn = true, size = 'md' }) {
  const [showInfo, setShowInfo] = useState(false)

  if (score === null || score === undefined) return null

  const tier = getDoglegTier(score)
  const value = Number(score).toFixed(1)
  const subtitle = isOwn
    ? formatStrokesVsUsual(strokesVsUsual)
    : formatStrokesVsUsualTheirs(strokesVsUsual)

  const sizeClasses = size === 'lg'
    ? 'text-base px-3 py-1'
    : 'text-xs px-2 py-0.5'

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShowInfo(true) }}
        className={`relative inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap before:absolute before:-inset-2 before:content-[''] ${sizeClasses} ${tier.chip}`}
        title={subtitle ? `Dogleg Score — ${subtitle}` : "What's a Dogleg Score? Tap to find out"}
      >
        <span aria-hidden="true">🐶</span>
        {/* The "/10" denominator is load-bearing: it stops the number reading
            as a handicap (golf's other one-decimal number) */}
        <span className="tabular-nums">
          {value}
          <span className="font-semibold opacity-60 text-[0.8em]">/10</span>
        </span>
        {/* Tier label wraps small chips onto two rows on phones — the tier
            color carries it there, and tapping opens the explainer */}
        {tier.label && (
          <span className={`font-semibold ${size === 'lg' ? '' : 'hidden sm:inline'}`}>
            · {tier.label}
          </span>
        )}
      </button>
      {showInfo && (
        <DoglegScoreModal onClose={() => setShowInfo(false)} contextLine={subtitle} />
      )}
    </>
  )
}

export default DoglegScoreChip
