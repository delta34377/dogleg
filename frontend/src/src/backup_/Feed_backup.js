import { useState, useEffect, useCallback } from 'react'
import { roundsService } from '../services/roundsService'
import { useAuth } from '../context/AuthContext'

function Feed() {
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const { user } = useAuth()

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
    loadFeed()
  }, [])

  const loadFeed = async (loadMore = false) => {
    if (isLoading) return
    
    setIsLoading(true)
    const currentOffset = loadMore ? offset : 0
    
    const { data: feedRounds, error } = await roundsService.getFeedRounds(10, currentOffset)
    
    if (!error && feedRounds) {
      if (feedRounds.length < 10) {
        setHasMore(false)
      }
      
      // Get round IDs for fetching reactions and comments
      const roundIds = feedRounds.map(r => r.id)
      
      if (roundIds.length > 0) {
        const { data: reactions } = await roundsService.getReactions(roundIds)
        const { data: comments } = await roundsService.getComments(roundIds)
        const { data: userReactions } = await roundsService.getUserReactions(roundIds)
        
        // Format rounds with reactions and comments
        const formattedRounds = feedRounds.map(round => {
          const roundReactions = reactions?.filter(r => r.round_id === round.id) || []
          const reactionCounts = {
            fire: 0, clap: 0, dart: 0, goat: 0,
            vomit: 0, clown: 0, skull: 0, laugh: 0
          }
          
          roundReactions.forEach(r => {
            if (reactionCounts.hasOwnProperty(r.reaction_type)) {
              reactionCounts[r.reaction_type]++
            }
          })
          
          const roundComments = comments?.filter(c => c.round_id === round.id) || []
          const myReactions = userReactions?.filter(r => r.round_id === round.id).map(r => r.reaction_type) || []
          
          return {
            ...round,
            reactions: reactionCounts,
            comments: roundComments.map(c => ({
              id: c.id,
              text: c.content || c.comment_text,
              author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
              author_avatar: c.profiles?.avatar_url,
              date: c.created_at,
              user_id: c.user_id
            })),
            userReacted: myReactions
          }
        })
        
        if (loadMore) {
          setRounds(prev => [...prev, ...formattedRounds])
          setOffset(prev => prev + feedRounds.length)
        } else {
          setRounds(formattedRounds)
          setOffset(feedRounds.length)
        }
      }
    }
    
    setIsLoading(false)
  }

  const handleReaction = async (roundId, reactionType) => {
    const { data, error, removed } = await roundsService.saveReaction(roundId, reactionType)
    
    if (!error) {
      // Update local state
      setRounds(prevRounds =>
        prevRounds.map(round => {
          if (round.id === roundId) {
            const newReactions = { ...round.reactions }
            const newUserReacted = [...round.userReacted]
            
            if (removed) {
              newReactions[reactionType] = Math.max(0, newReactions[reactionType] - 1)
              const index = newUserReacted.indexOf(reactionType)
              if (index > -1) newUserReacted.splice(index, 1)
            } else {
              newReactions[reactionType] = (newReactions[reactionType] || 0) + 1
              newUserReacted.push(reactionType)
            }
            
            return { ...round, reactions: newReactions, userReacted: newUserReacted }
          }
          return round
        })
      )
    }
  }

  const [commentInputs, setCommentInputs] = useState({})

  const handleAddComment = async (roundId) => {
    const comment = commentInputs[roundId]?.trim()
    if (!comment) return

    const { data, error } = await roundsService.saveComment(roundId, comment)
    
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
                author_avatar: data.profiles?.avatar_url,
                date: data.created_at,
                user_id: data.user_id
              }]
            }
          }
          return round
        })
      )
      setCommentInputs(prev => ({ ...prev, [roundId]: '' }))
    }
  }

  const calculateVsPar = (score, par) => {
    if (!score || !par) return null
    const diff = score - par
    if (diff === 0) return 'E'
    return diff > 0 ? `+${diff}` : `${diff}`
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  if (isLoading && rounds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <svg className="animate-spin h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-gray-600">Loading feed...</p>
        </div>
      </div>
    )
  }

  if (rounds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <span className="text-2xl">🏌️</span>
          </div>
          <h3 className="text-xl font-semibold mb-2">No rounds in your feed yet</h3>
          <p className="text-gray-600 mb-4">
            Start following other golfers to see their rounds here!
          </p>
          <button 
  onClick={() => alert('Discover feature coming soon!')}
  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
>
  Find Golfers to Follow
</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="space-y-6">
        {rounds.map((round) => {
          const vsPar = calculateVsPar(round.total_score, round.par)
          const roundUser = round.profiles || {}
          
          return (
            <div key={round.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Header with user info */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    {roundUser.avatar_url ? (
                      <img 
                        src={roundUser.avatar_url} 
                        alt={roundUser.username} 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-green-700 font-semibold">
                        {roundUser.username?.[0]?.toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {roundUser.username || roundUser.full_name || 'Anonymous'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(round.played_at)}</p>
                  </div>
                </div>
                
                {round.user_id === user?.id && (
                  <button 
                    onClick={() => {/* Add edit functionality */}}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Course and Score Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{round.course_name}</h3>
                    <p className="text-sm text-gray-600">
                      {round.club_name} • {round.city}, {round.state}
                    </p>
                    {round.tee_data && (
                      <p className="text-xs text-gray-500 mt-1">
                        {round.tee_data.tee_name} tees
                      </p>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900">{round.total_score}</div>
                    {vsPar && (
                      <div className={`text-sm font-semibold ${
                        vsPar === 'E' ? 'text-gray-600' : 
                        vsPar.startsWith('+') ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {vsPar}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scores */}
                {(round.front9 || round.back9) && (
                  <div className="flex gap-4 text-sm text-gray-600 mb-3">
                    {round.front9 && <span>Front: {round.front9}</span>}
                    {round.back9 && <span>Back: {round.back9}</span>}
                  </div>
                )}

                {/* Photo */}
                {round.photo_url && (
                  <div className="mb-3">
                    <img 
                      src={round.photo_url} 
                      alt="Round photo" 
                      className="w-full rounded-lg object-cover max-h-96"
                    />
                  </div>
                )}

                {/* Caption */}
                {round.caption && (
                  <p className="text-gray-800 mb-3">{round.caption}</p>
                )}

                {/* Reactions */}
                <div className="flex gap-1 flex-wrap mb-3">
                  {Object.entries(reactionEmojis).map(([key, emoji]) => {
                    const count = round.reactions[key] || 0
                    const hasReacted = round.userReacted.includes(key)
                    
                    return (
                      <button
                        key={key}
                        onClick={() => handleReaction(round.id, key)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${
                          hasReacted 
                            ? 'bg-green-100 text-green-700 scale-110' 
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        <span className="text-lg">{emoji}</span>
                        {count > 0 && <span className="text-sm font-medium">{count}</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Comments */}
                {round.comments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {round.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          {comment.author_avatar ? (
                            <img 
                              src={comment.author_avatar} 
                              alt={comment.author} 
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-medium text-gray-600">
                              {comment.author[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm">
                            <span className="font-semibold">{comment.author}</span>{' '}
                            <span className="text-gray-700">{comment.text}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate(comment.date)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Comment */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentInputs[round.id] || ''}
                    onChange={(e) => setCommentInputs(prev => ({
                      ...prev,
                      [round.id]: e.target.value
                    }))}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddComment(round.id)
                      }
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    maxLength={280}
                  />
                  <button
                    onClick={() => handleAddComment(round.id)}
                    disabled={!commentInputs[round.id]?.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm font-medium"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center py-6">
          <button
            onClick={() => loadFeed(true)}
            disabled={isLoading}
            className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}

export default Feed