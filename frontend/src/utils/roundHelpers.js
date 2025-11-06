import { getDisplayName } from './courseNameUtils'

// Calculate the vs par score
export function calculateVsPar(round) {
  if (!round.total) return null
  
  const par = round.par || 72
  const total = round.total
  const diff = total - par
  
  if (diff === 0) return 'E'
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

// Format date for display
export function formatDate(dateString) {
  if (!dateString) return ''
  
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  // Check if today
  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }
  
  // Check if yesterday
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  
  // Otherwise format as MMM DD
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  })
}

// Format tee details for display
export function formatTeeDetails(tee) {
  if (!tee) return ''
  
  const parts = []
  
  // Add tee color/name
  if (tee.TeeName) {
    parts.push(tee.TeeName)
  } else if (tee.TeeColor) {
    parts.push(tee.TeeColor)
  }
  
  // Add slope/rating
  if (tee.Slope && tee.CR) {
    parts.push(`${tee.Slope}/${tee.CR}`)
  }
  
  return parts.join(' • ')
}

// Get score color based on vs par
export function getScoreColor(vsPar) {
  if (!vsPar) return 'text-gray-500'
  
  if (vsPar === 'E') return 'text-gray-600'
  
  const num = parseInt(vsPar)
  if (num < 0) return 'text-red-600'  // Under par
  if (num > 0) return 'text-blue-600'  // Over par
  
  return 'text-gray-600'
}

// Export getDisplayName (re-export from courseNameUtils)
export { getDisplayName }