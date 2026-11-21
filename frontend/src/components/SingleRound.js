import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import ShareModal from './ShareModal'
import RoundCard from './RoundCard'
import { withMyReaction } from '../utils/reactions'

// One round on its own page (/rounds/:roundId — a short code or the id).
//
// Signed in: the normal card with reactions, comments and a Follow button.
// Signed out (someone opened a shared link): a read-only card loaded through
// the get_public_round database function, which only returns public rounds,
// plus a "Join Dogleg" call to action. The app shell wraps this page in the
// small PublicShell frame for signed-out visitors.

const EMPTY_REACTIONS = {
  fire: 0, clap: 0, dart: 0, goat: 0,
  vomit: 0, clown: 0, skull: 0, laugh: 0
}

// Turns the get_public_round result ({ round, author, reactions,
// comment_count, comments }) into the round shape the rest of this page and
// RoundCard use. Returns null for an empty or malformed result. Exported for
// the unit test.
export function normalizePublicRound(payload) {
  if (!payload || typeof payload !== 'object') return null
  const round = payload.round
  if (!round || typeof round !== 'object' || !round.id) return null

  // Only the reaction types the card knows how to draw, as plain numbers
  const reactions = { ...EMPTY_REACTIONS }
  for (const [type, count] of Object.entries(payload.reactions || {})) {
    const n = Number(count)
    if (Object.prototype.hasOwnProperty.call(reactions, type) && Number.isFinite(n) && n > 0) {
      reactions[type] = n
    }
  }

  const comments = (Array.isArray(payload.comments) ? payload.comments : []).map((c, index) => ({
    id: c?.id ?? `comment-${index}`,
    text: typeof c?.content === 'string' ? c.content : '',
    author: c?.author?.username || c?.author?.full_name || 'Golfer',
    author_username: c?.author?.username || null,
    author_avatar: c?.author?.avatar_url || null,
    date: c?.created_at,
  }))

  const author = payload.author && typeof payload.author === 'object'
    ? {
        username: payload.author.username || null,
        full_name: payload.author.full_name || null,
        avatar_url: payload.author.avatar_url || null,
      }
    : null

  const commentCount = Number(payload.comment_count)

  return {
    ...round,
    profiles: author,
    reactions,
    comments,
    comment_count: Number.isFinite(commentCount) ? commentCount : comments.length,
    userReacted: [],
    isFollowing: false,
  }
}

function LoadingCard() {
  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
        <div className="px-3 sm:px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gray-200 rounded-full"></div>
            <div>
              <div className="h-3.5 bg-gray-200 rounded w-24 mb-1.5"></div>
              <div className="h-3 bg-gray-100 rounded w-16"></div>
            </div>
          </div>
        </div>
        <div className="px-3 sm:px-4 pb-4">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3.5 bg-gray-100 rounded w-1/2 mb-3"></div>
          <div className="h-16 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    </div>
  )
}

