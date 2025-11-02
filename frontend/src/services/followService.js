import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)


export const followService = {
  // Check if current user follows target user
isFollowing: async (targetUserId) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)
    .maybeSingle()  // Changed from .single() to .maybeSingle()

  return !!data
},
  

// Follow a user
followUser: async (targetUserId) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // First check if already following
  const { data: existing } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)
    .maybeSingle()

  if (existing) {
    console.log('Already following this user')
    return { data: existing, error: null }
  }

  // If not following, create the follow
  const { data, error } = await supabase
    .from('follows')
    .insert([
      { 
        follower_id: user.id, 
        following_id: targetUserId 
      }
    ])
    .select()
    .single()

  return { data, error }
},

  // Unfollow a user
  unfollowUser: async (targetUserId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)

    return { error }
  },

  // Get followers of a user - FIXED VERSION
  getFollowers: async (userId) => {
    try {
      // Step 1: Get the follow relationships
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId)

      if (followsError) {
        console.error('Error fetching followers:', followsError)
        return { data: [], error: followsError }
      }

      if (!follows || follows.length === 0) {
        return { data: [], error: null }
      }

      // Step 2: Extract the follower IDs
      const followerIds = follows.map(f => f.follower_id)

      // Step 3: Get the profile data for those user IDs
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', followerIds)

      if (profilesError) {
        console.error('Error fetching follower profiles:', profilesError)
        return { data: [], error: profilesError }
      }

      return { data: profiles || [], error: null }
    } catch (error) {
      console.error('Error in getFollowers:', error)
      return { data: [], error }
    }
  },

  // Get users that a user is following - FIXED VERSION
  getFollowing: async (userId) => {
    try {
      // Step 1: Get the follow relationships
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)

      if (followsError) {
        console.error('Error fetching following:', followsError)
        return { data: [], error: followsError }
      }

      if (!follows || follows.length === 0) {
        return { data: [], error: null }
      }

      // Step 2: Extract the following IDs
      const followingIds = follows.map(f => f.following_id)

      // Step 3: Get the profile data for those user IDs
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', followingIds)

      if (profilesError) {
        console.error('Error fetching following profiles:', profilesError)
        return { data: [], error: profilesError }
      }

      return { data: profiles || [], error: null }
    } catch (error) {
      console.error('Error in getFollowing:', error)
      return { data: [], error }
    }
  },

  // Get follow counts for a user
  getFollowCounts: async (userId) => {
    try {
      // Get followers count
      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId)

      // Get following count
      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId)

      if (followersError || followingError) {
        console.error('Error getting follow counts:', followersError || followingError)
      }

      return {
        followers: followersCount || 0,
        following: followingCount || 0
      }
    } catch (error) {
      console.error('Error in getFollowCounts:', error)
      return { followers: 0, following: 0 }
    }
  },

  // Get profile with stats
  getUserProfile: async (username) => {
    if (!username) {
      return { data: null, error: 'Username is required' }
    }

    try {
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

      if (profileError || !profile) {
        console.error('Error fetching profile:', profileError)
        return { data: null, error: profileError || 'Profile not found' }
      }

      // Get follow counts
      const counts = await followService.getFollowCounts(profile.id)

      // Get rounds count
      const { count: roundsCount, error: roundsError } = await supabase
        .from('rounds')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)

      if (roundsError) {
        console.error('Error fetching rounds count:', roundsError)
      }

      // Check if current user follows this profile
      const isFollowing = await followService.isFollowing(profile.id)

      return {
        data: {
          ...profile,
          followersCount: counts.followers,
          followingCount: counts.following,
          roundsCount: roundsCount || 0,
          isFollowing
        },
        error: null
      }
    } catch (error) {
      console.error('Error in getUserProfile:', error)
      return { data: null, error }
    }
    },

  // Get follow status for multiple users at once (batch operation)
  getFollowStatuses: async (targetUserIds) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}

    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', targetUserIds)
    
    const followingSet = new Set(data?.map(r => r.following_id) || [])
    return targetUserIds.reduce((acc, id) => {
      acc[id] = followingSet.has(id)
      return acc
    }, {})
  }
}