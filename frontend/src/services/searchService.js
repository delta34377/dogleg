import { supabase } from './supabase'
import { getDisplayName } from '../utils/courseNameUtils'

// ---------------------------------------------------------------------------
// "People to follow" suggestions (getSuggestedUsers below)
//
// Worked out in the browser from tables the app can already read, in at most
// six queries:
//   1. follows involving the user (who they follow + who follows them)
//   2. the user's own recent rounds (which courses they play)
//   3. other golfers' recent public rounds (activity + same courses)
//   4. the newest profiles with a username (fallback)
//   5. who the people the user follows follow (friends of friends; after 1)
//   6. the profiles of the best candidates, and of anyone a reason names
// 1-4 run in parallel, 5 starts as soon as 1 answers, 6 runs last. Any one of
// them failing only drops that signal. RLS already hides other people's
// private rounds and banned users' rounds; the queries also ask for public,
// not-hidden rounds only, so nothing here depends on reading private data.
//
// Scoring: a golfer's score is the SUM of every signal that applies to them
// (someone who follows you AND plays your course ranks above someone who only
// follows you), and the reason shown is the label of their single strongest
// signal. Ties go to the more recently active account.
// ---------------------------------------------------------------------------
export const SUGGESTION_WEIGHTS = {
  followsYou: 100,         // "Follows you": follows the user, not followed back
  friendOfFriend: 40,      // "Followed by @alice": followed by someone the user follows...
  friendOfFriendExtra: 10, // ...plus this for each further one ("Followed by 3 people you follow")
  friendOfFriendMaxExtra: 4,
  sameCourse: 30,          // "Plays <course>": a recent round at a course the user has played
  sameCourseExtra: 5,      // ...plus this for each further shared course
  sameCourseMaxExtra: 2,
  activeThisWeek: 20,      // "Active this week": posted a round in the last 7 days
  activeRecently: 10,      // "Active recently": posted a round in the last 30 days
  newest: 1,               // fallback: one of the newest accounts with a username
}

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIVE_WEEK_DAYS = 7
const ACTIVE_RECENT_DAYS = 30
const NEW_ACCOUNT_DAYS = 30
const RECENT_ROUNDS_DAYS = 90 // how far back "recent rounds at your courses" looks

// Row caps for each query (every query has a .limit())
const FOLLOW_ROWS = 1000
const MY_ROUNDS = 100
const RECENT_ROUNDS = 300
const FRIEND_FOLLOW_ROWS = 1000
const MAX_FRIENDS_ASKED = 100  // ids in one .in() filter (keeps the request URL short)
const MAX_PROFILES_ASKED = 100
const SHORTLIST_MAX = 50       // candidates whose profiles are fetched

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, location, is_banned, created_at'

// Runs one query and never throws: { rows, error }. A failed or refused read
// just means that signal is left out.
async function safeRows(label, run) {
  try {
    const { data, error } = await run()
    if (error) {
      console.error(`Suggested users: could not read ${label}:`, error)
      return { rows: [], error }
    }
    return { rows: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    console.error(`Suggested users: could not read ${label}:`, error)
    return { rows: [], error }
  }
}

const NO_ROWS = Promise.resolve({ rows: [], error: null, skipped: true })

const timeOf = (value) => {
  const ms = value ? new Date(value).getTime() : NaN
  return Number.isFinite(ms) ? ms : 0
}
const isoDaysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString()
const hasUsername = (profile) => typeof profile?.username === 'string' && profile.username.trim() !== ''
// '-1' is how rounds on custom courses are stored (see feed_algorithm.sql)
const realCourseId = (id) => (id === null || id === undefined || String(id).trim() === '' || String(id) === '-1'
  ? null
  : String(id))
const clubKey = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '')
const courseLabel = (round) => {
  const label = getDisplayName({ course_name: round?.course_name, club_name: round?.club_name })
  return label && label !== 'Unknown Course' ? label : null
}
const clubLabel = (round) => {
  const label = getDisplayName({ course_name: null, club_name: round?.club_name })
  return label && label !== 'Unknown Course' ? label : null
}
// Safe to put inside a PostgREST or=() filter as-is (a uuid always is)
const isPlainId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]+$/.test(id)

