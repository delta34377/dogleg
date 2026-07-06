// Shared hole-by-hole scorecard grid (was duplicated across Feed, MyRounds,
// SingleRound, and UserProfile). Renders only the nines that were actually
// played — a 9-hole round shows one clean nine, not an empty grid.

function getScoreStyle(score, par) {
  if (!score || score === '') return { backgroundColor: 'white', color: '#999' }

  const diff = parseInt(score) - parseInt(par)
  if (diff <= -2) return { backgroundColor: '#0d7d0d', color: '#fff' }
  if (diff === -1) return { backgroundColor: '#4caf50', color: '#fff' }
  if (diff === 0) return { backgroundColor: 'white', color: '#333' }
  if (diff === 1) return { backgroundColor: '#ffcdd2', color: '#333' }
  if (diff === 2) return { backgroundColor: '#ef5350', color: '#fff' }
  return { backgroundColor: '#c62828', color: '#fff' }
}

function Nine({ label, totalLabel, holes, pars, offset, subtotal }) {
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

        <div className="contents">
          {pars.slice(offset, offset + 9).map((par, i) => (
            <div key={`par-${i}`} className="text-gray-500 bg-gray-50 py-1 rounded text-xs">
              P{par}
            </div>
          ))}
          <div className="text-gray-500 bg-gray-50 py-1 rounded text-xs font-bold">
            {pars.slice(offset, offset + 9).reduce((sum, p) => sum + parseInt(p), 0)}
          </div>
        </div>

        <div className="contents">
          {holes ? (
            <>
              {holes.slice(offset, offset + 9).map((score, i) => {
                const style = getScoreStyle(score, pars[offset + i])
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
  const pars = round.coursePars || round.course_pars || Array(18).fill(4)

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
