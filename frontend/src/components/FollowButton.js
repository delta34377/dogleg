import { useState, useEffect } from 'react'
import { followService } from '../services/followService'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/avatarUtils'


function FollowButton({ targetUserId, targetUsername, initialFollowing = false, onFollowChange, className, size = 'normal' }) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    setIsFollowing(initialFollowing)
  }, [initialFollowing])

  const handleFollowToggle = async () => {
    if (!user) {
      alert('Please log in to follow users')
      return
    }

    setLoading(true)

    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await followService.unfollowUser(targetUserId)
        if (!error) {
          setIsFollowing(false)
          if (onFollowChange) onFollowChange(false)
        } else {
          console.error('Unfollow error:', error)
        }
      } else {
        // Follow
        const { error } = await followService.followUser(targetUserId)
        if (!error) {
          setIsFollowing(true)
          if (onFollowChange) onFollowChange(true)
        } else {
          console.error('Follow error:', error)
        }
      }
    } catch (err) {
      console.error('Follow toggle error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Don't show button for own profile
  if (user?.id === targetUserId) {
    return null
  }

  // Different padding and text size based on size prop
  const sizeClasses = size === 'small' 
    ? 'px-2 py-0.5 text-xs'
    : 'px-4 py-2 text-sm'

  return (
    <button
      onClick={handleFollowToggle}
      disabled={loading}
      className={`${sizeClasses} rounded-lg font-medium transition-colors ${
        isFollowing
          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          : 'bg-green-600 text-white hover:bg-green-700'
      } ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${className || ''}`}
    >
      {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}

export default FollowButton