export const searchService = {
  // Search users by username or full name
  searchUsers: async (searchTerm, limit = 20) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { data: [], error: null }
    }

    try {
      // Clean the search term to prevent SQL injection and handle special characters
      // Remove SQL wildcards and other problematic characters
      const cleanTerm = searchTerm
        .replace(/[%_\\]/g, '') // Remove SQL wildcards
        .replace(/[(),]/g, ' ')  // Replace problematic characters with spaces
        .trim()
      
      // Use ilike for case-insensitive partial matching
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, location')
        .or(`username.ilike.%${cleanTerm}%,full_name.ilike.%${cleanTerm}%`)
        .limit(limit)
        .order('username', { ascending: true })

      if (error) {
        console.error('Search error:', error)
        return { data: [], error }
      }

      return { data: data || [], error: null }
    } catch (error) {
      console.error('Search error:', error)
      return { data: [], error }
    }
  },

  // People to follow, best first (how they are picked: see the top of this
  // file). Resolves to { data, error }: data is a list of
  // { id, username, full_name, avatar_url, bio, location, reason }, where
  // reason is a short line for under the name ("Follows you", "Plays Pebble
  // Beach", ...) or null. error is set only when nothing could be read at all.
  getSuggestedUsers: async (currentUserId, limit = 10) => {
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 10
    const me = currentUserId || null
    const W = SUGGESTION_WEIGHTS

    try {
      // ---- Queries 1-4 in parallel, 5 as soon as 1 has answered ----------
      const followsQuery = me && isPlainId(me)
        ? safeRows('follows', () => supabase
          .from('follows')
          .select('*')
          .or(`follower_id.eq.${me},following_id.eq.${me}`)
          .limit(FOLLOW_ROWS))
        : NO_ROWS

      const myRoundsQuery = me
        ? safeRows('your rounds', () => supabase
          .from('rounds')
          .select('course_id, course_name, club_name')
          .eq('user_id', me)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .order('played_at', { ascending: false })
          .limit(MY_ROUNDS))
        : NO_ROWS

      const recentRoundsQuery = safeRows('recent rounds', () => {
        let query = supabase
          .from('rounds')
          .select('user_id, course_id, course_name, club_name, played_at, created_at')
        if (me) query = query.neq('user_id', me)
        return query
          .or('is_deleted.is.null,is_deleted.eq.false')
          .or('is_private.is.null,is_private.eq.false')
          .gte('created_at', isoDaysAgo(RECENT_ROUNDS_DAYS))
          .order('created_at', { ascending: false })
          .limit(RECENT_ROUNDS)
      })

      const newestQuery = safeRows('newest profiles', () => {
        let query = supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .not('username', 'is', null) // blank ones are dropped below
          .or('is_banned.is.null,is_banned.eq.false')
        if (me) query = query.neq('id', me)
        return query
          // (Postgres puts NULLs first in a descending sort: keep undated rows last)
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(Math.max(max * 3, 30))
      })

      // Who the people the user follows follow
      const friendFollowsQuery = followsQuery.then(({ rows }) => {
        const friendIds = [...new Set(rows
          .filter((row) => row.follower_id === me && row.following_id && row.following_id !== me)
          .map((row) => row.following_id))]
        if (friendIds.length === 0) return { rows: [], error: null, skipped: true }
        return safeRows('who the people you follow follow', () => supabase
          .from('follows')
          .select('follower_id, following_id')
          .in('follower_id', friendIds.slice(0, MAX_FRIENDS_ASKED))
          .limit(FRIEND_FOLLOW_ROWS))
      })

      const [follows, myRounds, recentRounds, newest, friendFollows] = await Promise.all([
        followsQuery, myRoundsQuery, recentRoundsQuery, newestQuery, friendFollowsQuery,
      ])

      // ---- Who is never suggested: the user and the people they follow ----
      const followingIds = new Set()
      const followers = new Map() // follower id -> when they followed (ms; 0 = unknown)
      for (const row of follows.rows) {
        if (row.follower_id === me && row.following_id) followingIds.add(row.following_id)
        if (row.following_id === me && row.follower_id) followers.set(row.follower_id, timeOf(row.created_at))
      }
      const excluded = (id) => !id || id === me || followingIds.has(id)

      const candidates = new Map()
      const candidate = (id) => {
        if (!candidates.has(id)) {
          candidates.set(id, {
            id,
            followsYou: false,
            friendIds: new Set(),
            courses: new Map(), // place key -> label, most recent round first
            clubsSeen: new Set(),
            lastRoundAt: 0,
            isNewest: false,
            recency: 0,
          })
        }
        return candidates.get(id)
      }
      const touch = (c, ms) => { if (ms > c.recency) c.recency = ms }

      // "Follows you"
      for (const [id, since] of followers) {
        if (excluded(id)) continue
        const c = candidate(id)
        c.followsYou = true
        touch(c, since)
      }

      // "Followed by ..."
      for (const row of friendFollows.rows) {
        if (excluded(row.following_id) || !followingIds.has(row.follower_id)) continue
        candidate(row.following_id).friendIds.add(row.follower_id)
      }

      // The courses (and clubs) the user has played
      const myCourses = new Map() // course id -> label
      const myClubs = new Map()   // lower-cased club name -> label
      for (const round of myRounds.rows) {
        const courseId = realCourseId(round.course_id)
        if (courseId && !myCourses.has(courseId)) myCourses.set(courseId, courseLabel(round))
        const club = clubKey(round.club_name)
        if (club && !myClubs.has(club)) myClubs.set(club, clubLabel(round))
      }

      // "Plays <course>" and "Active ..." from other golfers' recent rounds
      // (newest first, so the first course matched is the latest one)
      for (const round of recentRounds.rows) {
        if (excluded(round.user_id)) continue
        const c = candidate(round.user_id)
        const at = timeOf(round.created_at) || timeOf(round.played_at)
        if (at > c.lastRoundAt) c.lastRoundAt = at
        touch(c, at)

        // Match on course_id; fall back to the club name (custom courses,
        // rounds without an id, or another course at the same club)
        const courseId = realCourseId(round.course_id)
        const club = clubKey(round.club_name)
        if (courseId && myCourses.has(courseId)) {
          const key = `course:${courseId}`
          if (!c.courses.has(key)) c.courses.set(key, myCourses.get(courseId) || courseLabel(round))
          if (club) c.clubsSeen.add(club)
        } else if (club && myClubs.has(club) && !c.clubsSeen.has(club)) {
          c.clubsSeen.add(club)
          c.courses.set(`club:${club}`, myClubs.get(club) || clubLabel(round))
        }
      }

      const now = Date.now()
      // Every signal that applies to a golfer, strongest first among equals
      const signalsOf = (c, profiles) => {
        const signals = []
        if (c.followsYou) signals.push({ weight: W.followsYou, reason: 'Follows you' })
        if (c.friendIds.size > 0) {
          const count = c.friendIds.size
          let reason = `Followed by ${count} people you follow`
          if (count === 1) {
            const friend = profiles.get([...c.friendIds][0])
            reason = friend && hasUsername(friend) && !friend.is_banned
              ? `Followed by @${friend.username}`
              : 'Followed by someone you follow'
          }
          signals.push({
            weight: W.friendOfFriend + W.friendOfFriendExtra * Math.min(count - 1, W.friendOfFriendMaxExtra),
            reason,
          })
        }
        if (c.courses.size > 0) {
          const label = [...c.courses.values()].find(Boolean)
          signals.push({
            weight: W.sameCourse + W.sameCourseExtra * Math.min(c.courses.size - 1, W.sameCourseMaxExtra),
            reason: label ? `Plays ${label}` : "Plays a course you've played",
          })
        }
        if (c.lastRoundAt) {
          const age = now - c.lastRoundAt
          if (age <= ACTIVE_WEEK_DAYS * DAY_MS) signals.push({ weight: W.activeThisWeek, reason: 'Active this week' })
          else if (age <= ACTIVE_RECENT_DAYS * DAY_MS) signals.push({ weight: W.activeRecently, reason: 'Active recently' })
        }
        if (c.isNewest) {
          const profile = profiles.get(c.id)
          const isNew = profile && now - timeOf(profile.created_at) <= NEW_ACCOUNT_DAYS * DAY_MS
          signals.push({ weight: W.newest, reason: isNew ? 'New to Dogleg' : null })
        }
        return signals
      }
      const scoreOf = (signals) => signals.reduce((sum, s) => sum + s.weight, 0)
      const bestFirst = (a, b) => (b.score - a.score)
        || (b.c.recency - a.c.recency)
        || String(a.c.id).localeCompare(String(b.c.id))

      // ---- Query 6: the profiles of the best candidates ------------------
      const profiles = new Map()
      for (const profile of newest.rows) if (profile?.id) profiles.set(profile.id, profile)

      const shortlist = [...candidates.values()]
        .map((c) => ({ c, score: scoreOf(signalsOf(c, profiles)) }))
        .filter(({ score }) => score > 0)
        .sort(bestFirst)
        .slice(0, Math.min(SHORTLIST_MAX, Math.max(max * 4, 20)))
      const wanted = new Set()
      const want = (id) => { if (id && !profiles.has(id)) wanted.add(id) }
      for (const { c } of shortlist) {
        want(c.id)
        if (c.friendIds.size === 1) want([...c.friendIds][0]) // named in "Followed by @..."
      }
      const asked = [...wanted].slice(0, MAX_PROFILES_ASKED)
      const extra = asked.length > 0
        ? await safeRows('profiles', () => supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .in('id', asked)
          .limit(asked.length))
        : { rows: [], error: null, skipped: true }
      for (const profile of extra.rows) if (profile?.id) profiles.set(profile.id, profile)

      // Fallback: the newest accounts
      for (const profile of newest.rows) {
        if (!profile?.id || excluded(profile.id)) continue
        candidate(profile.id).isNewest = true
      }

      // ---- Put it together ------------------------------------------------
      const results = []
      for (const c of candidates.values()) {
        const profile = profiles.get(c.id)
        if (excluded(c.id) || !profile || !hasUsername(profile) || profile.is_banned === true) continue
        touch(c, timeOf(profile.created_at))
        const signals = signalsOf(c, profiles)
        if (signals.length === 0) continue
        const strongest = signals.reduce((best, s) => (s.weight > best.weight ? s : best))
        results.push({ c, profile, score: scoreOf(signals), reason: strongest.reason })
      }
      results.sort(bestFirst)

      const data = results.slice(0, max).map(({ profile, reason }) => ({
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        bio: profile.bio ?? null,
        location: profile.location ?? null,
        reason: reason || null,
      }))

      // Only an error when no profile could be read at all
      const profileReads = [newest, extra].filter((read) => !read.skipped)
      if (data.length === 0 && profileReads.length > 0 && profileReads.every((read) => read.error)) {
        return { data: [], error: profileReads[0].error }
      }
      return { data, error: null }
    } catch (error) {
      console.error('Suggested users error:', error)
      return { data: [], error }
    }
  }
}
