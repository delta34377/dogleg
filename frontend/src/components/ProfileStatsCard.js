import { useState, useEffect } from 'react'
import { ResponsiveContainer, LineChart, Line, Tooltip, ReferenceLine } from 'recharts'
import { statsService } from '../services/statsService'
import DoglegScoreChip from './DoglegScoreChip'
import DoglegScoreInfo from './DoglegScoreInfo'

const GREEN = '#16a34a'

function Tile({ label, value, sub }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg sm:text-xl font-semibold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

function SparkTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded shadow-md px-2 py-1 text-xs">
      <span className="text-gray-500">{p.date}</span>{' '}
      <span className="font-semibold text-gray-900">
        {p.total} ({p.vsPar > 0 ? `+${p.vsPar}` : p.vsPar === 0 ? 'E' : p.vsPar})
      </span>
    </div>
  )
}

// Compact stats digest for profile pages — the profile equivalent of the
// Stats tab. Renders nothing until the user has rounds with stats.
function ProfileStatsCard({ userId }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!userId) return
      const { data, error } = await statsService.getUserStats(userId)
      if (!cancelled && !error) setStats(data)
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  if (!stats || !stats.rounds_count || stats.rounds_count === 0) return null

  const best = stats.best_round
  const vsParData = (stats.series || [])
    .filter(r => r.holes_played === 18 && r.total_score !== null)
    .slice(-20)
    .map(r => ({ date: r.date, vsPar: r.vs_par, total: r.total_score }))
  const homeCourse = (stats.top_courses || [])[0]

  return (
    <div className="bg-white rounded-lg shadow-sm mb-3 sm:mb-4">
      <div className="p-3 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">📈 Stats <DoglegScoreInfo /></h3>
          {stats.latest_dogleg_score !== null && stats.latest_dogleg_score !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Last round</span>
              <DoglegScoreChip score={stats.latest_dogleg_score} isOwn={false} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Tile label="Scoring average" value={stats.avg_score ?? '—'}
            sub={stats.avg_last10 ? `${stats.avg_last10} last 10` : null} />
          <Tile label="Best round" value={best ? best.total_score : '—'}
            sub={best ? (best.course_name || best.club_name) : null} />
          <Tile label="Avg vs par"
            value={stats.avg_vs_par !== null && stats.avg_vs_par !== undefined
              ? (stats.avg_vs_par > 0 ? `+${stats.avg_vs_par}` : `${stats.avg_vs_par}`)
              : '—'} />
          <Tile label="Best Dogleg Score"
            value={stats.best_dogleg_score !== null && stats.best_dogleg_score !== undefined
              ? `${Number(stats.best_dogleg_score).toFixed(1)}/10` : '—'} />
        </div>

        {vsParData.length >= 3 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">
              Score vs par — last {vsParData.length} full rounds
            </div>
            <div className="h-14">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vsParData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
                  <Tooltip content={<SparkTooltip />} />
                  <Line type="monotone" dataKey="vsPar" stroke={GREEN} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {homeCourse && homeCourse.rounds > 1 && (
          <div className="mt-3 text-xs text-gray-500">
            Most played: <span className="font-medium text-gray-700">
              {homeCourse.course_name || homeCourse.club_name}</span> · {homeCourse.rounds} rounds
            {homeCourse.best_score ? ` · best ${homeCourse.best_score}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfileStatsCard
