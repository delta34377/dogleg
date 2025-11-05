// Utility function to intelligently display course/club names
// Handles single-course clubs, multi-course clubs, and "Unknown Course" entries

export const getDisplayName = (course) => {
  let courseName = course.course_name
  const clubName = course.club_name
  
  // Handle missing or unknown names
  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
    return clubName || 'Unknown Course'
  }
  
  if (!clubName) return courseName
  
  // DEBUG: Log before fix
  console.log('Before fix:', courseName)
  
  // FIX: Expand the patterns to catch all "X Club" that should be "X Course"
  // These are common course naming conventions that got corrupted
  const shouldBeCoursePatterns = [
    'Old Club',
    'New Club', 
    'North Club',
    'South Club',
    'East Club',
    'West Club',
    'Palmer Club',
    'Championship Club',
    'Club Club',  // Should be "Club Course"
    'Woodfield Club'  // Add this one too
  ]
  
  if (shouldBeCoursePatterns.includes(courseName)) {
    courseName = courseName.replace(' Club', ' Course')
    console.log('After fix:', courseName)  // DEBUG
  }
  
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
  
  console.log('Clean course:', cleanCourse, 'Clean club:', cleanClub)  // DEBUG
  
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
      console.log('Returning just club name due to match')  // DEBUG
      return clubName // Just show club name for single course clubs
    }
  }
  
  // Multi-course club or distinct names - show "Course @ Club" format
  console.log('Final return:', `${courseName} @ ${clubName}`)  // DEBUG
  return `${courseName} @ ${clubName}`
}

export default getDisplayName