import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInitials } from '../utils/avatarUtils'
import { getDisplayName } from '../utils/courseNameUtils'
import {
  calculateVsPar, getScoreColor, formatTeeDetails, formatDate, formatTimeAgo,
} from '../utils/roundHelpers'
import DoglegScoreChip from './DoglegScoreChip'
import Scorecard from './Scorecard'
import ScoreBreakdown from './ScoreBreakdown'
import AchievementBadges from './AchievementBadges'

// The one round card. Feed, MyRounds, SingleRound, and UserProfile used to
// each carry a hand-copied version of this markup ("EXACT SAME AS X"); they
// now all render this component and only own their data fetching.
//
// Expects a normalized round: { id, course_id, city, state, total, date, tee,
// holes, coursePars, front9, back9, par, dogleg_score, strokes_vs_usual,
// achievements, reactions, comments, userReacted, user_id } plus
// comment/caption and photo/photo_url tolerated in either spelling.

export const REACTION_EMOJIS = {
  fire: '🔥',
  clap: '👏',
  dart: '🎯',
  goat: '🐐',
  vomit: '🤮',
  clown: '🤡',
  skull: '💀',
  laugh: '😂',
}

// Collapsed by default: the top three reactions with counts plus an
// add button; the full emoji tray expands on demand. Cards with fewer
// than three reacted types are padded with starter emojis so there's
// always something to one-tap.
const QUICK_REACTIONS = ['fire', 'clap', 'laugh']

