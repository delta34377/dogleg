import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import AvatarUpload from '../components/AvatarUpload'
import ShareModal from './ShareModal'
import RoundCard from './RoundCard'
import UserListModal from './UserListModal'

const MyRounds = forwardRef((props, ref) => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(true) // true: show skeletons, not "No rounds yet", before the first load
  const [hasMore, setHasMore] = useState(true)
  // null, or 'first' / 'more' when the first page / a later page failed to load
  const [loadError, setLoadError] = useState(null)

  // Paging bookkeeping in refs so the scroll handler always sees the current
  // values (state captured in an old closure let one page load twice and the
  // next one get skipped). Same pattern as the Feed.
  const inFlightRef = useRef(false)   // a page request is running
  const nextOffsetRef = useRef(0)     // where the next page starts
  const hasMoreRef = useRef(true)     // false once the server runs out
  const failedRef = useRef(false)     // the last load failed: wait for Retry
  const requestIdRef = useRef(0)      // bumped by every load; older replies are ignored

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
  const [shareRound, setShareRound] = useState(null)

  // Expose methods to parent component (the nav's "already here" tap)
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }))

  // Load profile stats
  const loadProfileStats = async () => {
    if (!user) return

    const counts = await followService.getFollowCounts(user.id)

    // Get the actual rounds count from database (removed rounds don't count)
    const { count: roundsCount } = await supabase
      .from('rounds')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .or('is_deleted.is.null,is_deleted.eq.false')

    setProfileStats({
      followersCount: counts.followers,
      followingCount: counts.following,
      roundsCount: roundsCount || 0
    })
  }

  // Load profile stats on mount
  useEffect(() => {
    loadProfileStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // loadMore=false loads the first page and replaces the list;
  // loadMore=true appends the next page.
  const loadRounds = useCallback(async (loadMore = false) => {
    // Never start a second "next page" while one is running, after the end,
    // or after a failure (the Retry button clears that)
    if (loadMore && (inFlightRef.current || !hasMoreRef.current || failedRef.current)) return

    // A first-page load always goes ahead; a reply still on its way for an
    // older request is then ignored (see the requestId checks below)
    const requestId = ++requestIdRef.current
    inFlightRef.current = true
    failedRef.current = false
    setIsLoading(true)
    setLoadError(null)
    const currentOffset = loadMore ? nextOffsetRef.current : 0

    try {
      // ONE CALL instead of 4!
      const { data: roundsData, error } = await roundsService.getMyRoundsWithEverything(10, currentOffset)
      if (requestId !== requestIdRef.current) return
      if (error || !roundsData) throw error || new Error('No rounds data')

      const dbRounds = roundsData.rounds || []

      // If we got less than 10, there are no more to load
      const more = dbRounds.length >= 10
      hasMoreRef.current = more
      setHasMore(more)
      // Advance exactly once per page that actually arrived
      nextOffsetRef.current = currentOffset + dbRounds.length

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
          user_id: user?.id,
          short_code: round.short_code, // share links use the short code when there is one
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
          holes_played: round.holes_played,
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
      } else {
        // Replace rounds (initial load)
        setRounds(formattedRounds)
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('Failed to load your rounds:', error)
      failedRef.current = true
      setLoadError(loadMore ? 'more' : 'first')
    } finally {
      // Only the newest request may clear the loading flags
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setIsLoading(false)
      }
    }
  }, [user?.id])

  // Retry after a failed load: the first page, or the page that failed
  const retry = () => {
    failedRef.current = false
    loadRounds(loadError === 'more')
  }

  // Load more rounds when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (inFlightRef.current || !hasMoreRef.current || failedRef.current) return

      // Check if user scrolled near bottom (200px from bottom)
      const scrolledToBottom =
        window.innerHeight + document.documentElement.scrollTop
        >= document.documentElement.offsetHeight - 200

      if (scrolledToBottom) {
        loadRounds(true)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadRounds])

  // Initial load
  useEffect(() => {
    loadRounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deleteRound = async (roundId) => {
    if (window.confirm('Are you sure you want to delete this round?')) {
      const { error } = await roundsService.deleteRound(roundId)

      if (!error) {
        // Remove from state
        setRounds(prev => prev.filter(r => r.id !== roundId))
        // One row fewer on the server, so the next page starts one earlier
        nextOffsetRef.current = Math.max(0, nextOffsetRef.current - 1)
        // Properly decrement the count
        setProfileStats(prev => ({
          ...prev,
          roundsCount: Math.max(0, prev.roundsCount - 1)
        }))
      } else {
        alert('Error deleting round. Please try again.')
      }
    }
  }

  // In toggleReaction - update UI FIRST
  const toggleReaction = async (roundId, reaction) => {
    // Remember just this round's reactions in case the save fails
    const before = rounds.find(round => round.id === roundId)

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
      // Undo the optimistic update on this one round. (Reloading the whole
      // list here used to cut it back to the first 10 rounds.)
      console.error('Failed to save reaction:', error)
      if (before) {
        setRounds(prevRounds =>
          prevRounds.map(round =>
            round.id === roundId
              ? { ...round, reactions: before.reactions, userReacted: before.userReacted }
              : round
          )
        )
      }
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

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">

      {/* Profile Section - COMPACT MOBILE VERSION */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 sm:mb-4">
        <div className="p-3 sm:p-6">
          <div className="flex flex-row items-center gap-3 sm:gap-4">
            {/* Avatar section stays the same */}
            <>
              {/* Mobile version - small */}
              <div className="sm:hidden">
                <AvatarUpload
                  size="sm"  // 48px on mobile
                  editable={true}
                  profile={profile}
                  onUploadComplete={(newUrl) => {
                  }}
                />
              </div>

              {/* Desktop version - large */}
              <div className="hidden sm:block">
                <AvatarUpload
                  size="lg"  // 96px on desktop
                  editable={true}
                  profile={profile}
                  onUploadComplete={(newUrl) => {
                  }}
                />
              </div>
            </>

            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-2xl font-bold truncate">{profile?.username || 'Golfer'}</h2>
              {profile?.full_name && (
                <p className="text-xs sm:text-base text-gray-600 truncate">{profile.full_name}</p>
              )}

              {/* Location with icon */}
              {profile?.location && (
                <p className="text-xs sm:text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profile.location}
                </p>
              )}
            </div>
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
            {profile?.handicap_index !== null && profile?.handicap_index !== undefined && (
              <div
                className="min-h-[44px] flex items-center justify-center"
                title="Handicap index — auto-calculated from posted rounds"
              >
                <span>
                  <span className="font-bold text-base sm:text-lg tabular-nums">{Number(profile.handicap_index).toFixed(1)}</span>
                  <span className="text-gray-600 ml-0.5 sm:ml-1 text-xs sm:text-sm">index</span>
                </span>
              </div>
            )}
            <button
              onClick={async () => {
                const { data } = await followService.getFollowers(user.id)
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
                const { data } = await followService.getFollowing(user.id)
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
      ) : rounds.length === 0 && loadError ? (
        // Loading failed: don't claim there are no rounds
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center" role="alert">
          <div className="text-6xl mb-4">📡</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Couldn't load your rounds</h2>
          <p className="text-gray-500 mb-6">Check your connection and try again.</p>
          <button
            type="button"
            onClick={retry}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Retry
          </button>
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-6xl mb-4">🏌️</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds yet</h2>
          <p className="text-gray-500 mb-6">
            Start tracking your golf rounds by searching for a course and entering your score!
          </p>
          <button
            onClick={() => navigate('/add')}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Add Your First Round
          </button>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {rounds.map((round) => (
            <RoundCard
              key={round.id}
              round={round}
              currentUserId={user?.id}
              onToggleReaction={toggleReaction}
              onAddComment={addComment}
              onShare={setShareRound}
              onDelete={deleteRound}
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

      {/* A later page failed: stop auto-loading until the user taps Retry */}
      {loadError === 'more' && !isLoading && rounds.length > 0 && (
        <div className="text-center py-4" role="alert">
          <p className="text-gray-500 text-sm mb-2">Couldn't load more rounds.</p>
          <button
            type="button"
            onClick={retry}
            className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100"
          >
            Retry
          </button>
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

      {/* Share Modal */}
      {shareRound && (
        <ShareModal
          round={shareRound}
          username={profile?.username || 'golfer'}
          onClose={() => setShareRound(null)}
        />
      )}

    </div>
  )
})

export default MyRounds
