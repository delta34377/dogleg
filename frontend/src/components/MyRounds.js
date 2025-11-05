import { useState, useEffect, useCallback } from 'react'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { getDisplayName } from '../utils/courseNameUtils' 



function MyRounds() {
  const { user, profile } = useAuth() 
  const navigate = useNavigate()
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  
  // Your exact reaction system from Feed
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
  
  // Profile stats state
  const [profileStats, setProfileStats] = useState({
    followersCount: 0,
    followingCount: 0,
    roundsCount: 0
  })
  const [showFollowers, setShowFollowers] = useState(false)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followersList, setFollowersList] = useState([])
  const [followingList, setFollowingList] = useState([])
  const [commentInputs, setCommentInputs] = useState({})
  
  // Load profile stats
  const loadProfileStats = async () => {
    if (!user) return
    
    const counts = await followService.getFollowCounts(user.id)
    
     // Get the actual rounds count from database
  const { count: roundsCount } = await supabase
    .from('rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  
  setProfileStats({
    followersCount: counts.followers,
    followingCount: counts.following,
    roundsCount: roundsCount || 0
  })
}

  // Update profile stats when rounds change
  useEffect(() => {
    setProfileStats(prev => ({ ...prev, roundsCount: rounds.length }))
  }, [rounds])

  // Load profile stats on mount
  useEffect(() => {
    loadProfileStats()
  }, [user])
  
  const loadRounds = async (loadMore = false) => {
  if (isLoading) return
  
  setIsLoading(true)
  const currentOffset = loadMore ? offset : 0
  
  // ONE CALL instead of 4!
  const { data: roundsData, error } = await roundsService.getMyRoundsWithEverything(10, currentOffset)
  
  if (!error && roundsData) {
    const dbRounds = roundsData.rounds || []
    
    // If we got less than 10, there are no more to load
    if (dbRounds.length < 10) {
      setHasMore(false)
    }
    
    if (dbRounds.length > 0) {
      // Map database format to our component format
      const formattedRounds = dbRounds.map(round => {
        // Use the data we already fetched from the RPC
        const roundReactions = roundsData.reactions?.filter(r => r.round_id === round.id) || []
        const reactionCounts = {
          fire: 0, clap: 0, dart: 0, goat: 0,
          vomit: 0, clown: 0, skull: 0, laugh: 0
        }
        roundReactions.forEach(r => {
          if (reactionCounts.hasOwnProperty(r.reaction_type)) {
            reactionCounts[r.reaction_type]++
          }
        })
        
        // Get comments for this round
        const roundComments = roundsData.comments?.filter(c => c.round_id === round.id) || []
        
        // Get user's own reactions from the already-fetched data
        const myReactions = roundsData.userReactions?.filter(r => r.round_id === round.id).map(r => r.reaction_type) || []
        
        return {
          id: round.id,
          course_id: round.course_id,
          course_name: round.course_name,
          club_name: round.club_name,
          city: round.city,
          state: round.state,
          date: round.played_at,
          front9: round.front9,
          back9: round.back9,
          total: round.total_score,
          holes: round.scores_by_hole || [],
          par: round.par,
          coursePars: round.course_pars,
          tee: round.tee_data,
          comment: round.caption,
          photo: round.photo_url,
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
          userReacted: myReactions
        }
      })
      
      if (loadMore) {
        // Append to existing rounds, but filter out duplicates
        setRounds(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newRounds = formattedRounds.filter(r => !existingIds.has(r.id))
          return [...prev, ...newRounds]
        })
        setOffset(prev => prev + dbRounds.length)
      } else {
        // Replace rounds (initial load)
        setRounds(formattedRounds)
        setOffset(dbRounds.length)
      }
    }
  }
  
  setIsLoading(false)
}

  // Load more rounds when scrolling
  const handleScroll = useCallback(() => {
    if (isLoading || !hasMore) return
    
    // Check if user scrolled near bottom (200px from bottom)
    const scrolledToBottom = 
      window.innerHeight + document.documentElement.scrollTop 
      >= document.documentElement.offsetHeight - 200
    
    if (scrolledToBottom) {
      loadRounds(true)
    }
  }, [isLoading, hasMore, offset])

  // Set up scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Initial load
  useEffect(() => {
    loadRounds()
  }, [])

  const deleteRound = async (roundId) => {
    if (window.confirm('Are you sure you want to delete this round?')) {
      const { error } = await roundsService.deleteRound(roundId)
      
      if (!error) {
        // Remove from state
        setRounds(rounds.filter(r => r.id !== roundId))
      } else {
        alert('Error deleting round. Please try again.')
      }
    }
  }

  // In toggleReaction - update UI FIRST
