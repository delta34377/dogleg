import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)

export const searchService = {
  // Search users by username or full name
  searchUsers: async (searchTerm, limit = 20) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { data: [], error: null }
    }

    try {
      // Use ilike for case-insensitive partial matching
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio')
        .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
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
      
      // Get users not in following list and not self
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio')
        .not('id', 'in', [...followingIds, currentUserId])
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