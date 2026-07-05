import { supabase } from './supabase'

export const statsService = {
  // Everything the Stats tab needs, in one call (RPC from database/stats_layer.sql)
  getUserStats: async (userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_stats', {
        p_user_id: userId
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Course page: header stats + leaderboard + recent rounds
  getCoursePage: async (courseId) => {
    try {
      const { data, error } = await supabase.rpc('get_course_page', {
        p_course_id: courseId
      })
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // The feed RPC predates the stats columns, so feed cards fetch them in one
  // extra batched query. Returns a map: round id -> stats fields.
  getRoundStatsFields: async (roundIds) => {
    try {
      if (!roundIds || roundIds.length === 0) return { data: {}, error: null }

      const { data, error } = await supabase
        .from('rounds')
        .select('id, course_id, dogleg_score, strokes_vs_usual, differential, achievements, holes_played')
        .in('id', roundIds)

      if (error) return { data: {}, error }

      const byId = {}
      for (const row of data || []) {
        byId[row.id] = row
      }
      return { data: byId, error: null }
    } catch (error) {
      return { data: {}, error }
    }
  }
}

// Rolling WHS-style handicap index over a differential series (oldest first).
// Mirrors dogleg_recompute_handicap in database/stats_layer.sql so the trend
// chart shows the index exactly as it evolved.
export function rollingHandicapSeries(series) {
  const points = []
  const diffs = []

  for (const round of series || []) {
    if (round.differential === null || round.differential === undefined) continue
    diffs.push(Number(round.differential))
    const latest20 = diffs.slice(-20)
    const index = whsIndexFromDifferentials(latest20)
    if (index !== null) {
      points.push({ date: round.date, index })
    }
  }
  return points
}

export function whsIndexFromDifferentials(differentials) {
  const n = differentials.length
  if (n < 3) return null

  const sorted = [...differentials].sort((a, b) => a - b)
  const avg = (k) => sorted.slice(0, k).reduce((s, d) => s + d, 0) / k

  let index
  if (n === 3) index = sorted[0] - 2.0
  else if (n === 4) index = sorted[0] - 1.0
  else if (n === 5) index = sorted[0]
  else if (n === 6) index = avg(2) - 1.0
  else if (n <= 8) index = avg(2)
  else if (n <= 11) index = avg(3)
  else if (n <= 14) index = avg(4)
  else if (n <= 16) index = avg(5)
  else if (n <= 18) index = avg(6)
  else if (n === 19) index = avg(7)
  else index = avg(8)

  return Math.min(Math.round(index * 10) / 10, 54.0)
}
