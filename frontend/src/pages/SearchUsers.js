import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { searchService } from '../services/searchService'
import { followService } from '../services/followService'
import FollowButton from '../components/FollowButton'
import { ChevronLeft, Search, X } from 'lucide-react'

function SearchUsers() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [suggestedUsers, setSuggestedUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [followStatuses, setFollowStatuses] = useState({})
  const [searchDebounceTimer, setSearchDebounceTimer] = useState(null)

  // Load suggested users on mount
  useEffect(() => {
    if (user && !searchTerm) {
      loadSuggestedUsers()
    }
  }, [user])

  // Load suggested users
  const loadSuggestedUsers = async () => {
    const { data } = await searchService.getSuggestedUsers(user.id)
    setSuggestedUsers(data)
    
    // Get follow statuses for suggested users
    if (data.length > 0) {
      const userIds = data.map(u => u.id)
      const statuses = await followService.getFollowStatuses(userIds)
      setFollowStatuses(statuses)
    }
  }

  // Debounced search function
  const performSearch = useCallback(async (term) => {
    if (!term || term.trim().length < 2) {
      setSearchResults([])
      return
    }

    setLoading(true)
    const { data, error } = await searchService.searchUsers(term)
    
    if (!error && data) {
      setSearchResults(data)
      
      // Get follow statuses for search results
      if (data.length > 0) {
        const userIds = data.map(u => u.id)
        const statuses = await followService.getFollowStatuses(userIds)
        setFollowStatuses(statuses)
      }
    }
    
    setLoading(false)
  }, [])

  // Handle search input change with debouncing
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)

    // Clear existing timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    // Set new timer for debounced search
    const newTimer = setTimeout(() => {
      performSearch(value)
    }, 300) // 300ms delay

    setSearchDebounceTimer(newTimer)
  }

  // Clear search
  const clearSearch = () => {
    setSearchTerm('')
    setSearchResults([])
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }
  }

  // Handle follow status change
  const handleFollowChange = (userId, isFollowing) => {
    setFollowStatuses(prev => ({
      ...prev,
      [userId]: isFollowing
    }))
  }

  // Render user card
  const renderUserCard = (userItem) => (
    <div key={userItem.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
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
              {userItem.username?.[0]?.toUpperCase() || '?'}
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
    : 'Suggested Users'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with max-width wrapper */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(-1)}
                className="p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
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
                className="w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
              {usersToDisplay.length > 0 ? (
                usersToDisplay.map(renderUserCard)
              ) : searchTerm && !loading ? (
                <div className="text-center py-8 bg-white rounded-lg">
                  <p className="text-gray-500">
                    No users found matching "{searchTerm}"
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    Try searching with a different username or name
                  </p>
                </div>
              ) : !searchTerm && suggestedUsers.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-lg">
                  <p className="text-gray-500">
                    No suggested users at this time
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