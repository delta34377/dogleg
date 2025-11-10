import { supabase } from './supabase'

export const searchService = {
  // Search users by username or full name
  searchUsers: async (searchTerm, limit = 20) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { data: [], error: null }
    }

    try {
      // Clean the search term to prevent SQL injection and handle special characters
      // Remove SQL wildcards and other problematic characters
      const cleanTerm = searchTerm
        .replace(/[%_\\]/g, '') // Remove SQL wildcards
        .replace(/[(),]/g, ' ')  // Replace problematic characters with spaces
        .trim()
      
      // Use ilike for case-insensitive partial matching
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, location')
        .or(`username.ilike.%${cleanTerm}%,full_name.ilike.%${cleanTerm}%`)
        .limit(limit)
        .order('username', { ascending: true })

      if (error) {
        console.error('Search error:', error)
        return { data: [], error }
      }

      return { data: data || [], error: null }
    } catch (error) {
      console.error('Search error:', error)
      return { data: [], error }
    }
  },

  // Get suggested users (for when search is empty)
  getSuggestedUsers: async (currentUserId, limit = 10) => {
    try {
      // Get users the current user doesn't follow
      // First get who they're following
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUserId)

      const followingIds = following?.map(f => f.following_id) || []
      
      // Build query to exclude following list and self
      let query = supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio, location')
      
      // Add the exclusion filter based on what we need to exclude
      const idsToExclude = [...followingIds, currentUserId]
      
      if (idsToExclude.length === 1) {
        // If only excluding one ID (just the current user)
        query = query.neq('id', idsToExclude[0])
      } else if (idsToExclude.length > 1) {
        // If excluding multiple IDs
        query = query.not('id', 'in', `(${idsToExclude.join(',')})`)
      }
      
      // Add limit and order
      const { data, error } = await query
        .limit(limit)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Suggested users error:', error)
        return { data: [], error }
      }

      return { data: data || [], error: null }
    } catch (error) {
      console.error('Suggested users error:', error)
      return { data: [], error }
    }
  }
}