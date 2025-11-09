import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import { getDisplayName } from '../utils/courseNameUtils'
import { getInitials } from '../utils/avatarUtils'


function SingleRound() {
  const { roundId } = useParams()
  const [round, setRound] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [commentInputs, setCommentInputs] = useState({})

  // Your exact reaction system from MyRounds
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
    loadSingleRound()
  }, [roundId])

  const loadSingleRound = async () => {
    setIsLoading(true)
        
    const { data: roundData, error: roundError } = await roundsService.getRoundByShortCode(roundId)
    
    
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

  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('T')[0].split('-')
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  }

  const getScoreColor = (vsPar) => {
    if (!vsPar) return 'text-gray-700'
    if (vsPar === 'E' || vsPar === 0) return 'text-gray-700'
    if (typeof vsPar === 'string' && vsPar.startsWith('+')) return 'text-orange-600'
    if (typeof vsPar === 'number' && vsPar > 0) return 'text-orange-600'
    return 'text-green-600'
  }

  const calculateVsPar = (round) => {
    if (!round.par && !round.course_pars) return null
    
    let parForHolesPlayed = round.par || 72
    
    if (round.scores_by_hole && round.scores_by_hole.some(h => h)) {
      const playedHoleIndices = []
      round.scores_by_hole.forEach((score, index) => {
        if (score !== null && score !== '' && score !== undefined) {
          playedHoleIndices.push(index)
        }
      })
      
      if (round.course_pars && playedHoleIndices.length > 0) {
        parForHolesPlayed = playedHoleIndices.reduce((sum, holeIndex) => {
          return sum + parseInt(round.course_pars[holeIndex] || 4)
        }, 0)
      } else if (playedHoleIndices.length > 0) {
        parForHolesPlayed = Math.round((round.par / 18) * playedHoleIndices.length)
      }
    } else if (round.front9 && !round.back9) {
      if (round.course_pars) {
        parForHolesPlayed = round.course_pars.slice(0, 9).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round(round.par / 2)
      }
    } else if (!round.front9 && round.back9) {
      if (round.course_pars) {
        parForHolesPlayed = round.course_pars.slice(9, 18).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round(round.par / 2)
      }
    }
    
    const diff = round.total_score - parForHolesPlayed
    if (diff === 0) return 'E'
    if (diff > 0) return `+${diff}`
    return `${diff}`
  }

  const formatTeeDetails = (tee) => {
    if (!tee) return null
    let details = tee.tee_name || tee.tee_color || 'Tees'
    details += ' tees'
    
    const extraDetails = []
    if (tee.total_length) {
      extraDetails.push(`${tee.total_length}${tee.measure_unit || 'y'}`)
    }
    if (tee.slope && tee.course_rating) {
      extraDetails.push(`${tee.slope}/${tee.course_rating}`)
    } else if (tee.slope) {
      extraDetails.push(`Slope: ${tee.slope}`)
    }
    
    if (extraDetails.length > 0) {
      details += ` • ${extraDetails.join(' • ')}`
    }
    
    return details
  }

  const CommentsSection = ({ round, roundId }) => {
    const [showAllComments, setShowAllComments] = useState(false)
    const [newComment, setNewComment] = useState('')
    
    const comments = round.comments || []
    const visibleComments = showAllComments ? comments : comments.slice(-3)
    
    const handleSubmit = (e) => {
      e.preventDefault()
      addComment(roundId, newComment)
      setNewComment('')
    }
    
    return (
      <div className={comments.length > 0 ? "pt-2" : "pt-0.5"}>
        <div className={`bg-gray-50 rounded-lg ${comments.length > 0 ? "p-3" : "p-2"}`}>
          {comments.length > 3 && !showAllComments && (
            <button
              onClick={() => setShowAllComments(true)}
              className="text-sm text-blue-600 hover:text-blue-700 mb-2"
            >
              View {comments.length - 3} more comment{comments.length - 3 !== 1 ? 's' : ''}
            </button>
          )}
          
          {visibleComments.length > 0 && (
            <div className="space-y-2 mb-3">
              {visibleComments.map(comment => (
                <div key={comment.id} className="bg-white rounded p-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {comment.author_username && comment.author_username !== 'Anonymous' ? (
                        <button
                          onClick={() => navigate(`/profile/${comment.author_username}`)}
                          className="font-semibold text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {comment.author}
                        </button>
                      ) : (
                        <span className="font-semibold text-sm text-blue-600">{comment.author}</span>
                      )}
                      <span className="text-gray-500 text-xs ml-2">• {formatDate(comment.date)}</span>
                      <p className="text-sm mt-0.5">{comment.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value.slice(0, 280))}
                placeholder="Add a comment..."
                maxLength={280}
                className="w-full px-3 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {newComment.length > 250 && (
                <span className="absolute right-3 top-2 text-xs text-gray-500">
                  {280 - newComment.length}
                </span>
              )}
            </div>
            {newComment.trim() && (
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 text-sm font-medium"
              >
                Post
              </button>
            )}
          </form>
        </div>
      </div>
    )
  }

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

  // Not found state
  if (!isLoading && !round) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden p-12 text-center">
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
        <div className="bg-green-700 text-white p-6 rounded-t-lg">
          <h1 className="text-3xl font-bold">⛳ Round Details</h1>
        </div>
        <div className="bg-white border-x border-b border-gray-200 rounded-b-lg">
          <div className="p-3 sm:p-6 bg-gray-50">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse">
              <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </div>
              </div>
              <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-b">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                  <div>
                    <div className="h-10 w-16 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
  const profile = round.profiles

  // Main render - single round display
  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <div className="bg-green-700 text-white p-6 rounded-t-lg">
        <h1 className="text-3xl font-bold">⛳ Round Details</h1>
        <button 
          onClick={() => navigate(-1)}
          className="mt-2 text-white hover:underline"
        >
          ← Back
        </button>
      </div>
      
      <div className="bg-white border-x border-b border-gray-200 rounded-b-lg">
        <div className="p-3 sm:p-6 bg-gray-50">
          <div className="space-y-3 sm:space-y-4">
            {/* YOUR EXACT ROUND DISPLAY FROM FEED */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* INTEGRATED USER INFO with Follow button */}
              <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2">
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
                          {profile?.getInitials(profile) || '?'}
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default SingleRound