/**
 * Utility functions for avatar display
 */

/**
 * Get initials from a user profile
 * @param {Object} profile - User profile object
 * @param {string} profile.full_name - Full name (if exists in code but not DB)
 * @param {string} profile.display_name - Display name from database
 * @param {string} profile.username - Username (e.g., "markg")
 * @returns {string} Initials (1-2 characters uppercase)
 */
export function getInitials(profile) {
  // Return '?' if no profile
  if (!profile) return '?'
  
  // Try full_name first (in case you add it to DB later)
  // Then try display_name (what's actually in your database)
  const nameToUse = profile.full_name || profile.display_name
  
  // Try to get initials from the name
  if (nameToUse && nameToUse.trim()) {
    const names = nameToUse.trim().split(/\s+/)
    
    if (names.length === 1) {
      // Single name - take first letter
      return names[0][0]?.toUpperCase() || '?'
    } else if (names.length === 2) {
      // First and last name - take first letter of each
      return `${names[0][0]?.toUpperCase() || ''}${names[1][0]?.toUpperCase() || ''}`
    } else if (names.length > 2) {
      // Multiple names - take first and last
      return `${names[0][0]?.toUpperCase() || ''}${names[names.length - 1][0]?.toUpperCase() || ''}`
    }
  }
  
  // Fall back to username
  if (profile.username && profile.username.trim()) {
    return profile.username[0].toUpperCase()
  }
  
  // Last resort - check for email
  if (profile.email && profile.email.trim()) {
    return profile.email[0].toUpperCase()
  }
  
  return '?'
}

/**
 * Get avatar display for a profile
 * Returns either an image element or initials
 * @param {Object} profile - User profile object
 * @returns {Object} Object with type and content
 */
export function getAvatarDisplay(profile) {
  // Check for profile_picture_url first (based on your database)
  if (profile?.profile_picture_url) {
    return {
      type: 'image',
      url: profile.profile_picture_url,
      alt: profile.full_name || profile.username || 'User avatar'
    }
  }
  
  // Check for avatar_url as fallback
  if (profile?.avatar_url) {
    return {
      type: 'image',
      url: profile.avatar_url,
      alt: profile.full_name || profile.username || 'User avatar'
    }
  }
  
  // Return initials
  return {
    type: 'initials',
    text: getInitials(profile)
  }
}