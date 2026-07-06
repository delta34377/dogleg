// The "Front 9 / Back 9" line under a round's total. Shows only what was
// played: both nines, one nine, or — for total-only entries — nothing at
// all instead of a row of dashes. (The stat strip carries the "9 holes"
// tag, so a single nine isn't re-labeled here.)

function ScoreBreakdown({ front9, back9 }) {
  if (!front9 && !back9) return null

  if (front9 && back9) {
    return (
      <div className="text-sm text-gray-600 mt-2 tabular-nums">
        Front 9: <span className="font-semibold">{front9}</span>
        <span className="mx-2">•</span>
        Back 9: <span className="font-semibold">{back9}</span>
      </div>
    )
  }

  return (
    <div className="text-sm text-gray-600 mt-2 tabular-nums">
      {front9 ? 'Front 9' : 'Back 9'}: <span className="font-semibold">{front9 || back9}</span>
    </div>
  )
}

export default ScoreBreakdown
