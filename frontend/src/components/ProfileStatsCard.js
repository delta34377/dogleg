import { useState, useEffect } from 'react'
import { ResponsiveContainer, LineChart, Line, Tooltip, ReferenceLine } from 'recharts'
import { statsService } from '../services/statsService'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import DoglegScoreChip from './DoglegScoreChip'
import DoglegScoreInfo from './DoglegScoreInfo'

const GREEN = '#16a34a'

// Roll per-round achievement stamps up into a trophy case: the best
// "broke X", the biggest round-count milestone, and running tallies.
// (first_round is skipped — everyone has it.)
function computeTrophies(rows) {
  let bestBroke = null
  let maxRoundNum = 0
  let pbCount = 0
  let maxBirdies = 0
  const prCourses = new Set()

  for (const row of rows) {
    for (const a of row.achievements || []) {
      if (typeof a?.type !== 'string') continue
      if (a.type.startsWith('broke_')) {
        const t = parseInt(a.type.slice(6), 10)
        if (t && (!bestBroke || t < bestBroke)) bestBroke = t
      } else if (a.type === 'rounds_milestone') {
        const n = parseInt(String(a.label || '').replace(/\D/g, ''), 10)
        if (n > maxRoundNum) maxRoundNum = n
      } else if (a.type === 'personal_best') {
        pbCount += 1
      } else if (a.type === 'course_pr' && row.course_id) {
        prCourses.add(row.course_id)
      } else if (a.type === 'most_birdies') {
        const m = /\((\d+)\)/.exec(a.label || '')
        if (m && Number(m[1]) > maxBirdies) maxBirdies = Number(m[1])
      }
    }
  }

  const out = []
  if (bestBroke) out.push({ key: 'broke', label: `💯 Broke ${bestBroke}` })
  if (maxBirdies > 0) out.push({ key: 'birdies', label: `🔥 ${maxBirdies} birdies in a round` })
  if (maxRoundNum >= 10) out.push({ key: 'rounds', label: `📅 ${maxRoundNum}+ rounds logged` })
  if (pbCount >= 2) out.push({ key: 'pbs', label: `🏆 ${pbCount} personal bests` })
  if (prCourses.size > 0) {
    out.push({
      key: 'prs',
      label: `⛳ PR${prCourses.size === 1 ? '' : 's'} at ${prCourses.size} ${prCourses.size === 1 ? 'course' : 'courses'}`,
    })
  }
  return out
}

function Tile({ label, value, sub }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg sm:text-xl font-semibold text-gray-900 mt-0.5 tabular-nums">{value}</div>
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
  const { user: viewer } = useAuth()
  const [stats, setStats] = useState(null)
  const [trophies, setTrophies] = useState([])

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

  // Trophy case: aggregate the achievement stamps across this user's rounds.
  // Visitors don't see milestones earned on private rounds; your own view does.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!userId) return
      let query = supabase
        .from('rounds')
        .select('achievements, course_id')
        .eq('user_id', userId)
        .not('achievements', 'is', null)
        .or('is_deleted.is.null,is_deleted.eq.false')
      if (viewer?.id !== userId) {
        query = query.or('is_private.is.null,is_private.eq.false')
      }
      const { data, error } = await query
      if (!cancelled && !error && data) setTrophies(computeTrophies(data))
    }
    load()
    return () => { cancelled = true }
  }, [userId, viewer?.id])

  if (!stats || !stats.rounds_count || stats.rounds_count === 0) return null

  const best = stats.best_round
  const vsParData = (stats.series || [])
    .filter(r => r.holes_played === 18 && r.total_score !== null)
    .slice(-20)
    .map(r => ({ date: r.date, vsPar: r.vs_par, total: r.total_score }))
  const homeCourse = (stats.top_courses || [])[0]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 sm:mb-4">
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

        {/* Trophy case — milestones live on the profile, not just on the
            round where they happened */}
        {trophies.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1.5">Milestones</div>
            <div className="flex flex-wrap gap-1.5">
              {trophies.map((t, i) => (
                <span
                  key={t.key}
                  className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 animate-badge-pop"
                  style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        )}

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
