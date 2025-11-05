import { useState } from 'react'
import { supabase } from '../services/supabase'
import ScoreEntry from './ScoreEntry'
import { getDisplayName } from '../utils/courseNameUtils'

function CourseSearch() {
  const [activeTab, setActiveTab] = useState('name')
  const [nameSearch, setNameSearch] = useState('')
  const [locationSearch, setLocationSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [resultsCount, setResultsCount] = useState('')
  const [locationStatus, setLocationStatus] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [showScoreEntry, setShowScoreEntry] = useState(false)

  const switchTab = (tab) => {
    setActiveTab(tab)
    setResults([])
    setResultsCount('')
  }

  const searchByName = async () => {
    const searchTerm = nameSearch.trim()
    if (!searchTerm) {
      alert('Please enter a club or course name')
      return
    }

    setLoading(true)
    const startTime = Date.now()

    try {
      // Search in both clubs and courses
      const { data: clubResults, error: clubError } = await supabase
        .from('clubs')
        .select(`
          club_id,
          club_name,
          city,
          state,
          courses!inner(
            course_id,
            course_name,
            num_holes,
            total_par
          )
        `)
        .ilike('club_name', `%${searchTerm}%`)
        .limit(20)

      const { data: courseResults, error: courseError } = await supabase
        .from('courses')
        .select(`
          course_id,
          course_name,
          num_holes,
          total_par,
          clubs!inner(
            club_id,
            club_name,
            city,
            state
          )
        `)
        .ilike('course_name', `%${searchTerm}%`)
        .limit(20)

      if (clubError) throw clubError
      if (courseError) throw courseError

      // Combine and format results
      const allResults = []
      
      // Add club results
      if (clubResults) {
        clubResults.forEach(club => {
          club.courses.forEach(course => {
            allResults.push({
              club_id: club.club_id,
              club_name: club.club_name,
              city: club.city,
              state: club.state,
              course_id: course.course_id,
              course_name: course.course_name,
              num_holes: course.num_holes,
              total_par: course.total_par,
              match_type: 'club'
            })
          })
        })
      }

      // Add course results (avoiding duplicates)
      if (courseResults) {
        courseResults.forEach(course => {
          const exists = allResults.find(r => r.course_id === course.course_id)
          if (!exists) {
            allResults.push({
              club_id: course.clubs.club_id,
              club_name: course.clubs.club_name,
              city: course.clubs.city,
              state: course.clubs.state,
              course_id: course.course_id,
              course_name: course.course_name,
              num_holes: course.num_holes,
              total_par: course.total_par,
              match_type: 'course'
            })
          }
        })
      }

      const searchTime = ((Date.now() - startTime) / 1000).toFixed(2)
      setResults(allResults)
      setResultsCount(`Found ${allResults.length} courses in ${searchTime}s`)
      
    } catch (error) {
      console.error('Search error:', error)
      alert('Search failed: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const searchByLocation = async () => {
    const input = locationSearch.trim()
    
    if (!input) {
      alert('Please enter a location (city, state, zip code, or combination)')
      return
    }

    setLoading(true)
    const startTime = Date.now()

    try {
      // Parse the input
      let city = ''
      let state = ''
      let zipCode = ''

      // Check if it's a zip code (3-5 digits)
      if (/^\d{3,5}$/.test(input)) {
        zipCode = input
        // If it starts with 0, also create version without leading zero
        if (input.startsWith('0')) {
          zipCode = parseInt(input).toString() // This removes leading zeros
        }
      } 
      // Check if it contains a comma (city, state format)
      else if (input.includes(',')) {
        const parts = input.split(',').map(p => p.trim())
        city = parts[0]
        state = parts[1] || ''
      }
      // Check if last word might be a 2-letter state
      else {
        const words = input.split(' ').filter(w => w.length > 0)
        const lastWord = words[words.length - 1]
        
        if (lastWord && lastWord.length === 2 && words.length > 1) {
          state = lastWord.toUpperCase()
          city = words.slice(0, -1).join(' ')
        }
        else if (input.length === 2) {
          state = input.toUpperCase()
        } 
        else {
          city = input
        }
      }

      let query = supabase
        .from('clubs')
        .select(`
          club_id,
          club_name,
          city,
          state,
          postal_code,
          courses!inner(
            course_id,
            course_name,
            num_holes,
            total_par
          )
        `)

      // Build the query based on what we parsed
      if (zipCode) {
        const strippedZip = parseInt(input).toString()
        const conditions = [
          `postal_code.eq.${strippedZip}`,
          `postal_code.eq.${input}`,
          `postal_code.like.${strippedZip}-%`
        ]
        query = query.or(conditions.join(','))
      } else {
        if (city && state) {
          query = query.ilike('city', `%${city}%`)
          if (state.length === 2) {
            query = query.eq('state', state.toUpperCase())
          } else {
            query = query.ilike('state', `%${state}%`)
          }
        } else if (city) {
          query = query.or(`city.ilike.%${city}%,state.ilike.%${city}%`)
        } else if (state) {
          if (state.length === 2) {
            query = query.eq('state', state.toUpperCase())
          } else {
            query = query.ilike('state', `%${state}%`)
          }
        }
      }

      const { data: clubs, error } = await query.limit(50)
      
      if (error) throw error

      // Format results
      const formattedResults = []
      clubs?.forEach(club => {
        club.courses.forEach(course => {
          formattedResults.push({
            club_id: club.club_id,
            club_name: club.club_name,
            city: club.city,
            state: club.state,
            course_id: course.course_id,
            course_name: course.course_name,
            num_holes: course.num_holes,
            total_par: course.total_par
          })
        })
      })

      const searchTime = ((Date.now() - startTime) / 1000).toFixed(2)
      setResults(formattedResults)
      setResultsCount(`Found ${formattedResults.length} courses in ${searchTime}s`)
      
    } catch (error) {
      console.error('Location search error:', error)
      alert('Search failed: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const searchNearby = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setLocationStatus('📍 Getting your location...')
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        
        setLocationStatus(
          <>📍 Your location: {lat.toFixed(4)}, {lng.toFixed(4)}<br/>Searching nearby courses...</>
        )
        
        setLoading(true)
        const startTime = Date.now()

        try {
          const { data: nearbyResults, error } = await supabase
            .rpc('search_golf_courses', {
              search_text: '',
              user_lat: lat,
              user_lng: lng,
              max_distance_miles: 15
            })

          if (error) throw error

          const formattedResults = nearbyResults
            .map(r => ({
              club_id: r.club_id,
              club_name: r.club_name,
              course_id: r.course_id,
              course_name: r.course_name,
              city: r.city,
              state: r.state,
              num_holes: r.num_holes || 18,
              total_par: r.total_par,
              distance: r.distance_miles
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 20)
          
          const searchTime = ((Date.now() - startTime) / 1000).toFixed(2)
          setResults(formattedResults)
          setResultsCount(`Found ${nearbyResults.length} courses within 15 miles in ${searchTime}s`)
          
        } catch (error) {
          console.error('Nearby search error:', error)
          alert('Search failed: ' + error.message)
        } finally {
          setLoading(false)
        }
      },
      (error) => {
        setLocationStatus(`❌ Unable to get location: ${error.message}`)
      }
    )
  }

  const selectCourse = (courseId) => {
  const selected = results.find(r => r.course_id === courseId)
  if (selected) {
    setSelectedCourse(selected)
    setShowScoreEntry(true)
  }
}


  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="bg-green-700 text-white p-6 rounded-t-lg">
        <h1 className="text-3xl font-bold">⛳ Course Search</h1>
        <p className="mt-2">Search from over 22,000 golf courses in the United States</p>
      </div>

      {/* Search Tabs */}
      <div className="bg-white border-x border-gray-200">
        <div className="flex border-b">
          <button 
            onClick={() => switchTab('name')} 
            className={`flex-1 py-3 px-4 font-semibold ${
              activeTab === 'name' 
                ? 'bg-green-50 text-green-700 border-b-2 border-green-700' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Search by Name
          </button>
          <button 
            onClick={() => switchTab('location')} 
            className={`flex-1 py-3 px-4 font-semibold ${
              activeTab === 'location' 
                ? 'bg-green-50 text-green-700 border-b-2 border-green-700' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Search by Location
          </button>
          <button 
            onClick={() => switchTab('nearby')} 
            className={`flex-1 py-3 px-4 font-semibold ${
              activeTab === 'nearby' 
                ? 'bg-green-50 text-green-700 border-b-2 border-green-700' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Find Nearby
          </button>
        </div>

        {/* Search Panels */}
        <div className="p-6">
          {/* Name Search */}
          {activeTab === 'name' && (
            <div className="search-panel">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search by Club or Course Name
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && searchByName()}
                  placeholder="e.g., Pebble Beach, Augusta National..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button 
                  onClick={searchByName} 
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Search
                </button>
              </div>
            </div>
          )}

          {/* Location Search */}
          {activeTab === 'location' && (
            <div className="search-panel">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter City, State, Zip Code, or combination
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && searchByLocation()}
                  placeholder="e.g., Orlando  |  Orlando, FL  |  32789"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button 
                  onClick={searchByLocation} 
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Search
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Examples: "Scottsdale" | "Scottsdale, AZ" | "85255" | "Chicago, Illinois"
              </p>
            </div>
          )}

          {/* Nearby Search */}
          {activeTab === 'nearby' && (
            <div className="search-panel">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  📍 Click "Get My Location" to find courses within 15 miles of you
                </p>
              </div>
              <button 
                onClick={searchNearby} 
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Get My Location & Find Courses
              </button>
              <div className="mt-4 text-center text-gray-600">
                {locationStatus}
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-6 flex justify-center">
              <div className="spinner"></div>
            </div>
          )}

          {/* Results Count */}
          {resultsCount && (
            <div className="mt-6 text-sm text-gray-600">
              <strong>{resultsCount}</strong>
            </div>
          )}

          {/* Results */}
          <div className="mt-6 space-y-4">
            {results.length === 0 && resultsCount && (
              <div className="text-center py-8 text-gray-500">
                No courses found. Try a different search.
              </div>
            )}
            {results.map(course => (
              <div key={course.course_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-green-700">
  {getDisplayName(course)}
</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      📍 {course.city || 'City N/A'}, {course.state || 'State N/A'}
                    </p>
                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="text-gray-600">
                        Holes: <strong>{course.num_holes || 18}</strong>
                      </span>
                      {course.total_par && (
                        <span className="text-gray-600">
                          Par: <strong>{course.total_par}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  {course.distance !== undefined && (
                    <div className="text-right">
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        {course.distance.toFixed(1)} mi
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <button 
                    onClick={() => selectCourse(course.course_id)} 
                    className="text-sm bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700"
                  >
                    Select Course
                  </button>
                  </div>
              </div>
            ))}
          </div>
        </div>
      </div>

{/* Score Entry Modal */}
{showScoreEntry && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto">
    <div className="w-full max-w-md mt-10 mb-10">
      <ScoreEntry 
        course={selectedCourse}
        onComplete={(round) => {
          setShowScoreEntry(false)
          setSelectedCourse(null)
          alert('Round saved! Check "My Rounds" to view.')
        }}
        onCancel={() => {
          setShowScoreEntry(false)
          setSelectedCourse(null)
        }}
      />
    </div>
  </div>
)}

    </div>
  )
}

export default CourseSearch