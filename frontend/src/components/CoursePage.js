import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { statsService } from '../services/statsService'
import DoglegScoreChip from './DoglegScoreChip'
import { getInitials } from '../utils/avatarUtils'

const formatDate = (d) => {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

function PlayerRow({ entry, rank, isMe, navigate }) {
  return (
    <div className={`flex items-center gap-3 py-2.5 px-2 rounded ${isMe ? 'bg-green-50' : ''}`}>
      {rank !== undefined && (
        <span className={`w-6 text-center font-bold ${rank <= 3 ? 'text-amber-600' : 'text-gray-400'}`}>
          {rank}
        </span>
      )}
      <button
        onClick={() => entry.username && navigate(`/profile/${entry.username}`)}
        className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 text-left"
      >
        <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center shrink-0">
          {entry.avatar_url ? (
            <img src={entry.avatar_url} alt={entry.username} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-green-700 font-semibold text-xs">
              {getInitials(entry) || entry.username?.[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {entry.username || 'Golfer'}{isMe ? ' (you)' : ''}
          </div>
          <div className="text-xs text-gray-500">{formatDate(entry.date)}</div>
        </div>
      </button>
      {entry.dogleg_score !== null && entry.dogleg_score !== undefined && (
        <DoglegScoreChip score={entry.dogleg_score} isOwn={false} />
      )}
      <button
        onClick={() => entry.short_code && navigate(`/rounds/${entry.short_code}`)}
        className="text-lg font-bold text-gray-900 hover:text-green-700 w-10 text-right"
      >
        {entry.total_score}
      </button>
    </div>
  )
}

function CoursePage() {
  const { courseId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [page, setPage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data, error } = await statsService.getCoursePage(courseId)
      if (cancelled) return
      if (error) setError(error)
      else setPage(data)
      setLoading(false)
    }
    if (courseId) load()
    return () => { cancelled = true }
  }, [courseId])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
          <div className="h-7 bg-gray-200 rounded w-1/2 mb-3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded"></div>)}
          </div>
        </div>
      </div>
    )
  }

  if (error || !page?.course) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-3">⛳</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Course page unavailable</h2>
          <p className="text-gray-500 text-sm">
            {error ? 'Course pages need the stats engine (database/stats_layer.sql).' : 'Course not found.'}
          </p>
          <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
            Go back
          </button>
        </div>
      </div>
    )
  }

  const c = page.course
  const leaderboard = page.leaderboard || []
  const recent = page.recent_rounds || []

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      {/* Course header */}
      <div className="bg-green-700 text-white p-6 rounded-t-lg">
        <h1 className="text-2xl sm:text-3xl font-bold">⛳ {c.course_name}</h1>
        <p className="mt-1 text-green-100">
          {[c.club_name, c.city, c.state].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-green-200 text-sm">
          {c.num_holes || 18} holes{c.total_par ? ` · Par ${c.total_par}` : ''}
        </p>
      </div>

      <div className="bg-white border-x border-b border-gray-200 rounded-b-lg">
        <div className="p-3 sm:p-6 bg-gray-50 space-y-3 sm:space-y-4">

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Rounds logged</div>
              <div className="text-2xl font-semibold text-gray-900 mt-1">{page.rounds_count || 0}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Golfers</div>
              <div className="text-2xl font-semibold text-gray-900 mt-1">{page.players_count || 0}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Average score</div>
              <div className="text-2xl font-semibold text-gray-900 mt-1">{page.avg_score ?? '—'}</div>
              {page.avg_vs_par !== null && page.avg_vs_par !== undefined && (
                <div className="text-xs text-gray-500">
                  {page.avg_vs_par > 0 ? `+${page.avg_vs_par}` : page.avg_vs_par} vs par
                </div>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">{page.my_best ? 'Your best' : 'Course record'}</div>
              <div className="text-2xl font-semibold text-gray-900 mt-1">
                {page.my_best ?? page.course_record ?? '—'}
              </div>
              {page.my_best && page.course_record && (
                <div className="text-xs text-gray-500">record {page.course_record}</div>
              )}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
            <h3 className="font-semibold text-gray-900">🏆 Leaderboard</h3>
            <p className="text-xs text-gray-500 mt-0.5">Each golfer's best 18-hole round here</p>
            <div className="mt-2 divide-y divide-gray-100">
              {leaderboard.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No 18-hole rounds logged here yet — post one and claim the top spot.
                </p>
              ) : (
                leaderboard.map((entry, i) => (
                  <PlayerRow key={entry.user_id} entry={entry} rank={i + 1}
                    isMe={entry.user_id === user?.id} navigate={navigate} />
                ))
              )}
            </div>
          </div>

          {/* Recent rounds */}
          {recent.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900">Recent rounds</h3>
              <div className="mt-2 divide-y divide-gray-100">
                {recent.map((entry, i) => (
                  <PlayerRow key={`${entry.short_code || i}`} entry={entry}
                    isMe={entry.user_id === user?.id} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default CoursePage