const toggleReaction = async (roundId, reaction) => {
  // Optimistically update UI immediately
  setRounds(prevRounds =>
    prevRounds.map(round => {
      if (round.id === roundId) {
        const hasReacted = round.userReacted.includes(reaction)
        const newReactions = { ...round.reactions }
        const newUserReacted = [...round.userReacted]
        
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
  
  // THEN save to database (no need to update state again on success)
  const { error } = await roundsService.saveReaction(roundId, reaction)
  
  // Only revert if error
  if (error) {
    // Revert the optimistic update
    loadRounds() // or revert just that round
  }
}

  const addComment = async (roundId, text) => {
    if (!text.trim()) return
    
    const { data, error } = await roundsService.saveComment(roundId, text)
    
    if (!error && data) {
      // Update local state with user info from database
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

  // Exact same date formatting as Feed
  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('T')[0].split('-')
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  }

  // Exact same vs par color logic as Feed
  const getScoreColor = (vsPar) => {
    if (!vsPar) return 'text-gray-700'
    if (vsPar === 'E' || vsPar === 0) return 'text-gray-700'
    if (typeof vsPar === 'string' && vsPar.startsWith('+')) return 'text-orange-600'
    if (typeof vsPar === 'number' && vsPar > 0) return 'text-orange-600'
    return 'text-green-600'
  }

  // Exact calculateVsPar from Feed
  const calculateVsPar = (round) => {
    if (!round.par && !round.coursePars) return null
    
    let parForHolesPlayed = round.par || 72
    
    if (round.holes && round.holes.some(h => h)) {
      const playedHoleIndices = []
      round.holes.forEach((score, index) => {
        if (score !== null && score !== '' && score !== undefined) {
          playedHoleIndices.push(index)
        }
      })
      
      if (round.coursePars && playedHoleIndices.length > 0) {
        parForHolesPlayed = playedHoleIndices.reduce((sum, holeIndex) => {
          return sum + parseInt(round.coursePars[holeIndex] || 4)
        }, 0)
      } else if (playedHoleIndices.length > 0) {
        parForHolesPlayed = Math.round((round.par / 18) * playedHoleIndices.length)
      }
    } else if (round.front9 && !round.back9) {
      if (round.coursePars) {
        parForHolesPlayed = round.coursePars.slice(0, 9).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round(round.par / 2)
      }
    } else if (!round.front9 && round.back9) {
      if (round.coursePars) {
        parForHolesPlayed = round.coursePars.slice(9, 18).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round(round.par / 2)
      }
    }
    
    const diff = round.total - parForHolesPlayed
    if (diff === 0) return 'E'
    if (diff > 0) return `+${diff}`
    return `${diff}`
  }

  // Exact formatTeeDetails from Feed
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

  // EXACT CommentsSection from Feed
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
    <div className="pt-2">
      <div className="bg-gray-50 rounded-lg p-3">
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

  // EXACT Scorecard from Feed
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
                {round.holes ? (
                  <>
                    {round.holes.slice(0, 9).map((score, i) => {
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
                {round.holes ? (
                  <>
                    {round.holes.slice(9, 18).map((score, i) => {
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

  // UserListModal Component
  const UserListModal = ({ title, users, onClose }) => {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{title}</h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
          {users.length === 0 ? (
            <p className="text-gray-500">No {title.toLowerCase()} yet</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                  onClick={() => {
                    navigate(`/profile/${user.username}`)
                    onClose()
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      {user.avatar_url ? (
                        <img 
                          src={user.avatar_url} 
                          alt={user.username} 
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-green-700 font-semibold">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold">{user.username}</p>
                      {user.full_name && (
                        <p className="text-sm text-gray-600">{user.full_name}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      
{/* Profile Section - COMPACT MOBILE VERSION */}
<div className="bg-white rounded-lg shadow-sm mb-3 sm:mb-4">
  <div className="p-3 sm:p-6">
    <div className="flex flex-row items-center gap-3 sm:gap-4">
      <div className="w-12 h-12 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
        {profile?.avatar_url ? (
          <img 
            src={profile.avatar_url} 
            alt={profile?.username} 
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="text-green-700 font-semibold text-sm sm:text-2xl">
            {profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-base sm:text-2xl font-bold truncate">{profile?.username || 'Golfer'}</h2>
        {profile?.full_name && (
          <p className="text-xs sm:text-base text-gray-600 truncate">{profile.full_name}</p>
        )}
        {profile?.bio && (
          <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2 line-clamp-2">{profile.bio}</p>
        )}
      </div>
    </div>
    
    {/* Stats - more compact on mobile */}
    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t flex justify-around text-center">
      <div>
        <span className="font-bold text-base sm:text-lg">{profileStats.roundsCount}</span>
        <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">rounds</span>
      </div>
      <button 
        onClick={async () => {
          const { data } = await followService.getFollowers(user.id)
          setFollowersList(data || [])
          setShowFollowers(true)
        }}
        className="hover:underline"
      >
        <span className="font-bold text-base sm:text-lg">{profileStats.followersCount}</span>
        <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">followers</span>
      </button>
      <button 
        onClick={async () => {
          const { data } = await followService.getFollowing(user.id)
          setFollowingList(data || [])
          setShowFollowing(true)
        }}
        className="hover:underline"
      >
        <span className="font-bold text-base sm:text-lg">{profileStats.followingCount}</span>
        <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">following</span>
      </button>
    </div>
  </div>
</div>

{/* Rounds Section - NO GREEN HEADER */}
<div className="bg-white rounded-lg shadow-sm overflow-hidden">
  {/* Container - now with rounded top corners */}
  <div className="rounded-lg border border-gray-200">
    {isLoading && rounds.length === 0 ? (
  // Show skeleton cards while loading initial data
  <div className="p-3 sm:p-6 bg-gray-50 rounded-lg">
    <div className="space-y-3 sm:space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden animate-pulse">
          <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-3 sm:pb-4 border-b">
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
    </div>
  </div>
) : rounds.length === 0 ? (
  // Empty state (only show after loading is done)
  <div className="p-12 text-center">
    <div className="text-6xl mb-4">🏌️</div>
    <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds yet</h2>
    <p className="text-gray-500 mb-6">
      Start tracking your golf rounds by searching for a course and entering your score!
    </p>
    <button 
      onClick={() => navigate('/')}
      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
    >
      Add Your First Round
    </button>
  </div>
) : (
      // Rounds container
      <div className="p-3 sm:p-6 bg-gray-50 rounded-lg">
        <div className="space-y-3 sm:space-y-4">
          {/* ... rest of your rounds mapping code stays the same ... */}
                {rounds.map((round) => {
                  const vsPar = calculateVsPar(round)
                  const displayName = getDisplayName(round)
                  
                  return (
                    <div key={round.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                      {/* Round card header */}
                      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-3 sm:pb-4 border-b">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h3 className="font-bold text-lg">
                              {displayName}
                            </h3>
                            <p className="text-gray-600 text-sm">
                              {round.city}, {round.state}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <span>{formatDate(round.date)}</span>
                              {round.tee && (
                                <>
                                  <span>•</span>
                                  <span>{formatTeeDetails(round.tee)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-4xl font-bold">{round.total}</div>
                            {vsPar && (
                              <div className={`text-2xl font-bold ${getScoreColor(vsPar)}`}>
                                {vsPar}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => deleteRound(round.id)}
                            className="ml-2 px-1.5 py-0.5 text-white bg-gray-400 hover:bg-gray-500 rounded text-xs"
                          >
                            Delete
                          </button>
                        </div>
                        
                        {/* Score breakdown */}
                        <div className="text-sm text-gray-600 mt-2">
                          Front 9: <span className="font-semibold">{round.front9 || '--'}</span>
                          <span className="mx-2">•</span>
                          Back 9: <span className="font-semibold">{round.back9 || '--'}</span>
                        </div>
                      </div>

                      {/* Real photos only - no placeholders */}
                      {round.photo && (
                        <div className="px-2 sm:px-4 pt-2 sm:pt-4">
                          <div className="aspect-video rounded-lg overflow-hidden">
                            <img 
                              src={round.photo} 
                              alt="Golf course or something captured from round" 
                              className="w-full h-full object-cover" 
                            />
                          </div>
                        </div>
                      )}

                      {/* Scorecard - only show if hole-by-hole scores exist */}
                      {(round.holes && round.holes.some(h => h !== '')) && (
                        <div className="px-2 sm:px-4">
                          <Scorecard round={round} />
                        </div>
                      )}

                      {/* Notes with comment emoji - EXACT AMBER STYLING */}
                      {round.comment && (
  <div className={`px-2 sm:px-4 ${(round.holes && round.holes.some(h => h !== '')) || round.photo ? 'mt-2 sm:mt-4' : ''} pb-2 sm:pb-3`}>
                          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                            <p className="text-sm">💬 {round.comment}</p>
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
                })}
              </div>
            </div>
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
          You've reached the end of your rounds
        </div>
      )}

      {/* Modals */}
      {showFollowers && (
        <UserListModal
          title="Followers"
          users={followersList}
          onClose={() => setShowFollowers(false)}
        />
      )}

      {showFollowing && (
        <UserListModal
          title="Following"
          users={followingList}
          onClose={() => setShowFollowing(false)}
        />
      )}
    </div>
  )
}

export default MyRounds