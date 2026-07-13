import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart,
  Line, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { statsService, rollingHandicapSeries } from '../services/statsService'
import DoglegScoreChip, { formatStrokesVsUsual } from './DoglegScoreChip'
import DoglegScoreInfo from './DoglegScoreInfo'
import getDisplayName from '../utils/courseNameUtils'

// Chart palette (validated): brand green for the primary series,
// sky for the handicap index line on the two-series chart.
const GREEN = '#16a34a'
const SKY = '#0284c7'
const GRID = '#f3f4f6'
const AXIS = '#e5e7eb'
const TICK = { fontSize: 12, fill: '#6b7280' }

const formatMonthLabel = (m) => {
  if (!m) return ''
  const [y, mo] = String(m).split('-')
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const formatChartDate = (d) => {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatFullDate = (d) => {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ChartTooltip({ active, payload, label, rows, title }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <div className="text-gray-500 text-xs mb-1">
        {title ? title(payload[0].payload) : formatChartDate(label)}
      </div>
      {rows(payload[0].payload).map(({ name, value }) => (
        <div key={name} className="flex justify-between gap-4">
          <span className="text-gray-600">{name}</span>
          <span className="font-semibold text-gray-900">{value}</span>
        </div>
      ))}
    </div>
  )
}

function StatTile({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

// Slim neutral page header — the content is the hero, not a banner
function PageHeader() {
  return (
    <div className="px-1 pb-3">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📈 My Stats</h1>
      <p className="text-sm text-gray-500 mt-0.5">Your game, by the numbers</p>
    </div>
  )
}

// Survives component remounts (tab refocus auth events, view switches):
// render the cached stats instantly and refresh silently in the background.
let statsCache = { userId: null, data: null }

function StatsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const cached = statsCache.userId && statsCache.userId === user?.id ? statsCache.data : null
  const [stats, setStats] = useState(cached)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user) return
      // Only show the skeleton when there's nothing to render yet —
      // refreshes behind cached data are invisible
      if (!statsCache.data || statsCache.userId !== user.id) setLoading(true)
      const { data, error } = await statsService.getUserStats(user.id)
      if (cancelled) return
      if (error) {
        setError(error)
      } else {
        statsCache = { userId: user.id, data }
        setStats(data)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // Key on the id, not the object: supabase emits auth events on every tab
    // refocus with a fresh user object, and we shouldn't reload stats for that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const series = useMemo(() => stats?.series || [], [stats])

  // Score-vs-par trend (18-hole rounds)
  const vsParData = useMemo(() =>
    series
      .filter(r => r.holes_played === 18 && r.total_score !== null)
      .map(r => ({ date: r.date, vsPar: r.vs_par, total: r.total_score })),
    [series])

  // Differential dots + rolling handicap index line
  const handicapData = useMemo(() => {
    const rolling = rollingHandicapSeries(series)
    const indexByDate = new Map()
    rolling.forEach(p => indexByDate.set(p.date + '|' + p.index, p))
    // walk the series again so each differential point can carry the index as of then
    let i = 0
    return series
      .filter(r => r.differential !== null && r.differential !== undefined)
      .map(r => {
        const point = { date: r.date, differential: Number(r.differential) }
        if (i < rolling.length && rolling[i].date === r.date) {
          point.index = rolling[i].index
          i += 1
        } else if (i > 0) {
          point.index = rolling[i - 1].index
        }
        return point
      })
  }, [series])

  // Rounds per month, gaps filled so the last 12 months always show
  const monthsData = useMemo(() => {
    const byMonth = new Map((stats?.rounds_per_month || []).map(m => [m.month, m.rounds]))
    const out = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      out.push({
        month: key,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        rounds: byMonth.get(key) || 0
      })
    }
    return out
  }, [stats])

  // Putting trend: putts per 18 holes (9-hole rounds normalized x2)
  const puttsData = useMemo(() =>
    series
      .filter(r => r.total_putts && (r.holes_played === 18 || r.holes_played === 9))
      .map(r => ({
        date: r.date,
        putts: Math.round((r.total_putts * 18 / r.holes_played) * 10) / 10,
        rawPutts: r.total_putts,
        holes: r.holes_played
      })),
    [series])

  const latestWithScore = useMemo(() => {
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].dogleg_score !== null && series[i].dogleg_score !== undefined) return series[i]
    }
    return null
  }, [series])

  // Plain-English trend: current index vs the index ~2 months ago (or the
  // first one we have). Numbers tell, sentences sell.
  const indexTrend = useMemo(() => {
    const rolling = rollingHandicapSeries(series)
    if (rolling.length < 3) return null
    const current = rolling[rolling.length - 1]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    let past = null
    for (const p of rolling) {
      if (new Date(p.date + 'T00:00:00') <= cutoff) past = p
      else break
    }
    if (!past) past = rolling[0]
    if (past.date === current.date) return null
    const delta = current.index - past.index
    if (Math.abs(delta) < 0.5) return null
    const pastDate = new Date(past.date + 'T00:00:00')
    const since = pastDate.toLocaleDateString('en-US',
      pastDate.getFullYear() === new Date().getFullYear()
        ? { month: 'long' }
        : { month: 'long', year: 'numeric' })
    return delta < 0
      ? { text: `📉 Down ${Math.abs(delta).toFixed(1)} since ${since}`, improving: true }
      : { text: `Up ${delta.toFixed(1)} since ${since}`, improving: false }
  }, [series])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <PageHeader />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="h-3 bg-gray-200 rounded w-16 mb-3"></div>
              <div className="h-7 bg-gray-200 rounded w-12"></div>
            </div>
          ))}
        </div>
        <div className="mt-4 h-64 bg-white border border-gray-200 rounded-xl animate-pulse"></div>
      </div>
    )
  }

  // The stats RPC doesn't exist until database/stats_layer.sql has been run
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <PageHeader />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-3">🔧</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Stats aren't available yet</h2>
          <p className="text-gray-500 text-sm">
            The stats engine hasn't been enabled on the database. (Admin: run
            <code className="mx-1 px-1 bg-gray-100 rounded">database/stats_layer.sql</code>
            in the Supabase SQL editor.)
          </p>
        </div>
      </div>
    )
  }

  const roundsCount = stats?.rounds_count || 0

  if (roundsCount === 0) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <PageHeader />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-6xl mb-4">🏌️</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds yet</h2>
          <p className="text-gray-500 mb-6">
            Post your first round and your stats — including an auto-calculated
            handicap index — start building from day one.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Add Your First Round
          </button>
        </div>
      </div>
    )
  }

  const handicapIndex = stats?.handicap_index
  const handicapRounds = stats?.handicap_rounds || 0
  const best = stats?.best_round
  const holeStats = stats?.hole_stats
  const holesRecorded = holeStats?.holes_recorded || 0

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <PageHeader />
      <div className="space-y-3 sm:space-y-4">

          {/* Hero: handicap index */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">Handicap index</div>
                {handicapIndex !== null && handicapIndex !== undefined ? (
                  <>
                    <div className="text-5xl font-semibold text-gray-900 mt-1 tabular-nums">
                      {Number(handicapIndex).toFixed(1)}
                    </div>
                    {indexTrend && (
                      <div className={`text-sm font-medium mt-1.5 ${
                        indexTrend.improving ? 'text-green-700' : 'text-gray-600'
                      }`}>
                        {indexTrend.text}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      Auto-calculated from your best 8 of the last {Math.min(handicapRounds, 20)} rounds
                      (World Handicap System method)
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-5xl font-semibold text-gray-300 mt-1">—</div>
                    <div className="text-xs text-gray-500 mt-2">
                      {handicapRounds} of 3 counting rounds so far. Every posted round
                      counts — full rounds, nines, or just a total. Picking tees makes
                      the math exact.
                    </div>
                  </>
                )}
              </div>
              {latestWithScore && (
                <div className="flex flex-col items-start sm:items-end gap-1 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <span>Latest Dogleg Score</span>
                    <DoglegScoreInfo />
                  </div>
                  <DoglegScoreChip
                    score={latestWithScore.dogleg_score}
                    strokesVsUsual={latestWithScore.strokes_vs_usual}
                    size="lg"
                  />
                  {formatStrokesVsUsual(latestWithScore.strokes_vs_usual) && (
                    <div className="text-xs text-gray-500">
                      {formatStrokesVsUsual(latestWithScore.strokes_vs_usual)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Rounds" value={roundsCount}
              sub={stats?.rounds_9 > 0 ? `${stats.rounds_18} full · ${stats.rounds_9} nine-hole` : null} />
            <StatTile label="Scoring average" value={stats?.avg_score ?? '—'}
              sub={stats?.avg_last10 ? `${stats.avg_last10} over last 10` : null} />
            <StatTile label="Average vs par"
              value={stats?.avg_vs_par !== null && stats?.avg_vs_par !== undefined
                ? (stats.avg_vs_par > 0 ? `+${stats.avg_vs_par}` : `${stats.avg_vs_par}`)
                : '—'} />
            <StatTile label="Best round"
              value={best ? best.total_score : '—'}
              sub={best ? [
                (best.course_name || best.club_name) ? getDisplayName(best) : null,
                formatFullDate(String(best.played_at).slice(0, 10))
              ].filter(Boolean).join(' · ') : null} />
          </div>

          {/* Score trend */}
          {vsParData.length >= 2 && (
            <SectionCard title="Score vs par" subtitle="18-hole rounds, oldest to newest">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={vsParData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatChartDate} tick={TICK}
                      axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={40} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} width={46} />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                    <Tooltip content={<ChartTooltip rows={(p) => [
                      { name: 'Score', value: p.total },
                      { name: 'Vs par', value: p.vsPar > 0 ? `+${p.vsPar}` : p.vsPar === 0 ? 'E' : p.vsPar }
                    ]} />} />
                    <Line type="monotone" dataKey="vsPar" stroke={GREEN} strokeWidth={2}
                      dot={{ r: 4, fill: GREEN, stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {/* Handicap trend: differentials + rolling index */}
          {handicapData.length >= 3 && (
            <SectionCard title="Handicap trend"
              subtitle="Each dot is a round's differential; the line is your index as it evolved">
              <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GREEN }}></span>
                  Round differential
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-0.5 rounded" style={{ backgroundColor: SKY }}></span>
                  Handicap index
                </span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={handicapData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatChartDate} tick={TICK}
                      axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={40} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} width={46} />
                    <Tooltip content={<ChartTooltip rows={(p) => [
                      { name: 'Differential', value: p.differential?.toFixed(1) },
                      ...(p.index !== undefined ? [{ name: 'Index', value: p.index.toFixed(1) }] : [])
                    ]} />} />
                    <Scatter dataKey="differential" fill={GREEN} stroke="#ffffff" strokeWidth={2} />
                    <Line type="monotone" dataKey="index" stroke={SKY} strokeWidth={2}
                      dot={false} activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {/* Rounds per month */}
          <SectionCard title="Rounds per month" subtitle="Last 12 months">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthsData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: AXIS }} tickLine={false} interval={0} />
                  <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip
                    title={(p) => formatMonthLabel(p.month)}
                    rows={(p) => [
                    { name: 'Rounds', value: p.rounds }
                  ]} />} />
                  <Bar dataKey="rounds" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Hole-by-hole insights */}
          {holesRecorded > 0 ? (
            <SectionCard title="Hole-by-hole breakdown"
              subtitle={`From ${holesRecorded} holes entered hole-by-hole`}>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatTile label="Par 3 average" value={holeStats.par3_avg ?? '—'} />
                <StatTile label="Par 4 average" value={holeStats.par4_avg ?? '—'} />
                <StatTile label="Par 5 average" value={holeStats.par5_avg ?? '—'} />
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Eagles or better', value: holeStats.eagles_or_better },
                  { label: 'Birdies', value: holeStats.birdies },
                  { label: 'Pars', value: holeStats.pars },
                  { label: 'Bogeys', value: holeStats.bogeys },
                  { label: 'Double bogey +', value: holeStats.doubles_or_worse },
                ].map(row => {
                  const max = Math.max(holeStats.eagles_or_better, holeStats.birdies,
                    holeStats.pars, holeStats.bogeys, holeStats.doubles_or_worse, 1)
                  return (
                    <div key={row.label} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 text-gray-600">{row.label}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded">
                        <div className="h-4 rounded" style={{
                          backgroundColor: GREEN,
                          width: `${(row.value / max) * 100}%`,
                          minWidth: row.value > 0 ? '4px' : 0
                        }}></div>
                      </div>
                      <span className="w-8 text-right font-semibold text-gray-900">{row.value}</span>
                    </div>
                  )
                })}
              </div>
              {(holeStats.front9_avg_per_hole || holeStats.back9_avg_per_hole) && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile label="Front 9 (per hole)" value={holeStats.front9_avg_per_hole ?? '—'} />
                  <StatTile label="Back 9 (per hole)" value={holeStats.back9_avg_per_hole ?? '—'} />
                </div>
              )}

            </SectionCard>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 text-center">
              Enter a round hole-by-hole to unlock par 3/4/5 averages, birdie counts,
              and the most accurate handicap.
            </div>
          )}

          {/* Putting */}
          {(stats?.putts_rounds > 0 || holeStats?.holes_with_putts > 0) && (
            <SectionCard title="Putting">
              <div className="grid grid-cols-2 gap-3">
                {stats?.putts_per_round && (
                  <StatTile label="Putts per round" value={stats.putts_per_round}
                    sub={`${stats.putts_rounds} ${stats.putts_rounds === 1 ? 'round' : 'rounds'} tracked`} />
                )}
                {holeStats?.putts_avg && (
                  <StatTile label="Putts per hole" value={holeStats.putts_avg}
                    sub={`${holeStats.holes_with_putts} holes tracked`} />
                )}
              </div>
              {puttsData.length >= 2 && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-1">
                    Putts per 18 holes over time
                    {puttsData.some(p => p.holes === 9) ? ' (9-hole rounds normalized)' : ''}
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={puttsData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} tick={TICK}
                          axisLine={{ stroke: AXIS }} tickLine={false} minTickGap={40} />
                        <YAxis tick={TICK} axisLine={false} tickLine={false} width={34}
                          domain={['dataMin - 2', 'dataMax + 2']} allowDecimals={false} />
                        <ReferenceLine y={36} stroke="#9ca3af" strokeWidth={1}
                          label={{ value: '2-putt pace', position: 'insideTopRight',
                                   fontSize: 11, fill: '#9ca3af' }} />
                        <Tooltip content={<ChartTooltip rows={(p) => [
                          p.holes === 9
                            ? { name: 'Putts', value: `${p.rawPutts} over 9 (≈${p.putts}/18)` }
                            : { name: 'Putts', value: p.rawPutts }
                        ]} />} />
                        <Line type="monotone" dataKey="putts" stroke={GREEN} strokeWidth={2}
                          dot={{ r: 4, fill: GREEN, stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Most played courses */}
          {(stats?.top_courses || []).length > 0 && (
            <SectionCard title="Most played courses">
              <div className="divide-y divide-gray-100">
                {stats.top_courses.map(c => (
                  <button
                    key={c.course_id || c.course_name}
                    onClick={() => c.course_id && navigate(`/courses/${c.course_id}`)}
                    className="w-full flex items-center justify-between py-2.5 text-left hover:bg-gray-50 rounded px-2 -mx-2"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{getDisplayName(c)}</div>
                      <div className="text-xs text-gray-500">{c.rounds} {c.rounds === 1 ? 'round' : 'rounds'}</div>
                    </div>
                    <div className="text-right">
                      {c.best_score && (
                        <>
                          <div className="font-semibold text-gray-900">{c.best_score}</div>
                          <div className="text-xs text-gray-500">best</div>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

      </div>
    </div>
  )
}

export default StatsPage
