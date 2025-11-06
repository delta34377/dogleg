import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import { getDisplayName } from '../utils/courseNameUtils'

function SingleRound() {
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { user, profile: userProfile, signOut } = useAuth()
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentInputs, setCommentInputs] = useState({})
  const [showExpandedComments, setShowExpandedComments] = useState({})

  // Your exact reaction emojis
  const reactionEmojis = {
    fire: '🔥',
    clap: '👏',
    dart: '🎯',
    goat: '🐐',
    vomit: '🤮',
    clown: '🤡',
    skull: '💀',
    laugh: '😂'
  }

  useEffect(() => {
    loadRoundData()
  }, [roundId])

  const loadRoundData = async () => {
    setLoading(true)
    
    // Get the round
    const { data: roundData, error: roundError } = await roundsService.getRound(roundId)
    
    if (!roundData || roundError) {
      setLoading(false)
      return
    }

    // Get reactions, comments, and user reactions - exactly like Feed does
    const [reactionsData, commentsData, userReactionsData] = await Promise.all([
      roundsService.getReactions([roundId]),
      roundsService.getComments([roundId]),
      user ? roundsService.getUserReactions([roundId]) : { data: [] }
    ])
    
    const reactions = reactionsData.data || []
    const comments = commentsData.data || []
    const userReactions = userReactionsData.data || []
    
    // Check follow status
    let followStatus = {}
    if (roundData.user_id !== user?.id) {
      followStatus = await followService.getFollowStatuses([roundData.user_id])
    }
    
    // Count reactions by type
    const reactionCounts = {
      fire: 0, clap: 0, dart: 0, goat: 0,
      vomit: 0, clown: 0, skull: 0, laugh: 0
    }
    
    reactions.forEach(r => {
      if (reactionCounts.hasOwnProperty(r.reaction_type)) {
        reactionCounts[r.reaction_type]++
      }
    })
    
    // Format round exactly like Feed does
    const formattedRound = {
      ...roundData,
      reactions: reactionCounts,
      comments: comments.map(c => ({
        id: c.id,
        text: c.content || c.comment_text,
        author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
        author_username: c.profiles?.username || null,
        author_avatar: c.profiles?.avatar_url,
        date: c.created_at,
        user_id: c.user_id
      })),
      userReacted: userReactions.filter(r => r.round_id === roundId).map(r => r.reaction_type) || [],
      isFollowing: followStatus[roundData.user_id] || false
    }
    
    setRounds([formattedRound])
    setLoading(false)
  }

  // Your exact toggleReaction from Feed
  const toggleReaction = async (roundId, reaction) => {
    const previousRounds = rounds
    
    setRounds(prevRounds =>
      prevRounds.map(round => {
        if (round.id === roundId) {
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
          
          return { ...round, reactions: newReactions, userReacted: newUserReacted }
        }
        return round
      })
    )
    
    const { error } = await roundsService.saveReaction(roundId, reaction)
    
    if (error) {
      console.error('Failed to save reaction:', error)
      setRounds(previousRounds)
    }
  }

  // Your exact addComment from Feed
  const addComment = async (roundId, text) => {
    if (!text.trim()) return
    
    const { data, error } = await roundsService.saveComment(roundId, text)
    
    if (!error && data) {
      setRounds(prevRounds =>
        prevRounds.map(round => {
          if (round.id === roundId) {
            const newComment = {
              id: data.id,
              text: data.content,
              author: data.profiles?.username || data.profiles?.full_name || 'Anonymous',
              author_username: data.profiles?.username || null,
              author_avatar: data.profiles?.avatar_url,
              date: data.created_at,
              user_id: data.user_id
            }
            return { ...round, comments: [...round.comments, newComment] }
          }
          return round
        })
      )
      
      setCommentInputs(prev => ({ ...prev, [roundId]: '' }))
    }
  }

  const deleteComment = async (roundId, commentId) => {
    if (window.confirm('Delete this comment?')) {
      const { error } = await roundsService.deleteComment(commentId)
      if (!error) {
        setRounds(prevRounds =>
          prevRounds.map(round => {
            if (round.id === roundId) {
              return {
                ...round,
                comments: round.comments.filter(c => c.id !== commentId)
              }
            }
            return round
          })
        )
      }
    }
  }

  const handleFollowChange = (userId, newState) => {
    setRounds(prevRounds =>
      prevRounds.map(round => {
        if (round.user_id === userId) {
          return { ...round, isFollowing: newState }
        }
        return round
      })
    )
  }

  // Your exact helper functions from Feed
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTeeDetails = (tee) => {
    if (!tee) return ''
    const parts = []
    if (tee.TeeName) {
      parts.push(tee.TeeName)
    } else if (tee.TeeColor) {
      parts.push(tee.TeeColor)
    }
    if (tee.Slope && tee.CR) {
      parts.push(`${tee.Slope}/${tee.CR}`)
    }
    return parts.join(' • ')
  }

  const calculateVsPar = (round) => {
    if (!round.total) return null
    const par = round.par || 72
    const total = round.total
    const diff = total - par
    
    if (diff === 0) return 'E'
    if (diff > 0) return `+${diff}`
    return `${diff}`
  }

  const getScoreColor = (vsPar) => {
    if (!vsPar) return 'text-gray-500'
    if (vsPar === 'E') return 'text-gray-600'
    const num = parseInt(vsPar)
    if (num < 0) return 'text-red-600'
    if (num > 0) return 'text-blue-600'
    return 'text-gray-600'
  }

  // Your exact CommentsSection from Feed
  const CommentsSection = ({ round, roundId }) => {
    const showExpanded = showExpandedComments[roundId] || false
    const comments = round.comments || []
    const displayComments = showExpanded ? comments : comments.slice(0, 2)
    const inputValue = commentInputs[roundId] || ''

    return (
      <div className="mt-3">
        {comments.length > 0 && (
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
                      onClick={() => deleteComment(roundId, comment.id)}
                      className="text-xs text-gray-500 hover:text-red-600 ml-2"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {comments.length > 2 && !showExpanded && (
              <button
                onClick={() => setShowExpandedComments(prev => ({ ...prev, [roundId]: true }))}
                className="text-sm text-blue-600 hover:underline"
              >
                View all {comments.length} comments
              </button>
            )}
            
            {showExpanded && comments.length > 2 && (
              <button
                onClick={() => setShowExpandedComments(prev => ({ ...prev, [roundId]: false }))}
                className="text-sm text-gray-600 hover:underline"
              >
                Show less
              </button>
            )}
          </div>
        )}
        
        <form 
          onSubmit={(e) => {
            e.preventDefault()
            addComment(roundId, inputValue)
          }}
          className="mt-3"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setCommentInputs(prev => ({ ...prev, [roundId]: e.target.value.slice(0, 280) }))}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-green-500"
            />
            {inputValue.trim() && (
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Post
              </button>
            )}
          </div>
          {inputValue.length > 250 && (
            <p className="text-xs text-gray-500 mt-1">
              {280 - inputValue.length} characters remaining
            </p>
          )}
        </form>
      </div>
    )
  }

  // Your exact Scorecard from Feed
  const Scorecard = ({ round }) => {
    const pars = round.coursePars || round.course_pars || Array(18).fill(4)
    
    const getScoreStyle = (score, par) => {
      if (!score || score === '') return { backgroundColor: 'white', color: '#999' }
      
      const diff = parseInt(score) - parseInt(par)
      if (diff <= -2) return { backgroundColor: '#0d7d0d', color: '#fff' }
      if (diff === -1) return { backgroundColor: '#4caf50', color: '#fff' }
      if (diff === 0) return { backgroundColor: 'white', color: '#333' }
      if (diff === 1) return { backgroundColor: '#ffcdd2', color: '#333' }
      if (diff === 2) return { backgroundColor: '#ef5350', color: '#fff' }
      return { backgroundColor: '#c62828', color: '#fff' }
    }
    
    return (
      <div className="my-4">
        <div className="bg-gray-100 px-4 py-2 rounded-t-lg">
          <h3 className="text-sm font-bold text-gray-700">SCORECARD</h3>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-b-lg p-4">
          <div className="mb-4">
            <div className="bg-gray-50 px-2 py-1 rounded mb-2">
              <div className="text-xs font-semibold text-gray-600">FRONT 9</div>
            </div>
            <div className="grid grid-cols-10 gap-1 text-center text-xs">
              <div className="contents">
                {[...Array(9)].map((_, i) => (
                  <div key={`f9-hole-${i}`} className="text-gray-600 font-medium">
                    {i + 1}
                  </div>
                ))}
                <div className="text-gray-600 font-bold">OUT</div>
              </div>
              
              <div className="contents">
                {pars.slice(0, 9).map((par, i) => (
                  <div key={`f9-par-${i}`} className="text-gray-500 bg-gray-50 py-1 rounded text-xs">
                    P{par}
                  </div>
                ))}
                <div className="text-gray-500 bg-gray-50 py-1 rounded text-xs font-bold">
                  {pars.slice(0, 9).reduce((sum, p) => sum + parseInt(p), 0)}
                </div>
              </div>
              
              <div className="contents">
                {round.holes || round.scores_by_hole ? (
                  <>
                    {(round.holes || round.scores_by_hole).slice(0, 9).map((score, i) => {
                      const style = getScoreStyle(score, pars[i])
                      return (
                        <div 
                          key={`f9-score-${i}`} 
                          className="py-2 rounded font-medium"
                          style={style}
                        >
                          {score || '-'}
                        </div>
                      )
                    })}
                    <div className="py-2 bg-gray-900 text-white font-bold rounded">
                      {round.front9 || '--'}
                    </div>
                  </>
                ) : (
                  <>
                    {[...Array(9)].map((_, i) => (
                      <div key={`f9-empty-${i}`} className="py-2 bg-white border rounded text-gray-300">-</div>
                    ))}
                    <div className="py-2 bg-gray-900 text-white font-bold rounded">
                      {round.front9 || '--'}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="bg-gray-50 px-2 py-1 rounded mb-2">
              <div className="text-xs font-semibold text-gray-600">BACK 9</div>
            </div>
            <div className="grid grid-cols-10 gap-1 text-center text-xs">
              <div className="contents">
                {[...Array(9)].map((_, i) => (
                  <div key={`b9-hole-${i}`} className="text-gray-600 font-medium">
                    {i + 10}
                  </div>
                ))}
                <div className="text-gray-600 font-bold">IN</div>
              </div>
              
              <div className="contents">
                {pars.slice(9, 18).map((par, i) => (
                  <div key={`b9-par-${i}`} className="text-gray-500 bg-gray-50 py-1 rounded text-xs">
                    P{par}
                  </div>
                ))}
                <div className="text-gray-500 bg-gray-50 py-1 rounded text-xs font-bold">
                  {pars.slice(9, 18).reduce((sum, p) => sum + parseInt(p), 0)}
                </div>
              </div>
              
              <div className="contents">
                {round.holes || round.scores_by_hole ? (
                  <>
                    {(round.holes || round.scores_by_hole).slice(9, 18).map((score, i) => {
                      const style = getScoreStyle(score, pars[i + 9])
                      return (
                        <div 
                          key={`b9-score-${i}`} 
                          className="py-2 rounded font-medium"
                          style={style}
                        >
                          {score || '-'}
                        </div>
                      )
                    })}
                    <div className="py-2 bg-gray-900 text-white font-bold rounded">
                      {round.back9 || '--'}
                    </div>
                  </>
                ) : (
                  <>
                    {[...Array(9)].map((_, i) => (
                      <div key={`b9-empty-${i}`} className="py-2 bg-white border rounded text-gray-300">-</div>
                    ))}
                    <div className="py-2 bg-gray-900 text-white font-bold rounded">
                      {round.back9 || '--'}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Legend */}
<div className="flex flex-wrap gap-2 sm:gap-3 text-[9px] sm:text-xs mt-3 pt-3 border-t justify-left">
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded" style={{backgroundColor: '#0d7d0d'}}></div>
    <span className="text-gray-600">Eagle-</span>
  </div>
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded" style={{backgroundColor: '#4caf50'}}></div>
    <span className="text-gray-600">Birdie</span>
  </div>
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded border border-gray-300" style={{backgroundColor: 'white'}}></div>
    <span className="text-gray-600">Par</span>
  </div>
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded" style={{backgroundColor: '#ffcdd2'}}></div>
    <span className="text-gray-600">Bogey</span>
  </div>
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded" style={{backgroundColor: '#ef5350'}}></div>
    <span className="text-gray-600">Double</span>
  </div>
  <div className="flex items-center gap-1">
    <div className="w-3 h-3 rounded" style={{backgroundColor: '#c62828'}}></div>
    <span className="text-gray-600">Triple+</span>
  </div>
</div>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  // Not found state  
  if (rounds.length === 0) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
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

  // Main render - using the EXACT page structure from UserProfile pages in App.js
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top Bar with User Info - EXACT COPY from UserProfile in App.js */}
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
                {userProfile?.avatar_url ? (
                  <img 
                    src={userProfile.avatar_url} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold">
                      {userProfile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {userProfile?.username || userProfile?.full_name || 'Profile'}
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

      {/* Desktop Navigation Bar - EXACT COPY from UserProfile in App.js */}
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
            
            {/* Display the round - EXACT CODE FROM FEED lines 655-815 */}
            {rounds.map((round) => {
              // Normalize round data - exactly from Feed
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
              const profile = round.profiles
              
              return (
<div key={round.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
  {/* INTEGRATED USER INFO with Follow button */}
  <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
    
    {/* Discovery indicator - NOW AT THE TOP */}
    {round.source === 'discover' && round.reason && (
      <div className="mb-2">
        <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
          {round.reason === 'Near courses you\'ve played' 
            ? '📍 Near courses you\'ve played'
            : '🔥 Popular round'
          }
        </span>
      </div>
    )}
    
    <div className="flex items-center justify-between">
      <button
        onClick={() => navigate(`/profile/${profile?.username}`)}
        className="flex items-center gap-2 hover:opacity-80"
      >
        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={profile?.username} 
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-green-700 font-semibold text-xs">
              {profile?.username?.[0]?.toUpperCase() || '?'}
            </span>
          )}
        </div>
        <span className="text-sm text-gray-600">
          {profile?.username || 'Golfer'} posted a round
        </span>
      </button>
      
      {/* Add Follow button if not current user */}
      {round.user_id !== user?.id && (
        <FollowButton
          targetUserId={round.user_id}
          targetUsername={profile?.username}
          initialFollowing={round.isFollowing}
          onFollowChange={(newState) => handleFollowChange(round.user_id, newState)}
          size="small"
        />
      )}
    </div>
  </div>

  {/* EXACT SAME ROUND CARD AS MYROUNDS */}
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
      {/* NO DELETE BUTTON FOR FEED */}
    </div>
    
    {/* Score breakdown */}
    <div className="text-sm text-gray-600 mt-2">
      Front 9: <span className="font-semibold">{round.front9 || '--'}</span>
      <span className="mx-2">•</span>
      Back 9: <span className="font-semibold">{round.back9 || '--'}</span>
    </div>
  </div>

  {/* Real photos only */}
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

  {/* Scorecard - only if hole-by-hole scores exist */}
  {(normalizedRound.holes && normalizedRound.holes.some(h => h !== '')) && (
    <div className="px-2 sm:px-4">
      <Scorecard round={normalizedRound} />
    </div>
  )}

  {/* Notes with comment emoji - EXACT AMBER STYLING */}
  {(round.comment || round.caption) && (
    <div className={`px-2 sm:px-4 ${(normalizedRound.holes && normalizedRound.holes.some(h => h !== '')) || (round.photo || round.photo_url) ? 'mt-2 sm:mt-4' : ''} pb-2 sm:pb-3`}>
      <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
        <p className="text-sm">💬 {round.comment || round.caption}</p>
      </div>
    </div>
  )}

  {/* Actions and Social */}
  <div className="px-2 sm:px-4 pb-2 sm:pb-4">
    {/* Reactions - EXACT STYLING */}
    <div className="flex flex-wrap items-center gap-1 py-3 border-y">
      {Object.entries(reactionEmojis).map(([key, emoji]) => {
        const count = round.reactions?.[key] || 0
        const hasReacted = round.userReacted.includes(key)
        
        return (
          <button
            key={key}
            onClick={() => toggleReaction(round.id, key)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-sm transition-all hover:scale-110 ${
              hasReacted 
                ? 'bg-green-100' 
                : ''
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
        onClick={async () => {
          const shareUrl = `${window.location.origin}/rounds/${round.id}`
          
          if (navigator.share) {
            try {
              await navigator.share({
                title: 'Check out this golf round on Dogleg',
                url: shareUrl
              })
            } catch (err) {
              if (err.name !== 'AbortError') {
                navigator.clipboard.writeText(shareUrl)
                alert('Link copied to clipboard!')
              }
            }
          } else {
            navigator.clipboard.writeText(shareUrl)
            alert('Link copied to clipboard!')
          }
        }}
        className="flex items-center gap-2 hover:text-gray-800"
      >
        <span>🔗</span>
        <span>Share</span>
      </button>
    </div>

    {/* Comments with EXACT gray background */}
    <CommentsSection round={round} roundId={round.id} />
  </div>
</div>
              )
            })}
            
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar (Mobile) - EXACT COPY from UserProfile in App.js */}
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