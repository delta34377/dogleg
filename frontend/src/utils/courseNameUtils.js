// Utility function to intelligently display course/club names
// Handles single-course clubs, multi-course clubs, and "Unknown Course" entries

export const getDisplayName = (course) => {
  const courseName = course.course_name
  const clubName = course.club_name
  
  // Handle missing or unknown names
  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
    return clubName || 'Unknown Course'
  }
  
  if (!clubName) return courseName
  
  // Check if course name is very similar to club name (likely single course)
  // Clean up names for comparison
  const cleanCourse = courseName.toLowerCase()
    .replace(/golf|club|country|cc|course|resort|links/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
  
  const cleanClub = clubName.toLowerCase()
    .replace(/golf|club|country|cc|course|resort|links/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
  
  // Get significant words (longer than 2 chars)
  const courseWords = cleanCourse.split(' ').filter(w => w.length > 2)
  const clubWords = cleanClub.split(' ').filter(w => w.length > 2)
  
  // Check overlap - if most course words appear in club name, it's likely single course
  if (courseWords.length > 0) {
    const matchingWords = courseWords.filter(word => 
      clubWords.some(clubWord => clubWord.includes(word) || word.includes(clubWord))
    )
    
    // If 70% or more of course words match club words, it's probably single course
    if (matchingWords.length / courseWords.length >= 0.7) {
      return clubName // Just show club name for single course clubs
    }
  }
  
  // Multi-course club or distinct names - show "Course @ Club" format
  return `${courseName} @ ${clubName}`
}

export default getDisplayName