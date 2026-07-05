import { useState } from 'react'

// The Dogleg Score explainer modal. Opened by tapping any Dogleg Score chip
// anywhere on the site, or the little "?" on stats surfaces.
export function DoglegScoreModal({ onClose, contextLine }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-900">🐶 The Dogleg Score</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {contextLine && (
          <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-3">
            This round: {contextLine}
          </p>
        )}

        <div className="text-sm text-gray-600 space-y-3">
          <p>
            Every round gets a score out of 10 measuring how well you played{' '}
            <span className="font-semibold text-gray-800">compared to your own game</span> —
            not anyone else's. A 25-handicapper and a scratch golfer can both
            post a 9.5.
          </p>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-amber-400 text-amber-950 whitespace-nowrap">🐶 9.0+</span>
              <span className="whitespace-nowrap">Career Day — brag for years</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-emerald-700 text-white whitespace-nowrap">🐶 8.0+</span>
              <span className="whitespace-nowrap">Heater — way past your usual</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 whitespace-nowrap">🐶 6.5+</span>
              <span className="whitespace-nowrap">Better than your typical day</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-gray-100 text-gray-600 whitespace-nowrap">🐶 ~6.0</span>
              <span className="whitespace-nowrap">Right at your usual</span>
            </div>
          </div>

          <p>
            It's computed from your score, the course's difficulty (slope and
            rating), and your recent rounds. New here? Your first round sets
            the baseline — scores start with round two, or right away if your
            profile has a handicap.
          </p>
        </div>
      </div>
    </div>
  )
}

// Little "?" trigger for stats surfaces (chips themselves are also tappable)
function DoglegScoreInfo() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold hover:bg-gray-300 align-middle"
        title="What's a Dogleg Score?"
        aria-label="What's a Dogleg Score?"
      >
        ?
      </button>
      {open && <DoglegScoreModal onClose={() => setOpen(false)} />}
    </>
  )
}

export default DoglegScoreInfo
