import { Fragment, useState, useEffect, useLayoutEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import FollowButton from './FollowButton'
import InviteButton from './InviteButton'
import { getFeedSettings, subscribeToFeedSettings } from '../services/feedSettingsService'
import { statsService } from '../services/statsService'
import RoundCard from './RoundCard'
import ShareModal from './ShareModal'
import { withMyReaction } from '../utils/reactions'

// Skeleton card shown during the initial load
function SkeletonCard() {
  return (
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
  )
}

// Defaults used if the feed settings can't be read at all
const FALLBACK_SETTINGS = { mode: 'following', discoveryRatio: 0, feedLimit: 10 }

// How many rounds to ask about in one request when refreshing the loaded
// cards (keeps the request URL short however far the user has scrolled)
const SOCIAL_REFRESH_BATCH = 50

// Reaction counts for one round, from the reactions rows of many
function countReactions(reactions, roundId) {
  const reactionCounts = {
    fire: 0, clap: 0, dart: 0, goat: 0,
    vomit: 0, clown: 0, skull: 0, laugh: 0
  }

  reactions.filter(r => r.round_id === roundId).forEach(r => {
    if (reactionCounts.hasOwnProperty(r.reaction_type)) {
      reactionCounts[r.reaction_type]++
    }
  })
  return reactionCounts
}

// The signed-in user's own reaction types on one round
const myReactionTypes = (userReactions, roundId) =>
  userReactions.filter(r => r.round_id === roundId).map(r => r.reaction_type)

// One round's comments, in the shape RoundCard shows
const formatComments = (comments, roundId) =>
  comments.filter(c => c.round_id === roundId).map(c => ({
    id: c.id,
    text: c.content || c.comment_text,
    author: c.profiles?.username || c.profiles?.full_name || 'Anonymous',
    author_username: c.profiles?.username || null,
    author_avatar: c.profiles?.avatar_url,
    date: c.created_at,
    user_id: c.user_id
  }))

// The parts of feed cards that change while the rounds themselves don't:
// reactions, the user's own reactions, comments, and whether the user
// follows each poster. A list whose request failed comes back as null (and
// a failed follow lookup as {}), so a refresh can leave those parts alone.
async function fetchSocialData(feedRounds, user) {
  const roundIds = feedRounds.map(r => r.id)
  const uniqueUserIds = [...new Set(feedRounds.map(r => r.user_id).filter(id => id !== user?.id))]

  const [reactionsData, commentsData, userReactionsData, followStatuses] = await Promise.all([
    roundsService.getReactions(roundIds),
    roundsService.getComments(roundIds),
    user ? roundsService.getUserReactions(roundIds) : { data: [] },
    uniqueUserIds.length > 0 ? followService.getFollowStatuses(uniqueUserIds) : {}
  ])

  const listOrNull = (reply) => (reply?.error ? null : reply?.data || [])
  return {
    reactions: listOrNull(reactionsData),
    comments: listOrNull(commentsData),
    userReactions: listOrNull(userReactionsData),
    followStatuses: followStatuses || {}
  }
}

// Turns one page of feed RPC rows into the shape the Feed keeps in state,
// fetching the reactions, comments and stats the RPC doesn't include.
async function formatFeedPage(feedRounds, user) {
  const roundIds = feedRounds.map(r => r.id)

  // Stats fields ride a side query too (the feed RPC predates the stats columns)
  const [social, statsFieldsData] = await Promise.all([
    fetchSocialData(feedRounds, user),
    statsService.getRoundStatsFields(roundIds)
  ])

  const reactions = social.reactions || []
  const comments = social.comments || []
  const userReactions = social.userReactions || []
  const statsFields = statsFieldsData.data || {}

  return feedRounds.map(round => ({
    ...round,
    ...(statsFields[round.id] || {}),
    reactions: countReactions(reactions, round.id),
    comments: formatComments(comments, round.id),
    userReacted: myReactionTypes(userReactions, round.id),
    isFollowing: social.followStatuses[round.user_id] || false,
    source: round.source || 'following',
    reason: round.reason || null
  }))
}

// A loaded card with fresh social data merged in. Parts whose request failed
// are kept, and so are parts the user changed on this card while the refresh
// was running (`touched`), so a slow reply can't undo a tap.
function withFreshSocialData(round, social, touched) {
  let next = round
  if (!touched.rounds.has(round.id)) {
    if (social.reactions && social.userReactions) {
      next = {
        ...next,
        reactions: countReactions(social.reactions, round.id),
        userReacted: myReactionTypes(social.userReactions, round.id)
      }
    }
    if (social.comments) {
      next = { ...next, comments: formatComments(social.comments, round.id) }
    }
  }
  if (!touched.users.has(round.user_id) &&
      Object.prototype.hasOwnProperty.call(social.followStatuses, round.user_id)) {
    next = { ...next, isFollowing: !!social.followStatuses[round.user_id] }
  }
  return next
}

// `active` is false while the app shell keeps the Feed mounted but hidden
// (the user is on another page). A hidden Feed loads nothing on scroll and
// closes anything it had open on top of the page. When it becomes active
// again it scrolls back to where the user left off and brings its cards up
// to date (see catchUp below).
const Feed = forwardRef(({ active = true }, ref) => {
  const [rounds, setRounds] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  // null, or 'first' / 'more' when the first page / a later page failed to load
  const [loadError, setLoadError] = useState(null)
  const [settings, setSettings] = useState(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [shareRound, setShareRound] = useState(null)
  // Bumped to rebuild the cards, which closes a pop-up a card opened itself
  const [cardsKey, setCardsKey] = useState(0)

  // Paging bookkeeping lives in refs, not state: the scroll handler reads
  // them synchronously, so a burst of scroll events can never see a stale
  // "not loading" value and fetch the same page twice (which used to make
  // the next page get skipped).
  const inFlightRef = useRef(false)   // a page request is running
  const nextOffsetRef = useRef(0)     // where the next page starts
  const hasMoreRef = useRef(true)     // false once the server runs out
  const failedRef = useRef(false)     // the last load failed: wait for Retry
  const requestIdRef = useRef(0)      // bumped by every load; older replies are ignored
  const listIdRef = useRef(0)         // bumped when the list starts over from the first page

  // Scroll position, for coming back from another page
  const activeRef = useRef(active)
  const savedScrollYRef = useRef(0)
  const wasHiddenRef = useRef(false)

  // Keeping the cards current while the Feed is hidden
  const staleRef = useRef(false)          // start over from the top when shown again
  const socialRefreshIdRef = useRef(0)    // bumped by every card refresh; older replies are ignored
  const touchedRef = useRef(null)         // { rounds, users } the user changed during the latest refresh

  // Load and subscribe to settings FIRST
  useEffect(() => {
    let unsubscribe

    const initSettings = async () => {
      try {
        const s = await getFeedSettings()
        setSettings(s)
      } catch (error) {
        // Without settings the feed would show skeletons forever
        console.error('Could not load feed settings, using defaults:', error)
        setSettings(FALLBACK_SETTINGS)
      }

      // Subscribe to real-time updates
      unsubscribe = subscribeToFeedSettings((newSettings) => {
        setSettings(newSettings)
      })
    }

    initSettings()

    return () => unsubscribe?.()
  }, [])

  // loadMore=false loads the first page and replaces the list;
  // loadMore=true appends the next page.
  const loadFeed = useCallback(async (loadMore = false) => {
    if (!settings) return  // Only block until settings are ready

    // Never start a second "next page" while one is running, after the end,
    // or after a failure (the Retry button clears that)
    if (loadMore && (inFlightRef.current || !hasMoreRef.current || failedRef.current)) return

    // A first-page load always goes ahead. Any reply still on its way for an
    // older request is then ignored (see the requestId checks below).
    const requestId = ++requestIdRef.current
    if (!loadMore) listIdRef.current += 1
    inFlightRef.current = true
    failedRef.current = false
    setIsLoading(true)
    setLoadError(null)

    const currentOffset = loadMore ? nextOffsetRef.current : 0

    // Use settings from state, NOT localStorage
    const { mode, discoveryRatio, feedLimit } = settings

    try {
      const { data: feedData, error } = await roundsService.getFeedWithDiscovery(
        feedLimit,
        currentOffset,
        mode,
        discoveryRatio
      )
      if (requestId !== requestIdRef.current) return
      if (error || !feedData) throw error || new Error('The feed came back empty')

      const feedRounds = feedData.rounds || []
      const formattedRounds = feedRounds.length > 0 ? await formatFeedPage(feedRounds, user) : []
      if (requestId !== requestIdRef.current) return

      // A short page means we've reached the end
      const more = feedLimit > 0 && feedRounds.length >= feedLimit
      hasMoreRef.current = more
      setHasMore(more)
      // Advance exactly once per page that actually arrived
      nextOffsetRef.current = currentOffset + feedRounds.length

      if (loadMore) {
        setRounds(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          const newRounds = formattedRounds.filter(r => !existingIds.has(r.id))
          return [...prev, ...newRounds]
        })
      } else {
        setRounds(formattedRounds)
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('Failed to load the feed:', error)
      failedRef.current = true
      setLoadError(loadMore ? 'more' : 'first')
    } finally {
      // Only the newest request may clear the loading flags
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false
        setIsLoading(false)
      }
    }
  }, [settings, user])

  // Start over from the first page (tab re-tap, a new follow, admin changes)
  const reloadFromTop = () => {
    staleRef.current = false
    nextOffsetRef.current = 0
    hasMoreRef.current = true
    failedRef.current = false
    setRounds([])
    setHasMore(true)
    loadFeed(false)
  }

  // Refresh the reactions, comments and follow buttons of the loaded cards
  // in place: every loaded page and the scroll position stay as they are.
  // A reply is dropped if the list started over or a newer refresh began
  // meanwhile; if it fails, the cards simply keep what they show.
  const refreshSocialData = (loadedRounds) => {
    const refreshId = ++socialRefreshIdRef.current
    const listId = listIdRef.current
    const touched = { rounds: new Set(), users: new Set() }
    touchedRef.current = touched

    for (let i = 0; i < loadedRounds.length; i += SOCIAL_REFRESH_BATCH) {
      const batch = loadedRounds.slice(i, i + SOCIAL_REFRESH_BATCH)
      const batchIds = new Set(batch.map(r => r.id))

      fetchSocialData(batch, user)
        .then((social) => {
          if (refreshId !== socialRefreshIdRef.current || listId !== listIdRef.current) return
          setRounds(prevRounds => prevRounds.map(round =>
            batchIds.has(round.id) ? withFreshSocialData(round, social, touched) : round
          ))
        })
        .catch((error) => {
          console.error('Could not refresh the feed cards:', error)
        })
    }
  }

  // Back on the Feed after other pages. Its rounds stayed in memory, so bring
  // them up to date. Start over from the top when the list is empty (e.g. a
  // new user who just followed people) or its first page failed, or when a
  // follow changed which rounds belong in it. Otherwise refresh the loaded
  // cards in place, so e.g. a reaction made on a profile shows here too.
  const catchUp = () => {
    if (!settings) return // the first load hasn't started yet; it will be fresh
    if (staleRef.current || (rounds.length === 0 && !inFlightRef.current)) {
      reloadFromTop()
    } else if (rounds.length > 0) {
      refreshSocialData(rounds)
    }
  }

  // Leaving the Feed: close anything it had open on top of the page. Pop-ups
  // are portals into <body>, so hiding the Feed would leave them over the
  // next page with scrolling locked (e.g. Share, then the phone's Back button).
  const closeOverlays = () => {
    if (shareRound) {
      setShareRound(null)
    } else if (document.querySelector('[aria-modal="true"]')) {
      // A pop-up a card opened itself (e.g. the Dogleg Score explainer):
      // rebuilding the cards closes it. Only then, so cards keep their state.
      setCardsKey(key => key + 1)
    }
  }

  // Retry after a failed load: the first page, or the page that failed
  const retry = () => {
    failedRef.current = false
    loadFeed(loadError === 'more')
  }

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      savedScrollYRef.current = 0
      reloadFromTop()
    }
  }))

  // Coming back to the Feed: put the page back where it was, then catch up.
  // A layout effect runs before the browser paints, so the Feed never flashes
  // at the wrong spot, and before any scroll event from the page switch is
  // handled.
  useLayoutEffect(() => {
    activeRef.current = active
    if (!active) {
      wasHiddenRef.current = true
      closeOverlays()
    } else if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      window.scrollTo(0, savedScrollYRef.current)
      catchUp()
    }
    // Runs only when `active` changes. closeOverlays and catchUp come from
    // this render, so they see the current rounds and settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Remember the scroll position and load more near the bottom — only while
  // the Feed is the page on screen
  useEffect(() => {
    const handleScroll = () => {
      if (!activeRef.current) return
      savedScrollYRef.current = window.scrollY

      if (inFlightRef.current || !hasMoreRef.current || failedRef.current) return

      const scrolledToBottom =
        window.innerHeight + document.documentElement.scrollTop
        >= document.documentElement.offsetHeight - 200

      if (scrolledToBottom) {
        loadFeed(true)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadFeed])

  // Load feed when settings are ready
  useEffect(() => {
    if (settings && rounds.length === 0) {
      loadFeed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  // 'feedRefresh' events. followService sends one after every follow or
  // unfollow (detail: { reason: 'follow', userId, following }); one without
  // that detail means "start over".
  useEffect(() => {
    const handleFeedRefresh = (event) => {
      if (!settings) return // nothing loaded yet; the first load will be fresh

      if (!activeRef.current) {
        // Off screen (e.g. the user followed someone on the search page):
        // start over from the top when the Feed is shown again
        staleRef.current = true
        savedScrollYRef.current = 0
        return
      }

      const change = event?.detail
      if (change?.reason === 'follow' && change.userId) {
        // On screen: a Follow button on a card (or in the notifications
        // menu) was tapped. Update those cards rather than pulling the list
        // out from under the user.
        handleFollowChange(change.userId, !!change.following)
        return
      }

      window.scrollTo(0, 0)
      savedScrollYRef.current = 0
      reloadFromTop()
    }

    window.addEventListener('feedRefresh', handleFeedRefresh)

    return () => {
      window.removeEventListener('feedRefresh', handleFeedRefresh)
    }
    // reloadFromTop only changes when loadFeed does, i.e. when settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const toggleReaction = async (roundId, reaction) => {
    const round = rounds.find(r => r.id === roundId)
    if (!round) return

    // Save exactly what the user tapped for: the opposite of what this card
    // shows. (A plain "toggle" did the opposite in the database whenever the
    // card was out of date.)
    const shouldHave = !(round.userReacted || []).includes(reaction)
    touchedRef.current?.rounds.add(roundId)

    // Just this round's reaction, never the whole list: a page that loads
    // meanwhile must not be thrown away
    const showMine = (has) => setRounds(prevRounds =>
      prevRounds.map(r => (r.id === roundId ? withMyReaction(r, reaction, has) : r))
    )

    // Optimistically update UI immediately; on success it already matches
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
    touchedRef.current?.rounds.add(roundId)

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

  // Handle follow state changes
  const handleFollowChange = (userId, isNowFollowing) => {
    touchedRef.current?.users.add(userId)
    setRounds(prevRounds =>
      prevRounds.map(round => {
        if (round.user_id === userId) {
          return { ...round, isFollowing: isNowFollowing }
        }
        return round
      })
    )
  }

  // The first page failed: say so (rather than "no rounds yet") and offer Retry
  if (rounds.length === 0 && !isLoading && loadError) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center" role="alert">
          <div className="text-6xl mb-4">📡</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Couldn't load your feed</h2>
          <p className="text-gray-500 mb-6">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (rounds.length === 0 && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-6xl mb-4">🏌️</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No rounds in your feed yet</h2>
          <p className="text-gray-500 mb-6">
            Start following other golfers to see their rounds here!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/search-users')}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Find Golfers to Follow
            </button>
            {/* Friends not on Dogleg yet? Send them your invite link */}
            <InviteButton variant="secondary" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-2 sm:p-4">
      <div className="space-y-3 sm:space-y-4">
        {isLoading && rounds.length === 0 ? (
          <>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </>
        ) : (
          // Keyed so closeOverlays can rebuild every card at once
          <Fragment key={cardsKey}>
            {rounds.map((round) => {
              // Normalize field names for the shared card
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
                <RoundCard
                  key={round.id}
                  round={normalizedRound}
                  author={profile}
                  showAuthor
                  currentUserId={user?.id}
                  topBadge={
                    round.source === 'discover' && round.reason ? (
                      <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                        {round.reason === 'Near courses you\'ve played'
                          ? '📍 Near courses you\'ve played'
                          : '🔥 Popular round'
                        }
                      </span>
                    ) : null
                  }
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
              )
            })}
          </Fragment>
        )}
      </div>

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
          You've reached the end of your feed
        </div>
      )}

      {shareRound && (
        <ShareModal
          round={shareRound}
          username={shareRound.profiles?.username || 'golfer'}
          onClose={() => setShareRound(null)}
        />
      )}
    </div>
  )
})

export default Feed
