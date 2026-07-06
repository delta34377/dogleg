import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import ShareModal from './ShareModal'
import RoundCard from './RoundCard'

function SingleRound() {
  const { roundId } = useParams()
  const [round, setRound] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [shareRound, setShareRound] = useState(null)

  useEffect(() => {
    loadSingleRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  const loadSingleRound = async () => {
    setIsLoading(true)

    // Check if roundId is a UUID or short_code
    const isUUID = roundId.length === 36 && roundId.includes('-')

    const { data: roundData, error: roundError } = isUUID
      ? await roundsService.getRound(roundId)
      : await roundsService.getRoundByShortCode(roundId)


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

    const roundReactions = reactions.filter(r => r.round_id === actualRoundId) || []
    const reactionCounts = {
      fire: 0, clap: 0, dart: 0, goat: 0,
      vomit: 0, clown: 0, skull: 0, laugh: 0
    }

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
    const previousRound = round

    const newReactions = { ...round.reactions }
    const newUserReacted = [...round.userReacted]

    const hasReacted = round.userReacted.includes(reaction)

    if (hasReacted) {
      newReactions[reaction] = Math.max(0, newReactions[reaction] - 1)
      const index = newUserReacted.indexOf(reaction)
      if (index > -1) newUserReacted.splice(index, 1)
    } else {
      newReactions[reaction] = (newReactions[reaction] || 0) + 1
      newUserReacted.push(reaction)
    }

    setRound({ ...round, reactions: newReactions, userReacted: newUserReacted })

    const { error } = await roundsService.saveReaction(roundId, reaction)

    if (error) {
      console.error('Failed to save reaction:', error)
      setRound(previousRound)
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

  // Not found state
  if (!isLoading && !round) {
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

  // Loading state
  if (isLoading) {
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