function ReactionBar({ reactions, userReacted, onToggle }) {
  const [trayOpen, setTrayOpen] = useState(false)

  const active = Object.entries(reactions || {})
    .filter(([key, count]) => count > 0 && REACTION_EMOJIS[key])
    .sort((a, b) => b[1] - a[1])
  const shown = active.slice(0, 3)
  for (const key of QUICK_REACTIONS) {
    if (shown.length >= 3) break
    if (!shown.some(([k]) => k === key)) shown.push([key, 0])
  }
  const overflow = active.slice(3).reduce((sum, [, count]) => sum + count, 0)
  const reacted = userReacted || []

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map(([key, count]) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          title={key}
          className={`relative inline-flex items-center gap-1 h-9 px-2.5 rounded-full text-sm border transition-colors before:absolute before:-inset-1 before:content-[''] ${
            reacted.includes(key)
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-transparent hover:border-gray-200'
          }`}
        >
          <span className="text-base leading-none">{REACTION_EMOJIS[key]}</span>
          {count > 0 && (
            <span className="text-xs font-semibold text-gray-700 tabular-nums">{count}</span>
          )}
        </button>
      ))}

      {overflow > 0 && (
        <span className="text-xs text-gray-400 tabular-nums">+{overflow}</span>
      )}

      <button
        onClick={() => setTrayOpen(open => !open)}
        aria-label={trayOpen ? 'Hide reactions' : 'Add reaction'}
        aria-expanded={trayOpen}
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors before:absolute before:-inset-1 before:content-[''] ${
          trayOpen
            ? 'bg-gray-100 border-gray-200 text-gray-600'
            : 'bg-gray-50 border-transparent text-gray-400 hover:border-gray-200 hover:text-gray-600'
        }`}
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="7.5" />
          <path strokeLinecap="round" d="M7.8 12.2a3.8 3.8 0 005.4 0" />
          <path strokeLinecap="round" d="M8.2 8.4h.01M12.8 8.4h.01" />
          <path strokeLinecap="round" d="M18.5 15.5v6M15.5 18.5h6" />
        </svg>
      </button>

      {trayOpen && (
        <div className="w-full flex flex-wrap items-center gap-1 pt-1 animate-fade-in">
          {Object.entries(REACTION_EMOJIS).map(([key, emoji]) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              title={key}
              className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-xl transition-transform hover:scale-110 ${
                reacted.includes(key) ? 'bg-green-100' : 'hover:bg-gray-50'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CommentsSection({ round, onAddComment }) {
  const navigate = useNavigate()
  const [showAllComments, setShowAllComments] = useState(false)
  const [newComment, setNewComment] = useState('')

  const comments = round.comments || []
  const visibleComments = showAllComments ? comments : comments.slice(-3)

  const handleSubmit = (e) => {
    e.preventDefault()
    onAddComment(round.id, newComment)
    setNewComment('')
  }

  return (
    <div className={comments.length > 0 ? 'pt-2' : 'pt-0.5'}>
      <div className={`bg-gray-50 rounded-lg ${comments.length > 0 ? 'p-3' : 'p-2'}`}>
        {comments.length > 3 && !showAllComments && (
          <button
            onClick={() => setShowAllComments(true)}
            className="text-sm text-blue-600 hover:text-blue-700 mb-2 min-h-[32px]"
          >
            View {comments.length - 3} more comment{comments.length - 3 !== 1 ? 's' : ''}
          </button>
        )}

        {visibleComments.length > 0 && (
          <div className="space-y-2 mb-3">
            {visibleComments.map(comment => (
              <div key={comment.id} className="bg-white rounded-lg p-2">
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
                    <span className="text-gray-500 text-xs ml-2">· {formatTimeAgo(comment.date)}</span>
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
              className="w-full px-3 py-2.5 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {newComment.length > 250 && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-500 tabular-nums">
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

// Score · Vs par · Dogleg Score — the visual anchor of the card. The course
// name is context; these numbers are the content.
function StatStrip({ round, vsPar, isOwn }) {
  const isNineHole =
    round.holes_played === 9 || (!!round.front9 !== !!round.back9 && (round.front9 || round.back9))

  return (
    <div className="mt-3 flex items-stretch rounded-lg bg-gray-50 px-3 sm:px-4 py-2.5 overflow-x-auto">
      <div className="pr-4 sm:pr-6 shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Score</div>
        <div className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums leading-tight">
          {round.total}
          {isNineHole && (
            <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              9 holes
            </span>
          )}
        </div>
      </div>

      {vsPar && (
        <div className="border-l border-gray-200 px-4 sm:px-6 shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Vs par</div>
          <div className={`text-2xl sm:text-3xl font-bold tabular-nums leading-tight ${getScoreColor(vsPar)}`}>
            {vsPar}
          </div>
        </div>
      )}

      {round.dogleg_score !== null && round.dogleg_score !== undefined && (
        <div className="border-l border-gray-200 pl-4 sm:pl-6 min-w-0 flex flex-col">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Dogleg Score</div>
          <div className="flex-1 flex items-center mt-0.5">
            <DoglegScoreChip
              score={round.dogleg_score}
              strokesVsUsual={round.strokes_vs_usual}
              isOwn={isOwn}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function RoundCard({
  round,
  author = null,          // profile of the poster (identity row)
  showAuthor = false,     // feed & single round show it; own pages don't
  currentUserId = null,
  topBadge = null,        // e.g. the feed's discovery indicator
  headerAction = null,    // e.g. a FollowButton
  onToggleReaction,
  onAddComment,
  onShare,
  onDelete = null,        // renders the 3-dot menu when provided
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const vsPar = calculateVsPar(round)
  const displayName = getDisplayName(round)
  const isOwn = round.user_id === currentUserId
  const note = round.comment || round.caption
  const photo = round.photo || round.photo_url
  const hasHoles = round.holes && round.holes.some(h => h !== '' && h !== null && h !== undefined)

  const metaParts = []
  if (!showAuthor) metaParts.push(formatDate(round.date))
  if (round.tee) metaParts.push(formatTeeDetails(round.tee))

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-up">
      {/* Identity row — who played, when */}
      {showAuthor && (
        <div className="px-3 sm:px-4 pt-3 pb-1 flex items-center justify-between gap-2">
          <button
            onClick={() => author?.username && navigate(`/profile/${author.username}`)}
            className="flex items-center gap-2.5 min-w-0 hover:opacity-80 text-left"
          >
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              {author?.avatar_url ? (
                <img
                  src={author.avatar_url}
                  alt={author?.username}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-green-700 font-semibold text-sm">
                  {getInitials(author) || '?'}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-900 truncate">
                {author?.username || 'Golfer'}
              </div>
              <div className="text-xs text-gray-500">{formatDate(round.date)}</div>
            </div>
          </button>
          {headerAction}
        </div>
      )}

      {topBadge && <div className="px-3 sm:px-4 pt-2">{topBadge}</div>}

      {/* Course context + the stat strip */}
      <div className={`px-3 sm:px-4 ${showAuthor ? 'pt-2' : 'pt-3 sm:pt-4'} pb-3 sm:pb-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className={`font-bold text-base sm:text-lg text-gray-900 leading-snug ${
                round.course_id ? 'cursor-pointer hover:text-green-700' : ''
              }`}
              onClick={() => round.course_id && navigate(`/courses/${round.course_id}`)}
            >
              {displayName}
            </h3>
            <p className="text-gray-500 text-sm truncate">
              {[round.city, round.state].filter(Boolean).join(', ')}
            </p>
            {metaParts.length > 0 && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {metaParts.join(' • ')}
              </div>
            )}
          </div>

          {onDelete && (
            <div className="relative -mr-1.5 -mt-1.5" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(open => !open) }}
                className="p-3 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Round options"
              >
                <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg z-10 border border-gray-200 overflow-hidden animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMenuOpen(false)
                      onDelete(round.id)
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete Round
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <StatStrip round={round} vsPar={vsPar} isOwn={isOwn} />

        <ScoreBreakdown front9={round.front9} back9={round.back9} />

        {round.achievements?.length > 0 && (
          <div className="mt-2.5">
            <AchievementBadges achievements={round.achievements} />
          </div>
        )}
      </div>

      {/* Photo — 4:3 on phones (a square eats the whole viewport), video on desktop */}
      {photo && (
        <div className="px-2 sm:px-4">
          <div className="aspect-[4/3] md:aspect-video rounded-lg overflow-hidden bg-gray-100">
            <img
              src={photo}
              alt="From this round"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {hasHoles && (
        <div className="px-2 sm:px-4">
          <Scorecard round={round} />
        </div>
      )}

      {note && (
        <div className={`px-2 sm:px-4 ${hasHoles || photo ? 'mt-2 sm:mt-3' : ''} pb-1`}>
          <div className="bg-amber-50 border-l-4 border-amber-300 p-3 rounded">
            <p className="text-sm">💬 {note}</p>
          </div>
        </div>
      )}

      {/* Social row */}
      <div className="px-2 sm:px-4 pb-2 sm:pb-4">
        <div className="flex items-start justify-between gap-2 pt-2.5 mt-1.5 border-t border-gray-100">
          <div className="flex-1 min-w-0">
            <ReactionBar
              reactions={round.reactions}
              userReacted={round.userReacted}
              onToggle={(key) => onToggleReaction(round.id, key)}
            />
          </div>
          <button
            onClick={() => onShare(round)}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 shrink-0 rounded-full text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          >
            <span aria-hidden="true">🔗</span>
            <span>Share</span>
          </button>
        </div>

        <CommentsSection round={round} onAddComment={onAddComment} />
      </div>
    </article>
  )
}

export default RoundCard
