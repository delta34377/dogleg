import { useState } from 'react'

// Little ⓘ that explains the Dogleg Score. Drop it next to any Dogleg Score
// label; it opens a small modal (works on touch, unlike title tooltips).
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">🐶 The Dogleg Score</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="text-sm text-gray-600 space-y-3">
              <p>
                Every round gets a score out of 10 measuring how well you played{' '}
                <span className="font-semibold text-gray-800">compared to your own game</span> —
                not anyone else's. A 25-handicapper and a scratch golfer can both
                post a 9.5.
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-amber-400 text-amber-950">🐶 9.0+</span>
                  <span>Career Day — one you'll talk about for years</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-emerald-700 text-white">🐶 8.0+</span>
                  <span>Heater — well beyond your usual</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800">🐶 6.5+</span>
                  <span>Better than your typical round</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full font-bold text-xs px-2 py-0.5 bg-gray-100 text-gray-600">🐶 ~6.0</span>
                  <span>Your usual day at the course</span>
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
      )}
    </>
  )
}

export default DoglegScoreInfo
