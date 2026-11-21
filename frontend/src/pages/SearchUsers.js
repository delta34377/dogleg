import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { searchService } from '../services/searchService'
import { followService } from '../services/followService'
import FollowButton from '../components/FollowButton'
import { ChevronLeft, Search, X } from 'lucide-react'
import { getInitials } from '../utils/avatarUtils'


function SearchUsers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currentUserId = user?.id
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [suggestedUsers, setSuggestedUsers] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsFailed, setSuggestionsFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [followStatuses, setFollowStatuses] = useState({})
  const searchTimerRef = useRef(null)
  const latestReqRef = useRef(0)  // ADD THIS FOR RACE CONDITION FIX
  const latestSuggestionsReqRef = useRef(0)
  // Follows and unfollows made on this page. They win over any status lookup
  // that answers later (one may have started before the tap).
  const changedHereRef = useRef({})

  // Add looked-up follow statuses without dropping the ones already known.
  // (Replacing them made golfers followed from the suggestions show "Follow"
  // again after a search was cleared.)
  const mergeFollowStatuses = useCallback((statuses) => {
    setFollowStatuses(prev => ({ ...prev, ...statuses, ...changedHereRef.current }))
  }, [])

  // Load suggested users (each with a short reason, e.g. "Follows you")
  const loadSuggestedUsers = useCallback(async () => {
    const reqId = ++latestSuggestionsReqRef.current
    if (!currentUserId) {
      setSuggestionsLoading(false)
      return
    }

    setSuggestionsLoading(true)
    setSuggestionsFailed(false)
    let list = []
    try {
      const { data, error } = await searchService.getSuggestedUsers(currentUserId)
      if (reqId !== latestSuggestionsReqRef.current) return
      list = Array.isArray(data) ? data : []
      setSuggestedUsers(list)
      setSuggestionsFailed(!!error && list.length === 0)
    } catch (error) {
      console.error('Error loading suggested users:', error)
      if (reqId !== latestSuggestionsReqRef.current) return
      setSuggestedUsers([])
      setSuggestionsFailed(true)
    }
    setSuggestionsLoading(false)

    // Get follow statuses for suggested users
    if (list.length > 0) {
      try {
        const statuses = await followService.getFollowStatuses(list.map(u => u.id))
        if (reqId === latestSuggestionsReqRef.current) mergeFollowStatuses(statuses)
      } catch (error) {
        console.error('Error checking follow statuses:', error)
      }
    }
  }, [currentUserId, mergeFollowStatuses])

  // Load suggested users on mount (and if the signed-in user changes)
  useEffect(() => {
    loadSuggestedUsers()
  }, [loadSuggestedUsers])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // Debounced search function - UPDATED WITH RACE CONDITION FIX
  const performSearch = useCallback(async (term) => {
    const reqId = ++latestReqRef.current  // Track this request
    
    if (!term || term.trim().length < 2) {
      setSearchResults([])
      setLoading(false) // an earlier search may still be running; its answer is now ignored
      return
    }

    setLoading(true)
    const { data, error } = await searchService.searchUsers(term)
    
    // Check if this is still the latest request
    if (reqId !== latestReqRef.current) {
      // A newer search started, ignore these results
      return
    }
    
    if (!error && data) {
      setSearchResults(data)
      
      // Get follow statuses for search results
      if (data.length > 0) {
        const userIds = data.map(u => u.id)
        const statuses = await followService.getFollowStatuses(userIds)
        
        // Check again after async operation
        if (reqId === latestReqRef.current) {
          mergeFollowStatuses(statuses)
        }
      }
    }
    
    setLoading(false)
  }, [mergeFollowStatuses])

  // Handle search input change with debouncing
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)

    // Clear existing timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    // Set new timer for debounced search
    searchTimerRef.current = setTimeout(() => {
      performSearch(value)
    }, 300)
  }

  // Clear search - FIXED BUG
  const clearSearch = () => {
    setSearchTerm('')
    setSearchResults([])
    if (searchTimerRef.current) {  // Changed from searchDebounceTimer
      clearTimeout(searchTimerRef.current)
    }
    // A search still running must not bring back its spinner over the suggestions
    latestReqRef.current++
    setLoading(false)
  }

  // Handle follow status change
  const handleFollowChange = (userId, isFollowing) => {
    changedHereRef.current = { ...changedHereRef.current, [userId]: isFollowing }
    setFollowStatuses(prev => ({
      ...prev,
      [userId]: isFollowing
    }))
  }

  // Render user card
  const renderUserCard = (userItem) => (
    <div key={userItem.id} role="listitem" className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
      <Link 
        to={`/profile/${userItem.username}`}
        className="flex items-center flex-1 min-w-0"
      >
        <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
          {userItem.avatar_url ? (
            <img 
              src={userItem.avatar_url} 
              alt={userItem.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 font-semibold text-lg">
              {getInitials(userItem) || '?'}
            </div>
          )}
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">
            {userItem.username}
          </p>
          {userItem.full_name && (
            <p className="text-sm text-gray-600 truncate">
              {userItem.full_name}
            </p>
          )}
          {/* Why a suggested golfer is suggested ("Follows you", "Plays ...") */}
          {userItem.reason && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {userItem.reason}
            </p>
          )}
          
          {userItem.location && (
            <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {userItem.location}
            </p>
          )}
        </div>
      </Link>
      
      <div className="ml-2 flex-shrink-0">
        <FollowButton
          targetUserId={userItem.id}
          targetUsername={userItem.username}
          initialFollowing={followStatuses[userItem.id] || false}
          onFollowChange={(isFollowing) => handleFollowChange(userItem.id, isFollowing)}
          size="small"
        />
      </div>
    </div>
  )

  // Determine what to display
  const usersToDisplay = searchTerm ? searchResults : suggestedUsers
  const displayTitle = searchTerm 
    ? (searchResults.length > 0 ? 'Search Results' : 'No results found')
    : 'Suggested golfers'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with max-width wrapper */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2.5 -ml-2.5 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Go back"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold">Search Users</h1>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search by username or name..."
                className="w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results or Suggestions with max-width wrapper */}
      <div className="max-w-4xl mx-auto p-2 sm:p-4">
        {/* InviteButton slot */}

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="mt-2 text-gray-600">Searching...</p>
          </div>
        ) : (
          <>
            {/* Section Title */}
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
              {displayTitle}
            </h2>

            {/* User List */}
            <div className="space-y-2">
              {!searchTerm && suggestionsLoading ? (
                <div className="text-center py-8" role="status">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <p className="mt-2 text-gray-600">Finding golfers for you...</p>
                </div>
              ) : usersToDisplay.length > 0 ? (
                <div role="list" className="space-y-2">
                  {usersToDisplay.map(renderUserCard)}
                </div>
              ) : searchTerm && !loading ? (
                <div className="text-center py-8 bg-white rounded-xl shadow-sm border border-gray-100">
                  <p className="text-gray-500">
                    No users found matching "{searchTerm}"
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Try searching with a different username or name
                  </p>
                </div>
              ) : !searchTerm && suggestionsFailed ? (
                <div className="text-center py-8 px-4 bg-white rounded-xl shadow-sm border border-gray-100">
                  <p className="text-gray-700 font-medium">
                    Couldn't load suggestions
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Check your connection, or search for golfers by name above.
                  </p>
                  <button
                    onClick={loadSuggestedUsers}
                    className="mt-4 px-4 py-2 text-sm rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : !searchTerm && suggestedUsers.length === 0 ? (
                <div className="text-center py-8 px-4 bg-white rounded-xl shadow-sm border border-gray-100">
                  <p className="text-gray-700 font-medium">
                    No golfers to suggest yet
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Golf's better with your buddies. Invite the friends you play with to join Dogleg,
                    or search above if they're already here.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SearchUsers