function SingleRound() {
  const { roundId } = useParams()
  const [round, setRound] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [shareRound, setShareRound] = useState(null)

  // Bumped on every load, so a slow reply for an earlier load is ignored
  const loadIdRef = useRef(0)

  const isPublicView = !user

  useEffect(() => {
    if (user) {
      loadSingleRound()
    } else {
      loadPublicRound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, user?.id])

  // Signed-out visitors: everything comes from one database function that
  // returns only public, non-deleted rounds (defined in database/security_hardening.sql)
  const loadPublicRound = async () => {
    const loadId = ++loadIdRef.current
    setIsLoading(true)

    let normalized = null
    try {
      const { data, error } = await supabase.rpc('get_public_round', { p_code: roundId })
      // An error here usually means the function isn't installed yet, or the
      // connection failed. Either way: show the "not available" state.
      if (error) {
        console.error('Could not load the public round:', error)
      } else {
        normalized = normalizePublicRound(data)
      }
    } catch (error) {
      console.error('Could not load the public round:', error)
    }

    if (loadId !== loadIdRef.current) return
    setRound(normalized)
    setIsLoading(false)
  }

  const loadSingleRound = async () => {
    const loadId = ++loadIdRef.current
    setIsLoading(true)

    // Check if roundId is a UUID or short_code
    const isUUID = roundId.length === 36 && roundId.includes('-')

    const { data: roundData, error: roundError } = isUUID
      ? await roundsService.getRound(roundId)
      : await roundsService.getRoundByShortCode(roundId)

    if (loadId !== loadIdRef.current) return

    if (!roundData || roundError) {
      setIsLoading(false)
      setRound(null)
      return
    }

    // Use the ACTUAL round ID (UUID) for fetching related data
    const actualRoundId = roundData.id

    const roundIds = [actualRoundId]

    const [reactionsData, commentsData, userReactionsData] = await Promise.all([
      roundsService.getReactions(roundIds),
      roundsService.getComments(roundIds),
      user ? roundsService.getUserReactions(roundIds) : { data: [] }
    ])

    const reactions = reactionsData.data || []
    const comments = commentsData.data || []
    const userReactions = userReactionsData.data || []

    // Only check follow status if round has a user_id and it's not the current user
    let followStatuses = {}
    if (roundData.user_id && roundData.user_id !== user?.id) {
      followStatuses = await followService.getFollowStatuses([roundData.user_id])
    }

    if (loadId !== loadIdRef.current) return

    const roundReactions = reactions.filter(r => r.round_id === actualRoundId) || []
    const reactionCounts = { ...EMPTY_REACTIONS }

    roundReactions.forEach(r => {
      if (reactionCounts.hasOwnProperty(r.reaction_type)) {
        reactionCounts[r.reaction_type]++
      }
    })

    const roundComments = comments.filter(c => c.round_id === actualRoundId) || []
    const myReactions = userReactions.filter(r => r.round_id === actualRoundId).map(r => r.reaction_type) || []

    const formattedRound = {
      ...roundData,
      reactions: reactionCounts,
      comments: roundComments.map(c => ({
        id: c.id,
        text: c.content || c.comment_text,
        author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
        author_username: c.profiles?.username || null,
        author_avatar: c.profiles?.avatar_url,
        date: c.created_at,
        user_id: c.user_id
      })),
      userReacted: myReactions || [],
      isFollowing: followStatuses[roundData.user_id] || false
    }

    setRound(formattedRound)
    setIsLoading(false)
  }

  const toggleReaction = async (roundId, reaction) => {
    if (!round) return

    // Save exactly what the user tapped for (the opposite of what the card
    // shows), never "toggle whatever the database holds"
    const shouldHave = !(round.userReacted || []).includes(reaction)
    const showMine = (has) => setRound(current =>
      current && current.id === roundId ? withMyReaction(current, reaction, has) : current
    )

    showMine(shouldHave)

    const { error, superseded, exists } = await roundsService.saveReaction(roundId, reaction, shouldHave)

    if (error) {
      console.error('Failed to save reaction:', error)
      // Put the card back to what the database holds, unless a later tap on
      // this reaction now owns it
      if (!superseded) showMine(exists ?? !shouldHave)
    }
  }

  const addComment = async (roundId, text) => {
    if (!text.trim()) return

    const { data, error } = await roundsService.saveComment(roundId, text)

    if (!error && data) {
      setRound({
        ...round,
        comments: [...round.comments, {
          id: data.id,
          text: data.content,
          author: data.profiles?.username || data.profiles?.full_name || 'Anonymous',
          author_username: data.profiles?.username || null,
          author_avatar: data.profiles?.avatar_url,
          date: data.created_at,
          user_id: data.user_id
        }]
      })
    }
  }

  const handleFollowChange = (userId, isNowFollowing) => {
    setRound({ ...round, isFollowing: isNowFollowing })
  }

  // AuthScreen opens on the right form and brings the visitor back here
  const goToLogin = (mode) => {
    navigate('/login', { state: { mode, from: location.pathname } })
  }

  // Loading state
  if (isLoading) {
    return <LoadingCard />
  }

  // Not found / not available
  if (!round) {
    if (isPublicView) {
      // Private, removed, or the public view isn't switched on yet. We can't
      // tell which (on purpose), so point them at logging in.
      return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-8 sm:p-12 text-center">
            <div className="text-5xl mb-4">⛳</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">This round isn't available</h2>
            <p className="text-gray-500 mb-6">Log in to see it. It may be private or no longer posted.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => goToLogin('signin')}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => goToLogin('signup')}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Join Dogleg free
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">Round not found</h2>
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:underline"
          >
            Back to Feed
          </button>
        </div>
      </div>
    )
  }

  // Normalize round data for the shared card
  const normalizedRound = {
    ...round,
    total: round.total_score || round.total,
    date: round.played_at || round.date,
    tee: round.tee_data || round.tee,
    holes: round.scores_by_hole || round.holes,
    coursePars: round.course_pars || round.coursePars
  }

  const profile = round.profiles

  if (isPublicView) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-3 sm:space-y-4">
        <RoundCard
          round={normalizedRound}
          author={profile}
          showAuthor
          readOnly
          onShare={setShareRound}
        />

        {/* The point of the public page: turn a shared link into a signup */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 text-center">
          <p className="text-gray-700 font-medium mb-1">
            {profile?.username ? `${profile.username} is on Dogleg` : 'This round was posted on Dogleg'}
          </p>
          <p className="text-gray-500 text-sm mb-4">Track your golf, follow friends and see how your rounds compare.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => goToLogin('signup')}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Join Dogleg to react and comment
            </button>
            <button
              type="button"
              onClick={() => goToLogin('signin')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Log in
            </button>
          </div>
        </div>

        {shareRound && (
          <ShareModal
            round={shareRound}
            username={profile?.username || 'golfer'}
            onClose={() => setShareRound(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <RoundCard
        round={normalizedRound}
        author={profile}
        showAuthor
        currentUserId={user?.id}
        headerAction={
          round.user_id !== user?.id ? (
            <FollowButton
              targetUserId={round.user_id}
              targetUsername={profile?.username}
              initialFollowing={round.isFollowing}
              onFollowChange={(newState) => handleFollowChange(round.user_id, newState)}
              size="small"
            />
          ) : null
        }
        onToggleReaction={toggleReaction}
        onAddComment={addComment}
        onShare={setShareRound}
      />

      {shareRound && (
        <ShareModal
          round={shareRound}
          username={profile?.username || 'golfer'}
          onClose={() => setShareRound(null)}
        />
      )}
    </div>
  )
}

export default SingleRound
