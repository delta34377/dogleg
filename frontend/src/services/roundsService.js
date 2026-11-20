import { supabase } from './supabase'

const PHOTO_BUCKET = 'round-photos'

// A new random id (UUID v4) for a round. ScoreEntry makes one when it opens
// and sends it with every save attempt, so tapping Save again after a lost
// connection can never create a second copy of the round (ENTRY-5).
export function createRoundId() {
  const webCrypto = typeof window !== 'undefined' ? window.crypto : undefined
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }

  // Older browsers (e.g. iOS before 15.4) have no randomUUID: build one
  const bytes = new Uint8Array(16)
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// File extension from the photo's real type (never from its file name, which
// the user controls). ScoreEntry re-encodes every photo to JPEG.
export function photoExtension(type) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type] || 'jpg'
}

// The storage path inside the round-photos bucket, from a photo's public URL
// (".../storage/v1/object/public/round-photos/<path>"). null if it isn't one.
export function photoPathFromUrl(url) {
  if (typeof url !== 'string') return null
  const marker = `/${PHOTO_BUCKET}/`
  const at = url.indexOf(marker)
  if (at < 0) return null
  const path = url.slice(at + marker.length).split(/[?#]/)[0]
  try {
    return decodeURI(path) || null
  } catch {
    return null
  }
}

// True when the server answered with a database/PostgREST error (it has an
// error code such as '23514' or 'PGRST204'). The insert then definitely did
// NOT happen. A network failure has no code: the round may or may not have
// been saved, so we must not tidy anything away.
const isServerRejection = (error) => typeof error?.code === 'string' && error.code !== ''

const isAlreadyExists = (error) =>
  String(error?.statusCode) === '409' ||
  error?.status === 409 ||
  /already exists|duplicate/i.test(error?.message || '')

async function getSignedInUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

// Best effort: a leftover photo is untidy but harmless, so failures are ignored
async function removeRoundPhoto(path) {
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
  } catch (error) {
    console.warn('Could not remove round photo', path, error)
  }
}

// Uploads the photo to "{userId}/{roundId}.jpg". The path is the same on every
// retry of one save, so retries can't pile up extra files.
// Returns { url, path, created } or { error }. created is true when this call
// put the file there (and so may remove it again if the save fails).
async function uploadRoundPhoto(userId, roundId, photo) {
  const contentType = photo.type || 'image/jpeg'
  const path = `${userId}/${roundId}.${photoExtension(contentType)}`
  const bucket = supabase.storage.from(PHOTO_BUCKET)

  // First try a plain upload: that needs only the storage INSERT policy
  let { error } = await bucket.upload(path, photo, { contentType, upsert: false })
  let created = !error

  if (error && isAlreadyExists(error)) {
    // An earlier try of this same save already uploaded it. Overwrite it in
    // case the golfer picked a different photo since (upsert also needs the
    // storage UPDATE policy). If that isn't allowed, the earlier upload of
    // this round's photo is still there, so carry on with it.
    const retry = await bucket.upload(path, photo, { contentType, upsert: true })
    if (retry.error) console.warn('Kept the earlier upload of this photo:', retry.error)
    error = null
    created = false
  }

  if (error) return { error }

  const { data: { publicUrl } } = bucket.getPublicUrl(path)
  return { url: publicUrl, path, created }
}

// Some databases fill short_code after the row is returned; fetch it so the
// share link can use it. Falls back to the row as-is (links then use the id).
async function withShortCode(row) {
  if (!row || row.short_code) return row
  try {
    const { data } = await supabase
      .from('rounds')
      .select('short_code')
      .eq('id', row.id)
      .maybeSingle()
    return data?.short_code ? { ...row, short_code: data.short_code } : row
  } catch {
    return row
  }
}

const insertRound = (dbRound) =>
  supabase.from('rounds').insert([dbRound]).select().single()

export const roundsService = {
  // Save a new round.
  //
  // roundData comes from ScoreEntry: id (from createRoundId), userId, course
  // fields, date, total, front9, back9, holes, holesDeclared, statsByHole,
  // totalPutts, comment, photo (an already re-encoded File, or null), par,
  // coursePars (null when the course has no par data).
  //
  // Returns { data, error, stage }:
  //   success -> data is the saved row, including the server-computed
  //              differential, dogleg_score, strokes_vs_usual, achievements,
  //              holes_played and short_code (short_code may be null)
  //   stage 'photo' -> the photo upload failed and NOTHING was saved; the
  //              caller asks whether to try again or post without it
  //   stage 'round' -> saving the round failed
  // Calling it again with the same id is always safe.
  saveRound: async (roundData) => {
    const roundId = roundData.id || createRoundId()
    let uploaded = null

    try {
      const userId = roundData.userId || (await getSignedInUserId())
      if (!userId) {
        return { data: null, error: new Error('User not authenticated'), stage: 'round' }
      }

      // 1. The photo first, so the row can point at it
      let photoUrl = null
      if (roundData.photo instanceof Blob) {
        const result = await uploadRoundPhoto(userId, roundId, roundData.photo)
        if (result.error) {
          console.error('Photo upload failed:', result.error)
          return { data: null, error: result.error, stage: 'photo' }
        }
        photoUrl = result.url
        if (result.created) uploaded = result.path
      }

      // 2. The row. Only columns the golfer actually entered: the database
      // computes holes_played, differential, dogleg_score, strokes_vs_usual,
      // achievements and short_code itself, and is_deleted is not ours to
      // set — security_hardening.sql refuses inserts that include them.
      const dbRound = {
        id: roundId,
        user_id: userId,
        course_id: roundData.course_id,
        course_name: roundData.course_name || '',
        club_name: roundData.club_name || '',
        city: roundData.city || '',
        state: roundData.state || '',
        tee_id: roundData.tee_id || null,
        tee_data: roundData.tee || null,
        played_at: roundData.date || new Date().toISOString(),
        front9: roundData.front9 ?? null,
        back9: roundData.back9 ?? null,
        total_score: roundData.total,
        scores_by_hole: Array.isArray(roundData.holes) && roundData.holes.length > 0 ? roundData.holes : null,
        // Only send stats columns when there is data — they exist only
        // after database/stats_layer.sql has been run
        ...(roundData.statsByHole ? { stats_by_hole: roundData.statsByHole } : {}),
        ...(roundData.totalPutts ? { total_putts: roundData.totalPutts } : {}),
        par: roundData.par || 72,
        // null when the course has no par data — never a made-up card (STATS-7)
        course_pars: Array.isArray(roundData.coursePars) && roundData.coursePars.length > 0
          ? roundData.coursePars
          : null,
        caption: roundData.comment || '',
        photo_url: photoUrl,
        created_at: new Date().toISOString(),
        // 9 or 18: how many holes the golfer says they played (null = let
        // the database work it out from the hole scores)
        holes_declared: roundData.holesDeclared === 9 || roundData.holesDeclared === 18
          ? roundData.holesDeclared
          : null,
      }

      let { data, error } = await insertRound(dbRound)

      // PGRST204 = "unknown column": the database doesn't have holes_declared
      // yet (stats_layer.sql not re-run). Save once more without it.
      if (error?.code === 'PGRST204') {
        const { holes_declared: _unused, ...withoutHolesDeclared } = dbRound
        const retry = await insertRound(withoutHolesDeclared)
        data = retry.data
        error = retry.error
      }

      // 23505 = unique violation. If it's our id, an earlier try already
      // saved this round (only its reply was lost): that's a success.
      if (error?.code === '23505') {
        const { data: existing } = await supabase
          .from('rounds')
          .select('*')
          .eq('id', roundId)
          .eq('user_id', userId)
          .maybeSingle()
        if (existing) {
          // The saved row doesn't use a photo uploaded only by this try
          if (uploaded && existing.photo_url !== photoUrl) removeRoundPhoto(uploaded)
          return { data: await withShortCode(existing), error: null }
        }
      }

      if (error) {
        // The server refused the row, so nothing points at the photo we just
        // uploaded; remove it. (On a network error the row might exist, so
        // the photo stays — a retry reuses the same path anyway.)
        if (uploaded && isServerRejection(error)) await removeRoundPhoto(uploaded)
        return { data: null, error, stage: 'round' }
      }

      return { data: await withShortCode(data), error: null }
    } catch (error) {
      return { data: null, error, stage: 'round' }
    }
  },

  // Get rounds for the authenticated user
  getRounds: async (limit = 10, offset = 0) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { data: [], error: null }
    }

    const { data, error } = await supabase
      .from('rounds')
      .select('*')
      .eq('user_id', user.id)
      .or('is_deleted.is.null,is_deleted.eq.false')  // ADD THIS LINE
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

    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
    
    const followingIds = following?.map(f => f.following_id) || []
    followingIds.push(user.id)

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
      .or('is_deleted.is.null,is_deleted.eq.false')  // ADD THIS LINE
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

  // Make the signed-in user's reaction of this type exist (shouldExist =
  // true) or not (false). The card says which, rather than "toggle whatever
  // the database holds": a card that was out of date (the user reacted on
  // another page) used to remove a reaction when the user tapped to add it.
  // Now adding one that is already there, or removing one that is already
  // gone, simply succeeds.
  //
  // Calls for the same round and reaction run one after another, so the last
  // tap always wins. The reply is { data, error, removed, exists, superseded }:
  // superseded is true when a later call for the same reaction was made
  // meanwhile, so the caller should leave the card to that call. exists is
  // whether the reaction is there now, as far as this tab knows, so a
  // caller whose save failed can put the card back to that. (After two
  // quick taps that both failed, the card goes back to how it was before
  // the first, not to the state the first tap asked for.)
  //
  // Leaving shouldExist out keeps the old toggle behaviour. (The database
  // work is writeReaction, at the end of this file.)
  saveReaction: (roundId, reactionType, shouldExist) => {
    const key = `${roundId}:${reactionType}`
    const previous = reactionWrites.get(key) || Promise.resolve(null)
    // writeReaction never rejects, so the queue can't get stuck
    const write = previous.then(async (earlier) => {
      const result = await writeReaction(roundId, reactionType, shouldExist)
      return { ...result, exists: reactionExistsAfter(result, earlier, shouldExist) }
    })
    reactionWrites.set(key, write)
    return write.then((result) => {
      const superseded = reactionWrites.get(key) !== write
      if (!superseded) reactionWrites.delete(key)
      return { ...result, superseded }
    })
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
    .eq('is_deleted', false)  // ADD THIS LINE
    .order('created_at', { ascending: true })
  
  return { data, error }
},


  // Get feed with everything included
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

  // UPDATED: Smart blended feed with discovery (now supports chronological toggle)
  // In roundsService.js, find getFeedWithDiscovery and update it:
getFeedWithDiscovery: async (limit = 10, offset = 0, mode = 'mixed', discoverRatio = 0.3) => {
  try {
    // ALWAYS use chronological function now
    const functionName = 'get_feed_chronological_mixed'
    
    const { data, error } = await supabase.rpc(functionName, {
      p_limit: limit,
      p_offset: offset,
      p_mode: mode,
      p_discover_ratio: discoverRatio
    })

    if (error) {
      console.error(`Error fetching feed (${functionName}):`, error)
      return { data: null, error }
    }

    return { 
      data: { rounds: data?.rounds || [] },
      error: null 
    }
  } catch (error) {
    console.error('Feed error:', error)
    return { data: null, error }
  }
},

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
    .or('is_deleted.is.null,is_deleted.eq.false')  // ADD THIS LINE
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

  // Delete a round (only if owned by user), and its photo
  deleteRound: async (roundId) => {
    try {
      const userId = await getSignedInUserId()

      if (!userId) {
        return { error: new Error('User not authenticated') }
      }

      // Look up the photo first: once the row is gone we can't find it
      const { data: existing } = await supabase
        .from('rounds')
        .select('photo_url')
        .eq('id', roundId)
        .eq('user_id', userId)
        .maybeSingle()

      // Delete will only work if the round belongs to the user (RLS policy).
      // .select() returns the deleted rows, so "nothing was deleted" shows up
      // as an error instead of a round that comes back on refresh (ENTRY-8).
      const { data: deleted, error } = await supabase
        .from('rounds')
        .delete()
        .eq('id', roundId)
        .eq('user_id', userId)
        .select('id')

      if (error) return { error }
      if (!deleted || deleted.length === 0) {
        return { error: new Error('Round not deleted (not found, or not yours)') }
      }

      // The photo is public by URL, so remove it too (best effort, in the
      // background — the round itself is already gone). Only files in the
      // user's own folder; storage policies enforce that as well.
      const photoPath = photoPathFromUrl(existing?.photo_url)
      if (photoPath && photoPath.startsWith(`${userId}/`)) {
        removeRoundPhoto(photoPath)
      }

      return { error: null }
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

  // Get my rounds with everything
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

  // Get round by short code
  getRoundByShortCode: async (shortCode) => {
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
    .eq('short_code', shortCode)
    .or('is_deleted.is.null,is_deleted.eq.false')  // ADD THIS LINE
    .single()
  
  return { data, error }
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
    .or('is_deleted.is.null,is_deleted.eq.false')  // ADD THIS LINE
    .single()

  return { data, error }
}
}

// ---- Reactions (roundsService.saveReaction) ----

// The reaction write still running (or queued) for each "roundId:type"
const reactionWrites = new Map()

// Whether the reaction exists once a write has finished, as far as this tab
// knows: what the write made it, or, if the write failed, what the call
// queued before it left. For the first call in the queue that is what its
// card showed, the opposite of what it asked for. undefined when unknown (a
// failed toggle).
function reactionExistsAfter(result, earlier, shouldExist) {
  if (!result.error) return !result.removed
  if (earlier) return earlier.exists
  return shouldExist === undefined ? undefined : !shouldExist
}

// Unique-violation: with a unique index on reactions, a second tab or a
// double tap can lose the race to insert the same reaction. It exists, which
// is what was asked for.
const isUniqueViolation = (error) => error?.code === '23505'

async function writeReaction(roundId, reactionType, shouldExist) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: new Error('User not authenticated') }
    }

    // The user's rows for this reaction (not needed to remove it). A list,
    // not .maybeSingle(): the table has no unique index, so an old double
    // tap may have left two.
    let existing = []
    if (shouldExist !== false) {
      const { data, error: lookupError } = await supabase
        .from('reactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('round_id', roundId)
        .eq('reaction_type', reactionType)
        .limit(1)

      if (lookupError) return { data: null, error: lookupError }
      existing = Array.isArray(data) ? data : []
    }
    const alreadyThere = existing.length > 0

    // Old callers that don't say what they want: toggle
    const wanted = shouldExist === undefined ? !alreadyThere : !!shouldExist

    if (!wanted) {
      // Every copy, in case there are duplicates. Nothing to delete is fine.
      const { error } = await supabase
        .from('reactions')
        .delete()
        .eq('user_id', user.id)
        .eq('round_id', roundId)
        .eq('reaction_type', reactionType)

      return { data: null, error, removed: true }
    }

    if (alreadyThere) {
      return { data: existing[0], error: null, removed: false }
    }

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

    if (isUniqueViolation(error)) {
      return { data: null, error: null, removed: false }
    }
    return { data, error, removed: false }
  } catch (error) {
    return { data: null, error }
  }
}

export default roundsService