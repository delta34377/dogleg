import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import { reactionEmojis } from '../utils/constants'
import { 
  getDisplayName, 
  calculateVsPar, 
  formatDate, 
  formatTeeDetails, 
  getScoreColor 
} from '../utils/roundHelpers'

function SingleRound() {
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const [round, setRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commentInput, setCommentInput] = useState('')
  const [showExpandedComments, setShowExpandedComments] = useState(false)

  useEffect(() => {
    loadRoundData()
  }, [roundId])

  const loadRoundData = async () => {
    try {
      // Get the round
      const { data: roundData, error: roundError } = await roundsService.getRound(roundId)
      
      if (!roundData || roundError) {
        console.error('Error loading round:', roundError)
        setLoading(false)
        return
      }

      // Get reactions, comments, and user reactions
      const [reactionsData, commentsData, userReactionsData] = await Promise.all([
        roundsService.getReactions([roundId]),
        roundsService.getComments([roundId]),
        user ? roundsService.getUserReactions([roundId]) : { data: [] }
      ])

      // Check follow status if not current user
      let isFollowing = false
      if (roundData.user_id !== user?.id) {
        const followStatus = await followService.getFollowStatuses([roundData.user_id])
        isFollowing = followStatus[roundData.user_id] || false
      }

      // Count reactions by type
      const reactions = reactionsData.data || []
      const reactionCounts = {
        fire: 0, clap: 0, dart: 0, goat: 0,
        vomit: 0, clown: 0, skull: 0, laugh: 0
      }
      
      reactions.forEach(r => {
        if (reactionCounts.hasOwnProperty(r.reaction_type)) {
          reactionCounts[r.reaction_type]++
        }
      })

      // Format comments
      const comments = commentsData.data || []
      const formattedComments = comments.map(c => ({
        id: c.id,
        text: c.content || c.comment_text,
        author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
        author_username: c.profiles?.username || null,
        author_avatar: c.profiles?.avatar_url,
        date: c.created_at,
        user_id: c.user_id
      }))

      // Get user's reactions
      const userReactions = userReactionsData.data || []
      const myReactions = userReactions.filter(r => r.round_id === roundId).map(r => r.reaction_type) || []

      // Set up the round with all data
      setRound({
        ...roundData,
        reactions: reactionCounts,
        comments: formattedComments,
        userReacted: myReactions,
        isFollowing: isFollowing
      })

      setLoading(false)
    } catch (error) {
      console.error('Error in loadRoundData:', error)
      setLoading(false)
    }
  }

  const toggleReaction = async (roundId, reaction) => {
    if (!user) {
      alert('Please sign in to react to rounds')
      return
    }

    // Optimistically update UI
    setRound(prevRound => {
      const newReactions = { ...prevRound.reactions }
      const newUserReacted = [...prevRound.userReacted]
      
      const hasReacted = prevRound.userReacted.includes(reaction)
      
      if (hasReacted) {
        // Remove reaction
        newReactions[reaction] = Math.max(0, newReactions[reaction] - 1)
        const index = newUserReacted.indexOf(reaction)
        if (index > -1) newUserReacted.splice(index, 1)
      } else {
        // Add reaction
        newReactions[reaction] = (newReactions[reaction] || 0) + 1
        newUserReacted.push(reaction)
      }
      
      return { ...prevRound, reactions: newReactions, userReacted: newUserReacted }
    })
    
    // Save to database
    const { error } = await roundsService.saveReaction(roundId, reaction)
    
    if (error) {
      console.error('Failed to save reaction:', error)
      // Reload data to sync with database
      loadRoundData()
    }
  }

  const addComment = async () => {
    if (!commentInput.trim() || !user) return
    
    const { data, error } = await roundsService.saveComment(roundId, commentInput)
    
    if (!error && data) {
      const newComment = {
        id: data.id,
        text: data.content,
        author: data.profiles?.username || data.profiles?.full_name || 'Anonymous',
        author_username: data.profiles?.username || null,
        author_avatar: data.profiles?.avatar_url,
        date: data.created_at,
        user_id: data.user_id
      }

      setRound(prevRound => ({
        ...prevRound,
        comments: [...prevRound.comments, newComment]
      }))
      
      setCommentInput('')
    }
  }

  const deleteComment = async (commentId) => {
    if (window.confirm('Delete this comment?')) {
      const { error } = await roundsService.deleteComment(commentId)
      if (!error) {
        setRound(prevRound => ({
          ...prevRound,
          comments: prevRound.comments.filter(c => c.id !== commentId)
        }))
      }
    }
  }

  const handleFollowChange = (userId, newState) => {
    setRound(prevRound => ({
      ...prevRound,
      isFollowing: newState
    }))
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/rounds/${roundId}`
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out this golf round on Dogleg',
          url: shareUrl
        })
      } catch (err) {
        // User cancelled or error
        if (err.name !== 'AbortError') {
          // Fallback to clipboard
          navigator.clipboard.writeText(shareUrl)
          alert('Link copied to clipboard!')
        }
      }
    } else {
      // Fallback for browsers without share API
      navigator.clipboard.writeText(shareUrl)
      alert('Link copied to clipboard!')
    }
  }

  // Scorecard component (exact copy from Feed)
  const Scorecard = ({ round }) => {
    if (!round.holes || round.holes.every(h => h === '')) return null
    
    const front9 = round.holes.slice(0, 9)
    const back9 = round.holes.slice(9, 18)
    const pars = round.coursePars || Array(18).fill(4)
    const parFront = pars.slice(0, 9).reduce((sum, p) => sum + p, 0)
    const parBack = pars.slice(9, 18).reduce((sum, p) => sum + p, 0)
    
    const getScoreCellColor = (score, par) => {
      if (!score || score === '') return ''
      const diff = parseInt(score) - par
      if (diff <= -2) return 'bg-yellow-200 text-yellow-900'
      if (diff === -1) return 'bg-red-100 text-red-800'
      if (diff === 0) return ''
      if (diff === 1) return 'bg-blue-100 text-blue-800'
      if (diff >= 2) return 'bg-purple-100 text-purple-800'
      return ''
    }
    
    return (
      <div className="mt-3">
        <div className="bg-white rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <td className="px-1 py-1 font-medium">Hole</td>
                  {[...Array(9)].map((_, i) => (
                    <td key={i} className="px-1 py-1 text-center font-medium min-w-[28px]">
                      {i + 1}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-medium bg-gray-100">Out</td>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-1 py-1 font-medium bg-gray-50">Par</td>
                  {pars.slice(0, 9).map((par, i) => (
                    <td key={i} className="px-1 py-1 text-center text-gray-600">
                      {par}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-medium bg-gray-100">
                    {parFront}
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-1 font-medium bg-gray-50">Score</td>
                  {front9.map((score, i) => (
                    <td 
                      key={i} 
                      className={`px-1 py-1 text-center font-semibold ${getScoreCellColor(score, pars[i])}`}
                    >
                      {score || '-'}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-bold bg-gray-100">
                    {round.front9 || '--'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-t bg-gray-50">
                  <td className="px-1 py-1 font-medium">Hole</td>
                  {[...Array(9)].map((_, i) => (
                    <td key={i} className="px-1 py-1 text-center font-medium min-w-[28px]">
                      {i + 10}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-medium bg-gray-100">In</td>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-1 py-1 font-medium bg-gray-50">Par</td>
                  {pars.slice(9, 18).map((par, i) => (
                    <td key={i} className="px-1 py-1 text-center text-gray-600">
                      {par}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-medium bg-gray-100">
                    {parBack}
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-1 font-medium bg-gray-50">Score</td>
                  {back9.map((score, i) => (
                    <td 
                      key={i} 
                      className={`px-1 py-1 text-center font-semibold ${getScoreCellColor(score, pars[i + 9])}`}
                    >
                      {score || '-'}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-bold bg-gray-100">
                    {round.back9 || '--'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="px-2 py-2 bg-gray-100 border-t">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm">Total</span>
              <div className="flex items-center gap-3">
                <span className="text-sm">Par: {parFront + parBack}</span>
                <span className="font-bold text-lg">{round.total}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  // Not found state
  if (!round) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
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

  // Normalize round data
  const normalizedRound = {
    ...round,
    total: round.total_score || round.total,
    date: round.played_at || round.date,
    tee: round.tee_data || round.tee,
    holes: round.scores_by_hole || round.holes,
    coursePars: round.course_pars || round.coursePars
  }

  const vsPar = calculateVsPar(normalizedRound)
  const displayName = getDisplayName(round)
  const roundProfile = round.profiles  // Renamed from 'profile' to avoid conflict

  // Comments component
  const CommentsSection = () => {
    const displayComments = showExpandedComments ? round.comments : round.comments.slice(0, 2)

    return (
      <>
        {round.comments.length > 0 && (
          <div className="mt-3">
            <div className="space-y-2">
              {displayComments.map(comment => (
                <div key={comment.id} className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <button
                        onClick={() => comment.author_username && navigate(`/profile/${comment.author_username}`)}
                        className="font-medium text-sm text-gray-900 hover:underline"
                      >
                        {comment.author}
                      </button>
                      <p className="text-sm text-gray-700 mt-0.5">{comment.text}</p>
                    </div>
                    {comment.user_id === user?.id && (
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="text-xs text-gray-500 hover:text-red-600 ml-2"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {round.comments.length > 2 && !showExpandedComments && (
              <button
                onClick={() => setShowExpandedComments(true)}
                className="text-sm text-blue-600 hover:underline mt-2"
              >
                View all {round.comments.length} comments
              </button>
            )}
            
            {showExpandedComments && round.comments.length > 2 && (
              <button
                onClick={() => setShowExpandedComments(false)}
                className="text-sm text-gray-600 hover:underline mt-2"
              >
                Show less
              </button>
            )}
          </div>
        )}
        
        {/* Add comment input */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value.slice(0, 280))}
            onKeyPress={(e) => e.key === 'Enter' && addComment()}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-green-500"
          />
          <button
            onClick={addComment}
            disabled={!commentInput.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Post
          </button>
        </div>
        
        {commentInput.length > 250 && (
          <p className="text-xs text-gray-500 mt-1">
            {280 - commentInput.length} characters remaining
          </p>
        )}
      </>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top Bar with User Info - EXACT COPY from UserProfile */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="mr-2 p-1.5 hover:bg-gray-100 rounded-lg md:hidden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl">🏌️</span>
                <span className="font-bold text-xl text-green-700">Dogleg.io</span>
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold">
                      {profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {profile?.username || profile?.full_name || 'Profile'}
                </span>
              </button>

              <button
                onClick={signOut}
                className="text-sm text-gray-600 hover:text-gray-900"
                title="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Navigation Bar - EXACT COPY from UserProfile */}
      <div className="hidden md:block bg-white border-b border-gray-200 sticky top-14 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">📰</span>
                <span>Feed</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/')}
              className="flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">➕</span>
                <span>Add Round</span>
              </div>
            </button>

            <button
              onClick={() => navigate('/')}
              className="flex-1 py-4 px-4 text-center font-medium transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">📊</span>
                <span>My Rounds</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-4 pb-20 md:pb-4">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {/* Single round card - exact same display as Feed */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* User info with Follow button */}
          <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate(`/profile/${roundProfile?.username}`)}
                className="flex items-center gap-2 hover:opacity-80"
              >
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  {roundProfile?.avatar_url ? (
                    <img 
                      src={roundProfile.avatar_url} 
                      alt={roundProfile?.username} 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-green-700 font-semibold text-xs">
                      {roundProfile?.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-600">
                  {roundProfile?.username || 'Golfer'} posted a round
                </span>
              </button>
              
              {/* Follow button if not current user */}
              {round.user_id !== user?.id && (
                <FollowButton
                  targetUserId={round.user_id}
                  targetUsername={roundProfile?.username}
                  initialFollowing={round.isFollowing}
                  onFollowChange={(newState) => handleFollowChange(round.user_id, newState)}
                  size="small"
                />
              )}
            </div>
          </div>

          {/* Round details */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-b">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h3 className="font-bold text-lg">
                  {displayName}
                </h3>
                <p className="text-gray-600 text-sm">
                  {round.city}, {round.state}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span>{formatDate(normalizedRound.date)}</span>
                  {normalizedRound.tee && (
                    <>
                      <span>•</span>
                      <span>{formatTeeDetails(normalizedRound.tee)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold">{normalizedRound.total}</div>
                {vsPar && (
                  <div className={`text-2xl font-bold ${getScoreColor(vsPar)}`}>
                    {vsPar}
                  </div>
                )}
              </div>
            </div>
            
            {/* Score breakdown */}
            <div className="text-sm text-gray-600 mt-2">
              Front 9: <span className="font-semibold">{round.front9 || '--'}</span>
              <span className="mx-2">•</span>
              Back 9: <span className="font-semibold">{round.back9 || '--'}</span>
            </div>
          </div>

          {/* Photo */}
          {(round.photo || round.photo_url) && (
            <div className="px-2 sm:px-4 pt-2 sm:pt-4">
              <div className="aspect-video rounded-lg overflow-hidden">
                <img 
                  src={round.photo || round.photo_url} 
                  alt="Golf course or something captured from round" 
                  className="w-full h-full object-cover" 
                />
              </div>
            </div>
          )}

          {/* Scorecard */}
          {(normalizedRound.holes && normalizedRound.holes.some(h => h !== '')) && (
            <div className="px-2 sm:px-4">
              <Scorecard round={normalizedRound} />
            </div>
          )}

          {/* Caption/Comment */}
          {(round.comment || round.caption) && (
            <div className={`px-2 sm:px-4 ${(normalizedRound.holes && normalizedRound.holes.some(h => h !== '')) || (round.photo || round.photo_url) ? 'mt-2 sm:mt-4' : ''} pb-2 sm:pb-3`}>
              <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                <p className="text-sm">💬 {round.comment || round.caption}</p>
              </div>
            </div>
          )}

          {/* Actions and Social */}
          <div className="px-2 sm:px-4 pb-2 sm:pb-4">
            {/* Reactions */}
            <div className="flex flex-wrap items-center gap-1 py-3 border-y">
              {Object.entries(reactionEmojis).map(([key, emoji]) => {
                const count = round.reactions?.[key] || 0
                const hasReacted = round.userReacted.includes(key)
                
                return (
                  <button
                    key={key}
                    onClick={() => toggleReaction(round.id, key)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-sm transition-all hover:scale-110 ${
                      hasReacted ? 'bg-green-100' : ''
                    }`}
                    title={key}
                  >
                    <span className="text-base sm:text-lg">{emoji}</span>
                    {count > 0 && <span className="font-medium text-xs">{count}</span>}
                  </button>
                )
              })}
            </div>

            {/* Share button */}
            <div className="flex gap-4 pb-0.5 pt-3 text-sm text-gray-600">
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 hover:text-gray-800"
              >
                <span>🔗</span>
                <span>Share</span>
              </button>
            </div>

            {/* Comments */}
            <CommentsSection />
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* Bottom Navigation Bar (Mobile) - EXACT COPY from UserProfile */}
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
    <div className="grid grid-cols-3 h-16">
      <button
        onClick={() => navigate('/')}
        className="flex flex-col items-center justify-center gap-1 text-gray-600"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
        </svg>
        <span className="text-xs">Feed</span>
      </button>

      <button
        onClick={() => navigate('/')}
        className="flex flex-col items-center justify-center gap-1 text-gray-600"
      >
        <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center -mt-2">
          <span className="text-white text-2xl">+</span>
        </div>
        <span className="text-xs">Add</span>
      </button>

      <button
        onClick={() => navigate('/')}
        className="flex flex-col items-center justify-center gap-1 text-gray-600"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span className="text-xs">Rounds</span>
      </button>
    </div>
  </div>
</div>
)
}

export default SingleRound