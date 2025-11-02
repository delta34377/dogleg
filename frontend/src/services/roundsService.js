import { supabase } from './supabase'

export const roundsService = {
  // Save a new round with user association
  saveRound: async (roundData) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { data: null, error: new Error('User not authenticated') }
      }

      let photoUrl = null
      
      // Upload photo if provided
      if (roundData.photo && roundData.photo instanceof File) {
        const fileExt = roundData.photo.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}.${fileExt}`
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('round-photos')
          .upload(fileName, roundData.photo)
        
        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from('round-photos')
            .getPublicUrl(fileName)
          photoUrl = publicUrl
        }
      }
      
      // Prepare round data for database
      const dbRound = {
        user_id: user.id, // Add user ID
        course_id: roundData.course_id,
        course_name: roundData.course_name || '',
        club_name: roundData.club_name || '',
        city: roundData.city || '',
        state: roundData.state || '',
        tee_id: roundData.tee_id || null,
        tee_data: roundData.tee || null,
        played_at: roundData.date || new Date().toISOString(),
        front9: roundData.front9 || null,
        back9: roundData.back9 || null,
        total_score: roundData.total,
        scores_by_hole: roundData.holes?.length > 0 ? roundData.holes : null,
        par: roundData.par || 72,
        course_pars: roundData.coursePars || Array(18).fill(4),
        caption: roundData.comment || '',
        photo_url: photoUrl,
        created_at: new Date().toISOString()
      }
      
      const { data, error } = await supabase
        .from('rounds')
        .insert([dbRound])
        .select()
        .single()
      
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get rounds for the authenticated user
  getRounds: async (limit = 10, offset = 0) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { data: [], error: null } // Return empty if not authenticated
      }

      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', user.id) // Only get user's rounds
        .order('played_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get feed rounds from followed users
  getFeedRounds: async (limit = 10, offset = 0) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { data: [], error: null }
      }

      // First get the list of users the current user follows
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      
      const followingIds = following?.map(f => f.following_id) || []
      followingIds.push(user.id) // Include own rounds in feed

      // Get rounds from followed users
      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          profiles:user_id (
            username,
            full_name,
            avatar_url
          )
        `)
        .in('user_id', followingIds)
        .order('played_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get reactions for rounds
  getReactions: async (roundIds) => {
    if (!roundIds || roundIds.length === 0) return { data: [], error: null }
    
    const { data, error } = await supabase
      .from('reactions')
      .select(`
        *,
        profiles:user_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .in('round_id', roundIds)
    
    return { data, error }
  },

  // Save a reaction with user association
  saveReaction: async (roundId, reactionType) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { data: null, error: new Error('User not authenticated') }
      }

      // Check if user already reacted with this type
      const { data: existing } = await supabase
        .from('reactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('round_id', roundId)
        .eq('reaction_type', reactionType)
        .maybeSingle()
      
      if (existing) {
        // Remove reaction if it already exists (toggle off)
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('id', existing.id)
        
        return { data: null, error, removed: true }
      }
      
      // Add new reaction
      const { data, error } = await supabase
        .from('reactions')
        .insert([{
          user_id: user.id,
          round_id: roundId,
          reaction_type: reactionType,
          emoji: reactionType // Keep both columns for compatibility
        }])
        .select()
        .single()
      
      return { data, error, removed: false }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get user's reactions for specific rounds
  getUserReactions: async (roundIds) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user || !roundIds || roundIds.length === 0) {
        return { data: [], error: null }
      }

      const { data, error } = await supabase
        .from('reactions')
        .select('round_id, reaction_type')
        .eq('user_id', user.id)
        .in('round_id', roundIds)
      
      return { data, error }
    } catch (error) {
      return { data: [], error }
    }
  },

  // Get comments for rounds
getComments: async (roundIds) => {
  if (!roundIds || roundIds.length === 0) return { data: [], error: null }
  
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      profiles!comments_user_id_fkey (
        username,
        full_name,
        avatar_url
      )
    `)
    .in('round_id', roundIds)
    .order('created_at', { ascending: true })
  
  return { data, error }
},

// In roundsService.js, add this method:
getFeedWithEverything: async (limit = 10, offset = 0) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('get_feed_with_everything', {
    user_id_param: user.id,
    limit_num: limit,
    offset_num: offset
  })

  if (error) {
    console.error('Error fetching feed:', error)
    return { data: null, error }
  }

  return { 
    data: {
      rounds: data.rounds || [],
      reactions: data.reactions || [],
      comments: data.comments || [],
      userReactions: data.user_reactions || []
    }, 
    error: null 
  }
},

// NEW: Smart blended feed with discovery
getFeedWithDiscovery: async (limit = 10, offset = 0, mode = 'mixed', discoverRatio = 0.3) => {
  try {
    const { data, error } = await supabase.rpc('get_feed_with_discovery', {
      p_limit: limit,
      p_offset: offset,
      p_mode: mode,
      p_discover_ratio: discoverRatio
    })

    if (error) {
      console.error('Error fetching feed with discovery:', error)
      return { data: null, error }
    }

    // The RPC returns everything we need in the right format
    return { 
      data: {
        rounds: data?.rounds || []
      },
      error: null 
    }
  } catch (error) {
    console.error('Feed error:', error)
    return { data: null, error }
  }
},


// ADD this function to your existing roundsService.js:

  // Get rounds for a specific user
  getUserRounds: async (userId, limit = 20, offset = 0) => {
    const { data, error } = await supabase
      .from('rounds')
      .select(`
        *,
        profiles!rounds_user_id_fkey(
          username,
          full_name,
          avatar_url
        ),
        reaction_count:reactions(count),
        comment_count:comments(count)
      `)
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .range(offset, offset + limit - 1)

    return { data, error }
  },


  // Save a comment with user association
  saveComment: async (roundId, content) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { data: null, error: new Error('User not authenticated') }
      }

      const { data, error } = await supabase
        .from('comments')
        .insert([{
          user_id: user.id,
          round_id: roundId,
          content: content.slice(0, 280), // Limit to 280 chars
          created_at: new Date().toISOString()
        }])
        .select(`
          *,
          profiles:user_id (
            username,
            full_name,
            avatar_url
          )
        `)
        .single()
      
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Delete a round (only if owned by user)
  deleteRound: async (roundId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { error: new Error('User not authenticated') }
      }

      // Delete will only work if the round belongs to the user (RLS policy)
      const { error } = await supabase
        .from('rounds')
        .delete()
        .eq('id', roundId)
        .eq('user_id', user.id)
      
      return { error }
    } catch (error) {
      return { error }
    }
  },

  // Delete a comment (only if owned by user)
  deleteComment: async (commentId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { error: new Error('User not authenticated') }
      }

      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id)
      
      return { error }
    } catch (error) {
      return { error }
    }
  },

  getMyRoundsWithEverything: async (limit = 10, offset = 0) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('get_my_rounds_with_everything', {
    user_id_param: user.id,
    limit_num: limit,
    offset_num: offset
  })

  if (error) {
    console.error('Error fetching my rounds:', error)
    return { data: null, error }
  }

  return { 
    data: {
      rounds: data.rounds || [],
      reactions: data.reactions || [],
      comments: data.comments || [],
      userReactions: data.user_reactions || []
    }, 
    error: null 
  }
},


  // Get a single round with full details
  getRound: async (roundId) => {
    const { data, error } = await supabase
      .from('rounds')
      .select(`
        *,
        profiles:user_id (
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('id', roundId)
      .single()
    
    return { data, error }
  }
}

export default roundsService