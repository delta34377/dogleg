import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import FollowButton from './FollowButton'

const Feed = forwardRef((props, ref) => {
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const { user } = useAuth()
  const navigate = useNavigate()

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: () => {
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // Reset state and reload feed
      setRounds([])
      setOffset(0)
      setHasMore(true)
      loadFeed(false)
    }
  }))

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

  const loadFeed = async (loadMore = false) => {
    if (isLoading) return
    
    setIsLoading(true)
    const currentOffset = loadMore ? offset : 0
    
    // Get feed rounds with discovery
    const { data: feedData, error } = await roundsService.getFeedWithDiscovery(10, currentOffset, 'mixed', 0.3)
    
    if (!error && feedData) {
      const feedRounds = feedData.rounds || []
      
      if (feedRounds.length < 10) {
        setHasMore(false)
      }
      
      const roundIds = feedRounds.map(r => r.id)
      
      if (roundIds.length > 0) {
        // IMPORTANT FIX: Fetch reactions, comments, and userReactions separately
        // since getFeedWithDiscovery might not include them
        const [reactionsData, commentsData, userReactionsData] = await Promise.all([
          roundsService.getReactions(roundIds),
          roundsService.getComments(roundIds),
          user ? roundsService.getUserReactions(roundIds) : { data: [] }
        ])
        
        const reactions = reactionsData.data || []
        const comments = commentsData.data || []
        const userReactions = userReactionsData.data || []
        
        // Get follow statuses in one batch call
        const uniqueUserIds = [...new Set(feedRounds.map(r => r.user_id).filter(id => id !== user?.id))]
        const followStatuses = uniqueUserIds.length > 0 
          ? await followService.getFollowStatuses(uniqueUserIds)
          : {}
        
        const formattedRounds = feedRounds.map(round => {
          // Use the separately fetched reactions/comments
          const roundReactions = reactions.filter(r => r.round_id === round.id) || []
          const reactionCounts = {
            fire: 0, clap: 0, dart: 0, goat: 0,
            vomit: 0, clown: 0, skull: 0, laugh: 0
          }
          
          roundReactions.forEach(r => {
            if (reactionCounts.hasOwnProperty(r.reaction_type)) {
              reactionCounts[r.reaction_type]++
            }
          })
          
          const roundComments = comments.filter(c => c.round_id === round.id) || []
          const myReactions = userReactions.filter(r => r.round_id === round.id).map(r => r.reaction_type) || []
          
          return {
            ...round,
            reactions: reactionCounts,
            comments: roundComments.map(c => ({
  id: c.id,
  text: c.content || c.comment_text,
  author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
  author_username: c.profiles?.username || null,  // <-- ADD THIS LINE
  author_avatar: c.profiles?.avatar_url,
  date: c.created_at,
  user_id: c.user_id
})),
            userReacted: myReactions || [],
            isFollowing: followStatuses[round.user_id] || false,
            source: round.source || 'following',
            reason: round.reason || null
          }
        })
        
        if (loadMore) {
          setRounds(prev => {
            const existingIds = new Set(prev.map(r => r.id))
            const newRounds = formattedRounds.filter(r => !existingIds.has(r.id))
            return [...prev, ...newRounds]
          })
          setOffset(prev => prev + feedRounds.length)
        } else {
          setRounds(formattedRounds)
          setOffset(feedRounds.length)
        }
      }
    }
    
    setIsLoading(false)
  }

  // Load more rounds when scrolling
  const handleScroll = useCallback(() => {
    if (isLoading || !hasMore) return
    
    const scrolledToBottom = 
      window.innerHeight + document.documentElement.scrollTop 
      >= document.documentElement.offsetHeight - 200
    
    if (scrolledToBottom) {
      loadFeed(true)
    }
  }, [isLoading, hasMore, offset])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  useEffect(() => {
    loadFeed()
  }, [])

  const toggleReaction = async (roundId, reaction) => {
    // Store previous state in case we need to revert
    const previousRounds = rounds
    
    // Optimistically update UI immediately
    setRounds(prevRounds =>
      prevRounds.map(round => {
        if (round.id === roundId) {
          const newReactions = { ...round.reactions }
          const newUserReacted = [...round.userReacted]
          
          // Check if user already reacted
          const hasReacted = round.userReacted.includes(reaction)
          
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
          
          return { ...round, reactions: newReactions, userReacted: newUserReacted }
        }
        return round
      })
    )
    
    // Now save to database
    const { error } = await roundsService.saveReaction(roundId, reaction)
    
    // If error, revert the optimistic update
    if (error) {
      console.error('Failed to save reaction:', error)
      setRounds(previousRounds)
      // Optionally show a toast/alert to user
    }
    // If success, do nothing - UI already updated
  }

  const [commentInputs, setCommentInputs] = useState({})
  
  const addComment = async (roundId, text) => {
    if (!text.trim()) return
    
    const { data, error } = await roundsService.saveComment(roundId, text)
    
    if (!error && data) {
      setRounds(prevRounds =>
        prevRounds.map(round => {
          if (round.id === roundId) {
            return {
              ...round,
              comments: [...round.comments, {
                id: data.id,
                text: data.content,
                author: data.profiles?.username || data.profiles?.full_name || 'Anonymous',
                  author_username: data.profiles?.username || null,  // <-- ADD THIS LINE
                author_avatar: data.profiles?.avatar_url,
                date: data.created_at,
                user_id: data.user_id
              }]
            }
          }
          return round
        })
      )
    }
  }

  // Handle follow state changes
  const handleFollowChange = (userId, isNowFollowing) => {
    setRounds(prevRounds =>
      prevRounds.map(round => {
        if (round.user_id === userId) {
          return { ...round, isFollowing: isNowFollowing }
        }
        return round
      })
    )
  }

  // Exact same date formatting as MyRounds
  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('T')[0].split('-')
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  }

  // Exact same vs par color logic as MyRounds
  const getScoreColor = (vsPar) => {
    if (!vsPar) return 'text-gray-700'
    if (vsPar === 'E' || vsPar === 0) return 'text-gray-700'
    if (typeof vsPar === 'string' && vsPar.startsWith('+')) return 'text-orange-600'
    if (typeof vsPar === 'number' && vsPar > 0) return 'text-orange-600'
    return 'text-green-600'
  }

  // Exact calculateVsPar from MyRounds
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

  // Exact getDisplayName from MyRounds
  const getDisplayName = (round) => {
    const courseName = round.course_name
    const clubName = round.club_name
    
    // Handle missing or unknown names
    if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
      return clubName || 'Unknown Course'
    }
    
    if (!clubName) return courseName
    
    // Check if course name is very similar to club name (likely single course)
    // Clean up names for comparison
    const cleanCourse = courseName.toLowerCase()
      .replace(/golf|club|country|cc|course|resort|links/gi, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
    
    const cleanClub = clubName.toLowerCase()
      .replace(/golf|club|country|cc|course|resort|links/gi, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
    
    // Get significant words (longer than 2 chars)
    const courseWords = cleanCourse.split(' ').filter(w => w.length > 2)
    const clubWords = cleanClub.split(' ').filter(w => w.length > 2)
    
    // Check overlap - if most course words appear in club name, it's likely single course
    if (courseWords.length > 0) {
      const matchingWords = courseWords.filter(word => 
        clubWords.some(clubWord => clubWord.includes(word) || word.includes(clubWord))
      )
      
      // If 70% or more of course words match club words, it's probably single course
      if (matchingWords.length / courseWords.length >= 0.7) {
        return clubName // Just show club name for single course clubs
      }
    }
    
    // Multi-course club or distinct names - show "Course @ Club" format
    return `${courseName} @ ${clubName}`
  }

  // Exact formatTeeDetails from MyRounds
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

  // EXACT CommentsSection from MyRounds
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
    <div className="pt-4">
      <div className="bg-gray-50 rounded-lg p-4">
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
                    {/* Make username clickable if we have the username */}
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

  // EXACT Scorecard from MyRounds
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
          <div className="flex flex-wrap gap-3 text-xs mt-3 pt-3 border-t">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{backgroundColor: '#0d7d0d'}}></div>
              <span className="text-gray-600">Eagle-</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{backgroundColor: '#4caf50'}}></div>
              <span className="text-gray-600">Birdie</span>
            </div>
            <div className="text-gray-600">Par</div>
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

  if (rounds.length === 0 && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-green-700 text-white p-6 rounded-t-lg">
          <h1 className="text-3xl font-bold">📰 Feed</h1>
          <p className="mt-2">See rounds from golfers you follow</p>
        </div>
        
        <div className="bg-white border-x border-b border-gray-200 rounded-b-lg">
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">🏌️</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds in your feed yet</h2>
            <p className="text-gray-500 mb-6">
              Start following other golfers to see their rounds here!
            </p>
            <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Find Golfers to Follow
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <div className="bg-green-700 text-white p-6 rounded-t-lg">
        <h1 className="text-3xl font-bold">📰 Feed</h1>
        <p className="mt-2">See rounds from golfers you follow</p>
      </div>
      
      <div className="bg-white border-x border-b border-gray-200 rounded-b-lg">
        <div className="p-3 sm:p-6 bg-gray-50">
          <div className="space-y-3 sm:space-y-4">
            {isLoading && rounds.length === 0 ? (
              // Show skeleton cards while loading initial data
              <>
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse">
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
                    <div className="px-2 sm:px-4 py-4">
                      <div className="h-32 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              rounds.map((round) => {
              // Ensure consistent field names for MyRounds functions
              const normalizedRound = {
                ...round,
                total: round.total_score || round.total,
                date: round.played_at || round.date,
                tee: round.tee_data || round.tee,
                holes: round.scores_by_hole || round.holes,
                coursePars: round.course_pars || round.coursePars
              }
              
              const vsPar = calculateVsPar(normalizedRound)
              const displayName = getDisplayName(round)  // Use original round for name logic
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
                    <div className="flex gap-4 py-3 text-sm text-gray-600">
                      <button className="flex items-center gap-2 hover:text-gray-800">
                        <span>🔗</span>
                        <span>Share</span>
                      </button>
                    </div>

                    {/* Comments with EXACT gray background */}
                    <CommentsSection round={round} roundId={round.id} />
                  </div>
                </div>
              )
            })
            )}
          </div>
        </div>
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="text-gray-500 text-sm mt-2">Loading more rounds...</p>
          </div>
        )}
        
        {/* End of rounds message */}
        {!hasMore && rounds.length > 0 && (
          <div className="text-center py-4 text-gray-500 text-sm">
            You've reached the end of your feed
          </div>
        )}
      </div>
    </div>
  )
})

export default Feed