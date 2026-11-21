// Shared hole-by-hole scorecard grid (was duplicated across Feed, MyRounds,
// SingleRound, and UserProfile). Renders only the nines that were actually
// played — a 9-hole round shows one clean nine, not an empty grid.
//
// Some rounds have no par data (course_pars is null — we no longer save a
// made-up all-4s card). Then the par row is left out and the score cells
// stay neutral instead of being colored against a guess.

// A par as a number, or null when it's missing or not a real par
function toPar(value) {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function getScoreStyle(score, par) {
  if (!score || score === '') return { backgroundColor: 'white', color: '#999' }
  if (par === null || par === undefined) return { backgroundColor: 'white', color: '#333' }

  const diff = parseInt(score) - par
  if (diff <= -2) return { backgroundColor: '#0d7d0d', color: '#fff' }
  if (diff === -1) return { backgroundColor: '#4caf50', color: '#fff' }
  if (diff === 0) return { backgroundColor: 'white', color: '#333' }
  if (diff === 1) return { backgroundColor: '#ffcdd2', color: '#333' }
  if (diff === 2) return { backgroundColor: '#ef5350', color: '#fff' }
  return { backgroundColor: '#c62828', color: '#fff' }
}

function Nine({ label, totalLabel, holes, pars, offset, subtotal }) {
  // This nine's pars; shown only when all nine are known
  const ninePars = pars ? pars.slice(offset, offset + 9).map(toPar) : []
  const hasPars = ninePars.length === 9 && ninePars.every(p => p !== null)

  return (
    <div className="mb-4">
      <div className="bg-gray-50 px-2 py-1 rounded mb-2">
        <div className="text-xs font-semibold text-gray-600">{label}</div>
      </div>
      <div className="grid grid-cols-10 gap-1 text-center text-xs tabular-nums">
        <div className="contents">
          {[...Array(9)].map((_, i) => (
            <div key={`hole-${i}`} className="text-gray-600 font-medium">
              {offset + i + 1}
            </div>
          ))}
          <div className="text-gray-600 font-bold">{totalLabel}</div>
        </div>

        {hasPars && (
          <div className="contents">
            {ninePars.map((par, i) => (
              <div key={`par-${i}`} className="text-gray-500 bg-gray-50 py-1 rounded text-xs">
                P{par}
              </div>
            ))}
            <div className="text-gray-500 bg-gray-50 py-1 rounded text-xs font-bold">
              {ninePars.reduce((sum, p) => sum + p, 0)}
            </div>
          </div>
        )}

        <div className="contents">
          {holes ? (
            <>
              {holes.slice(offset, offset + 9).map((score, i) => {
                const style = getScoreStyle(score, hasPars ? ninePars[i] : null)
                return (
                  <div key={`score-${i}`} className="py-2 rounded font-medium" style={style}>
                    {score || '-'}
                  </div>
                )
              })}
              <div className="py-2 bg-gray-900 text-white font-bold rounded">
                {subtotal || '--'}
              </div>
            </>
          ) : (
            <>
              {[...Array(9)].map((_, i) => (
                <div key={`empty-${i}`} className="py-2 bg-white border rounded text-gray-300">-</div>
              ))}
              <div className="py-2 bg-gray-900 text-white font-bold rounded">
                {subtotal || '--'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Scorecard({ round }) {
  const holes = round.holes || round.scores_by_hole || null
  const parList = round.coursePars || round.course_pars
  const pars = Array.isArray(parList) && parList.length > 0 ? parList : null

  const nineHasData = (offset, subtotal) => {
    if (holes && holes.slice(offset, offset + 9).some(h => h !== '' && h !== null && h !== undefined)) {
      return true
    }
    return !holes && !!subtotal
  }

  const showFront = nineHasData(0, round.front9)
  const showBack = nineHasData(9, round.back9)
  if (!showFront && !showBack) return null

  return (
    <div className="my-4">
      <div className="bg-gray-100 px-4 py-2 rounded-t-lg">
        <h3 className="text-sm font-bold text-gray-700">
          SCORECARD{showFront !== showBack ? ' · 9 HOLES' : ''}
        </h3>
      </div>

      <div className="bg-white border border-gray-200 rounded-b-lg p-4">
        {showFront && (
          <Nine label="FRONT 9" totalLabel="OUT" holes={holes} pars={pars}
            offset={0} subtotal={round.front9} />
        )}
        {showBack && (
          <Nine label="BACK 9" totalLabel="IN" holes={holes} pars={pars}
            offset={9} subtotal={round.back9} />
        )}
      </div>
    </div>
  )
}

export default Scorecard
