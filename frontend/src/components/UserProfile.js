import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import FollowButton from './FollowButton'
import { getInitials } from '../utils/avatarUtils'
import ShareModal from './ShareModal'
import RoundCard from './RoundCard'
import UserListModal from './UserListModal'
import ProfileStatsCard from './ProfileStatsCard'

function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [profileUser, setProfileUser] = useState(null)
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [shareRound, setShareRound] = useState(null)

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

  // Load profile and check follow status
  useEffect(() => {
    loadUserProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  // Load rounds when profile loads
  useEffect(() => {
    if (profileUser?.id) {
      loadRounds()
      loadProfileStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUser])

  const loadUserProfile = async () => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        navigate('/404')
        return
      }

      setProfileUser(profile)

      // Check if current user follows this profile
      if (currentUser && profile && currentUser.id !== profile.id) {
        const followStatus = await followService.getFollowStatuses([profile.id])
        setIsFollowing(followStatus[profile.id] || false)
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error)
    }
  }

  const loadProfileStats = async () => {
    if (!profileUser) return

    const counts = await followService.getFollowCounts(profileUser.id)

    // Get actual rounds count from database
    const { count: roundsCount } = await supabase
      .from('rounds')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileUser.id)

    setProfileStats({
      followersCount: counts.followers,
      followingCount: counts.following,
      roundsCount: roundsCount || 0
    })
  }

  const loadRounds = async (loadMore = false) => {
    if (isLoading || !profileUser?.id) return

    setIsLoading(true)
    const currentOffset = loadMore ? offset : 0

    // Get rounds for this specific user
    const { data: dbRounds, error } = await roundsService.getUserRounds(
      profileUser.id,
      10,
      currentOffset
    )

    if (!error && dbRounds) {
      if (dbRounds.length < 10) {
        setHasMore(false)
      }

      if (dbRounds.length > 0) {
        // Get all the social data
        const roundIds = dbRounds.map(r => r.id)

        const [reactionsData, commentsData, userReactionsData] = await Promise.all([
          roundsService.getReactions(roundIds),
          roundsService.getComments(roundIds),
          roundsService.getUserReactions(roundIds)
        ])

        // Normalize for the shared card
        const formattedRounds = dbRounds.map(round => {
          const roundReactions = reactionsData.data?.filter(r => r.round_id === round.id) || []
          const reactionCounts = {
            fire: 0, clap: 0, dart: 0, goat: 0,
            vomit: 0, clown: 0, skull: 0, laugh: 0
          }
          roundReactions.forEach(r => {
            if (reactionCounts.hasOwnProperty(r.reaction_type)) {
              reactionCounts[r.reaction_type]++
            }
          })

          const roundComments = commentsData.data?.filter(c => c.round_id === round.id) || []
          const myReactions = userReactionsData.data?.filter(r => r.round_id === round.id).map(r => r.reaction_type) || []

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
            dogleg_score: round.dogleg_score,
            strokes_vs_usual: round.strokes_vs_usual,
            achievements: round.achievements,
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
            userReacted: myReactions,
            user_id: round.user_id
          }
        })

        if (loadMore) {
          setRounds(prev => {
            const existingIds = new Set(prev.map(r => r.id))
            const newRounds = formattedRounds.filter(r => !existingIds.has(r.id))
            return [...prev, ...newRounds]
          })
          setOffset(prev => prev + dbRounds.length)
        } else {
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

    const scrolledToBottom =
      window.innerHeight + document.documentElement.scrollTop
      >= document.documentElement.offsetHeight - 200

    if (scrolledToBottom) {
      loadRounds(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, hasMore, offset])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Handle follow changes
  const handleFollowChange = (userId, isNowFollowing) => {
    setIsFollowing(isNowFollowing)
    setProfileStats(prev => ({
      ...prev,
      followersCount: isNowFollowing
        ? prev.followersCount + 1
        : Math.max(0, prev.followersCount - 1)
    }))
  }

  // Toggle reaction - optimistic update
  const toggleReaction = async (roundId, reaction) => {
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

    const { error } = await roundsService.saveReaction(roundId, reaction)

    if (error) {
      loadRounds() // Reload on error
    }
  }

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
                author_username: data.profiles?.username || null,
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

  // LOADING CHECK - profile skeleton
  if (!profileUser) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        {/* Profile skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 sm:mb-4 animate-pulse">
          <div className="p-3 sm:p-6">
            <div className="flex flex-row items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-20 sm:h-20 bg-gray-200 rounded-full flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-48"></div>
              </div>
            </div>
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t flex justify-around">
              <div className="h-6 bg-gray-200 rounded w-16"></div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        </div>

        {/* Rounds skeleton */}
        <div className="space-y-3 sm:space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
              <div className="px-3 sm:px-4 pt-4 pb-4">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3.5 bg-gray-100 rounded w-1/2 mb-3"></div>
                <div className="h-16 bg-gray-100 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isOwnProfile = currentUser?.id === profileUser?.id

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">

      {/* Profile Section - COMPACT MOBILE VERSION */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 sm:mb-4">
        <div className="p-3 sm:p-6">
          <div className="flex flex-row items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              {profileUser?.avatar_url ? (
                <img
                  src={profileUser.avatar_url}
                  alt={profileUser?.username}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-green-700 font-semibold text-sm sm:text-2xl">
                  {getInitials(profileUser) || '?'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-2xl font-bold truncate">{profileUser?.username || 'Golfer'}</h2>
              {profileUser?.full_name && (
                <p className="text-xs sm:text-base text-gray-600 truncate">{profileUser.full_name}</p>
              )}

              {/* Location with icon */}
              {profileUser?.location && (
                <p className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profileUser.location}
                </p>
              )}
            </div>

            {/* Follow Button - same row */}
            {!isOwnProfile && currentUser && (
              <div className="flex-shrink-0">
                <FollowButton
                  targetUserId={profileUser.id}
                  targetUsername={profileUser.username}
                  initialFollowing={isFollowing}
                  onFollowChange={(newState) => handleFollowChange(profileUser.id, newState)}
                />
              </div>
            )}
          </div>

          {/* Stats — every cell is the same centered flex box, with number
              and label kept in one inline run so they share a baseline */}
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t flex items-center justify-around text-center">
            <div className="min-h-[44px] flex items-center justify-center">
              <span>
                <span className="font-bold text-base sm:text-lg tabular-nums">{profileStats.roundsCount}</span>
                <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">rounds</span>
              </span>
            </div>
            {profileUser?.handicap_index !== null && profileUser?.handicap_index !== undefined && (
              <div
                className="min-h-[44px] flex items-center justify-center"
                title="Handicap index — auto-calculated from posted rounds"
              >
                <span>
                  <span className="font-bold text-base sm:text-lg tabular-nums">{Number(profileUser.handicap_index).toFixed(1)}</span>
                  <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">index</span>
                </span>
              </div>
            )}
            <button
              onClick={async () => {
                const { data } = await followService.getFollowers(profileUser.id)
                setFollowersList(data || [])
                setShowFollowers(true)
              }}
              className="min-h-[44px] flex items-center justify-center hover:underline"
            >
              <span>
                <span className="font-bold text-base sm:text-lg tabular-nums">{profileStats.followersCount}</span>
                <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">followers</span>
              </span>
            </button>
            <button
              onClick={async () => {
                const { data } = await followService.getFollowing(profileUser.id)
                setFollowingList(data || [])
                setShowFollowing(true)
              }}
              className="min-h-[44px] flex items-center justify-center hover:underline"
            >
              <span>
                <span className="font-bold text-base sm:text-lg tabular-nums">{profileStats.followingCount}</span>
                <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">following</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats digest — the profile is stat-forward, not just a feed */}
      <ProfileStatsCard userId={profileUser?.id} />

      {/* Rounds */}
      {isLoading && rounds.length === 0 ? (
        <div className="space-y-3 sm:space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
              <div className="px-3 sm:px-4 pt-4 pb-4">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3.5 bg-gray-100 rounded w-1/2 mb-3"></div>
                <div className="h-16 bg-gray-100 rounded-lg"></div>
              </div>
            </div>
          ))}
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-6xl mb-4">🏌️</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds yet</h2>
          <p className="text-gray-500">
            {profileUser?.username} hasn't posted any rounds yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {rounds.map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              currentUserId={currentUser?.id}
              onToggleReaction={toggleReaction}
              onAddComment={addComment}
              onShare={setShareRound}
            />
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && rounds.length > 0 && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p className="text-gray-500 text-sm mt-2">Loading more rounds...</p>
        </div>
      )}

      {/* End of rounds message */}
      {!hasMore && rounds.length > 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          You've reached the end of {isOwnProfile ? 'your' : 'their'} rounds
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

      {shareRound && (
        <ShareModal
          round={shareRound}
          username={profileUser?.username || 'golfer'}
          onClose={() => setShareRound(null)}
        />
      )}
    </div>
  )
}

export default UserProfile
