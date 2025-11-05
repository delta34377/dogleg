import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { roundsService } from '../services/roundsService'
import imageCompression from 'browser-image-compression'
import { useAuth } from '../context/AuthContext'

function ScoreEntry({ course, onComplete, onCancel }) {
    const { user } = useAuth() // Add this line
    const [tees, setTees] = useState([])
  const [selectedTee, setSelectedTee] = useState(null)
  const [entryMode, setEntryMode] = useState('simple') // 'simple' or 'holes'
  const [isSaving, setIsSaving] = useState(false)
  const [roundData, setRoundData] = useState({
  date: new Date().toLocaleDateString('en-CA'), // Returns YYYY-MM-DD in local time
    front9: '',
    back9: '',
    total: '',
    holes: Array(18).fill(''),
    comment: '',
    photo: null
  })

  // Load tees when component mounts
  useEffect(() => {
  const loadTees = async () => {
    try {
      const { data, error } = await supabase
        .from('tees')
        .select('*')
        .eq('course_id', course.course_id)
        .order('tee_id')
      
      if (!error && data) {
        setTees(data)
      }
    } catch (error) {
      console.error('Error loading tees:', error)
    }
  }

  if (course?.course_id) {
    loadTees()
  }
}, [course])

  // Load complete course data with hole pars
  const [fullCourseData, setFullCourseData] = useState(null)
  
  useEffect(() => {
  const loadFullCourseData = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', course.course_id)
        .single()
      
      if (!error && data) {
        setFullCourseData(data)
        console.log('Full course data:', data)
      }
    } catch (error) {
      console.error('Error loading course data:', error)
    }
  }

  if (course?.course_id) {
    loadFullCourseData()
  }
}, [course])



  const handleSimpleScoreChange = (field, value) => {
    // Allow empty string or valid numbers
    const score = value === '' ? '' : parseInt(value)
    
    setRoundData(prev => {
      const updated = { ...prev, [field]: value === '' ? '' : score }
      
      // Auto-calculate total based on what's entered
      if (field === 'front9' || field === 'back9') {
        const f9 = field === 'front9' ? score : (prev.front9 === '' ? 0 : parseInt(prev.front9))
        const b9 = field === 'back9' ? score : (prev.back9 === '' ? 0 : parseInt(prev.back9))
        
        // Only update total if at least one nine has a value
        if ((field === 'front9' && value !== '') || (field === 'back9' && value !== '') || 
            (prev.front9 !== '' || prev.back9 !== '')) {
          const front = value === '' && field === 'front9' ? 0 : f9
          const back = value === '' && field === 'back9' ? 0 : b9
          
          // If both are empty, clear total
          if ((field === 'front9' && value === '' && prev.back9 === '') ||
              (field === 'back9' && value === '' && prev.front9 === '')) {
            updated.total = ''
          } else {
            updated.total = front + back
          }
        }
      }
      
      return updated
    })
  }

  const handleHoleScore = (holeIndex, value) => {
    const newHoles = [...roundData.holes]
    newHoles[holeIndex] = value
    
    // Calculate totals only from filled holes
    const front9Holes = newHoles.slice(0, 9).filter(h => h !== '')
    const back9Holes = newHoles.slice(9, 18).filter(h => h !== '')
    
    const front9 = front9Holes.length > 0 
      ? front9Holes.reduce((sum, s) => sum + parseInt(s), 0)
      : ''
    const back9 = back9Holes.length > 0 
      ? back9Holes.reduce((sum, s) => sum + parseInt(s), 0)
      : ''
    
    let total = ''
    if (front9 !== '' || back9 !== '') {
      total = (front9 || 0) + (back9 || 0)
    }
    
    setRoundData(prev => ({
      ...prev,
      holes: newHoles,
      front9,
      back9,
      total
    }))
    
    // Auto-advance to next hole for typical scores (2-9)
    // Most golf scores are single digits between 2-9
    const score = parseInt(value)
    if (value.length === 1 && score >= 2 && score <= 9) {
      // Find the next empty hole or just the next hole
      const nextHoleIndex = holeIndex + 1
      if (nextHoleIndex < 18) {
        // Small delay to ensure state has updated
        setTimeout(() => {
          const nextInput = document.getElementById(`hole-input-${nextHoleIndex}`)
          if (nextInput) {
            nextInput.focus()
            // Select all text in the next input for easy overwrite
            nextInput.select()
          }
        }, 50)
      }
    }
  }

  // Clear all scores
  const clearScores = () => {
    setRoundData(prev => ({
      ...prev,
      front9: '',
      back9: '',
      total: '',
      holes: Array(18).fill('')
    }))
  }

  // Calculate vs par for simple scoring
  const calculateVsPar = () => {
    if (!fullCourseData || !fullCourseData.pars) return null
    
    const front9Score = parseInt(roundData.front9)
    const back9Score = parseInt(roundData.back9)
    const totalScore = parseInt(roundData.total)
    
    // Parse the pars array (it comes as strings)
    const pars = fullCourseData.pars.map(p => parseInt(p))
    
    // Calculate actual pars from hole data
    const front9Par = pars.slice(0, 9).reduce((sum, par) => sum + par, 0)
    const back9Par = pars.slice(9, 18).reduce((sum, par) => sum + par, 0)
    const totalPar = fullCourseData.total_par || (front9Par + back9Par)
    
    // If only front 9 entered
    if (front9Score && !back9Score) {
      const diff = front9Score - front9Par
      if (diff === 0) return 'E'
      if (diff > 0) return `+${diff}`
      return `${diff}`
    }
    
    // If only back 9 entered
    if (back9Score && !front9Score) {
      const diff = back9Score - back9Par
      if (diff === 0) return 'E'
      if (diff > 0) return `+${diff}`
      return `${diff}`
    }
    
    // If total score entered
    if (totalScore) {
      const diff = totalScore - totalPar
      if (diff === 0) return 'E'
      if (diff > 0) return `+${diff}`
      return `${diff}`
    }
    
    return null
  }

  // Calculate holes vs par for hole-by-hole
  const calculateHolesVsPar = () => {
    if (!fullCourseData || !fullCourseData.pars) return null
    
    const filledHoles = roundData.holes.map((score, idx) => ({
      score: score !== '' ? parseInt(score) : null,
      index: idx
    })).filter(h => h.score !== null)
    
    if (filledHoles.length === 0) return null
    
    // Parse the pars array
    const pars = fullCourseData.pars.map(p => parseInt(p))
    
    // Calculate total score and par for only the holes played
    let totalScore = 0
    let totalPar = 0
    
    filledHoles.forEach(hole => {
      totalScore += hole.score
      totalPar += pars[hole.index]
    })
    
    const diff = totalScore - totalPar
    if (diff === 0) return { display: 'E', holesPlayed: filledHoles.length }
    if (diff > 0) return { display: `+${diff}`, holesPlayed: filledHoles.length }
    return { display: `${diff}`, holesPlayed: filledHoles.length }
  }

  // Get the appropriate par value for display
  const getParDisplay = () => {
    if (!fullCourseData || !fullCourseData.pars) return course.total_par || 72
    
    const front9Score = parseInt(roundData.front9)
    const back9Score = parseInt(roundData.back9)
    
    // Parse the pars array
    const pars = fullCourseData.pars.map(p => parseInt(p))
    
    // Calculate actual pars from hole data
    const front9Par = pars.slice(0, 9).reduce((sum, par) => sum + par, 0)
    const back9Par = pars.slice(9, 18).reduce((sum, par) => sum + par, 0)
    
    if (front9Score && !back9Score) return front9Par
    if (back9Score && !front9Score) return back9Par
    return fullCourseData.total_par || (front9Par + back9Par)
  }

  const saveRound = async () => {
  // Prevent double-clicks
  if (isSaving) return
  // Check if user is logged in
  if (!user) {
    alert('Please log in to save your round')
    return
  }
  
  setIsSaving(true) // Start loading
  
  try {
    // Validate that we have at least a total score
    const finalTotal = parseInt(roundData.total)
    if (!finalTotal) {
      alert('Please enter a score')
      setIsSaving(false) // Stop loading
      return
    }

    const newRound = {
      course_id: course.course_id,
      course_name: course.course_name,
      club_name: course.club_name,
      city: course.city,
      state: course.state,
      tee: selectedTee,
      tee_id: selectedTee?.tee_id,
date: roundData.date + 'T00:00:00',
      front9: parseInt(roundData.front9) || null,
      back9: parseInt(roundData.back9) || null,
      total: finalTotal,
      holes: entryMode === 'holes' ? roundData.holes.map(h => parseInt(h) || null) : [],
      comment: roundData.comment ? roundData.comment.slice(0, 280) : '',
      photo: roundData.photo, // This is now a File object
      par: course.total_par || 72,
      coursePars: fullCourseData?.pars ? fullCourseData.pars.map(p => parseInt(p)) : Array(18).fill(4),
    }
    
    // Save to database
    const { data, error } = await roundsService.saveRound(newRound)
    
    if (error) {
      console.error('Error saving round:', error)
      
      // Check if user is logged in
      if (!user) {
        alert('Please log in to save your round')
        setIsSaving(false)
        return
      } else {
        alert('Error saving round. Please try again.')
        setIsSaving(false)
        return
      }
    }
    
    onComplete(data || newRound)
  } catch (err) {
    console.error('Unexpected error:', err)
    alert('Error saving round. Please try again.')
  } finally {
    setIsSaving(false) // Always stop loading at the end
  }
}

  const vsPar = calculateVsPar()
  const holesVsPar = calculateHolesVsPar()

  return (
    <div className="bg-white rounded-lg shadow-xl">
      {/* Header */}
      <div className="bg-green-700 text-white p-4 rounded-t-lg">
        <h2 className="text-xl font-bold">Enter Score</h2>
        <p className="text-green-100 text-sm mt-1">{course.course_name}</p>
        <p className="text-green-100 text-sm">{course.club_name}</p>
      </div>

      <div className="p-6">
        {/* Date and Tees Row */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Played
            </label>
            <input
              type="date"
              value={roundData.date}
              onChange={(e) => setRoundData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tees (optional)
            </label>
            <select
              value={selectedTee?.tee_id || ''}
              onChange={(e) => {
                const tee = tees.find(t => t.tee_id === e.target.value)
                setSelectedTee(tee)
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Select tees...</option>
              {tees.map(tee => (
                <option key={tee.tee_id} value={tee.tee_id}>
                  {tee.tee_name || tee.tee_color}
                  {tee.total_length && ` • ${tee.total_length}${tee.measure_unit || 'y'}`}
                  {tee.slope && ` • ${tee.slope}/${tee.course_rating || ''}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Score Entry Mode Toggle */}
        <div className="mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setEntryMode('simple')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                entryMode === 'simple' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Quick Score
            </button>
            <button
              onClick={() => setEntryMode('holes')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                entryMode === 'holes' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Hole by Hole
            </button>
          </div>
        </div>

        {/* Quick Score Entry */}
        {entryMode === 'simple' && (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 text-center">
                  Front 9
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={roundData.front9}
                  onChange={(e) => handleSimpleScoreChange('front9', e.target.value)}
                  className="w-full px-3 py-3 text-xl font-bold text-center border-2 rounded-lg focus:border-green-500 focus:outline-none"
                  placeholder="--"
                  min="0"
                  max="100"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 text-center">
                  Back 9
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={roundData.back9}
                  onChange={(e) => handleSimpleScoreChange('back9', e.target.value)}
                  className="w-full px-3 py-3 text-xl font-bold text-center border-2 rounded-lg focus:border-green-500 focus:outline-none"
                  placeholder="--"
                  min="0"
                  max="100"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 text-center">
                  Total
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={roundData.total}
                  onChange={(e) => handleSimpleScoreChange('total', e.target.value)}
                  className="w-full px-3 py-3 text-xl font-bold text-center border-2 rounded-lg focus:border-green-500 focus:outline-none bg-green-50"
                  placeholder="--"
                  min="0"
                  max="200"
                />
              </div>
            </div>
            
            {/* Show vs Par */}
            {vsPar !== null && (
              <div className="text-center">
                <span className="text-lg font-semibold">
                  Score: {roundData.total} 
                  <span className={`ml-2 ${
                    vsPar === 'E' ? 'text-gray-700' : 
                    vsPar.startsWith('+') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    ({vsPar})
                  </span>
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  vs. par {getParDisplay()}
                </span>
              </div>
            )}
            
            {/* Clear button */}
            {(roundData.front9 || roundData.back9 || roundData.total) && (
              <div className="text-center">
                <button
                  onClick={clearScores}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Clear scores
                </button>
              </div>
            )}
            
            <p className="text-xs text-gray-500 text-center">
              Enter any combination - Front 9, Back 9, or just Total
            </p>
          </div>
        )}

        {/* Hole by Hole Entry */}
        {entryMode === 'holes' && (
          <div className="mb-6">
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Front 9</div>
              <div className="grid grid-cols-9 gap-1">
                {[...Array(9)].map((_, i) => (
                  <div key={i}>
                    <div className="text-xs text-center text-gray-500 mb-1">{i + 1}</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      id={`hole-input-${i}`}
                      value={roundData.holes[i]}
                      onChange={(e) => handleHoleScore(i, e.target.value)}
                      className="w-full px-1 py-2 text-center border rounded text-sm font-medium"
                      min="1"
                      max="15"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Back 9</div>
              <div className="grid grid-cols-9 gap-1">
                {[...Array(9)].map((_, i) => (
                  <div key={i + 9}>
                    <div className="text-xs text-center text-gray-500 mb-1">{i + 10}</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      id={`hole-input-${i + 9}`}
                      value={roundData.holes[i + 9]}
                      onChange={(e) => handleHoleScore(i + 9, e.target.value)}
                      className="w-full px-1 py-2 text-center border rounded text-sm font-medium"
                      min="1"
                      max="15"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {holesVsPar && (
              <div className="text-center pt-2 border-t">
                <div className="text-sm text-gray-600">
                  {holesVsPar.holesPlayed} holes played • Front: {roundData.front9 || '--'} • Back: {roundData.back9 || '--'}
                </div>
                <div className="text-lg font-bold">
                  Total: {roundData.total}
                  <span className={`ml-2 ${
                    holesVsPar.display === 'E' ? 'text-gray-700' : 
                    holesVsPar.display.startsWith('+') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    ({holesVsPar.display})
                  </span>
                </div>
              </div>
            )}
            
            {/* Clear button for holes */}
            {roundData.holes.some(h => h !== '') && (
              <div className="text-center mt-2">
                <button
                  onClick={clearScores}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Clear all holes
                </button>
              </div>
            )}
          </div>
        )}

        {/* Photo Upload with Auto-Compression */}
<div className="mb-4">
  <label className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 cursor-pointer block text-center">
    <input 
      type="file"
      accept="image/*"
  onChange={async (e) => {
  const file = e.target.files[0]
  if (file) {
    // Show loading state
    setRoundData(prev => ({ ...prev, photo: 'compressing...' }))
    
    try {
      let finalFile = file
      
      // Only compress if over 5MB
      if (file.size > 5 * 1024 * 1024) {
        // First try: Keep original dimensions, just reduce quality
        let options = {
          maxSizeMB: 4.9,           // Target very close to limit
          maxWidthOrHeight: 10000,  // Effectively no resize
          useWebWorker: true,
          fileType: file.type,
          initialQuality: 0.95      // Start with very high quality
        }
        
        let compressedBlob = await imageCompression(file, options)
        
        // If still too big, try with slightly reduced dimensions
        if (compressedBlob.size > 4.9 * 1024 * 1024) {
          options = {
            maxSizeMB: 4.9,
            maxWidthOrHeight: 4000,  // Slightly reduce if huge
            useWebWorker: true,
            fileType: file.type,
            initialQuality: 0.92
          }
          compressedBlob = await imageCompression(file, options)
        }
        
        // Last resort if still too big
        if (compressedBlob.size > 4.9 * 1024 * 1024) {
          options = {
            maxSizeMB: 4.8,
            maxWidthOrHeight: 3000,
            useWebWorker: true,
            fileType: file.type,
            initialQuality: 0.9
          }
          compressedBlob = await imageCompression(file, options)
        }
        
        finalFile = new File([compressedBlob], file.name, {
          type: compressedBlob.type || file.type,
          lastModified: Date.now()
        })
        
        console.log(`Compressed from ${(file.size/1024/1024).toFixed(2)}MB to ${(finalFile.size/1024/1024).toFixed(2)}MB`)
      }
      // Files under 5MB are kept as-is
      
      // Set the final file
      setRoundData(prev => ({ ...prev, photo: finalFile }))
    } catch (error) {
      console.error('Compression error:', error)
      alert('Error processing photo. Please try a different image.')
      setRoundData(prev => ({ ...prev, photo: null }))
    }
  }
}}
      className="hidden"
    />
    {roundData.photo === 'compressing...' ? (
      <span>⏳ Compressing photo...</span>
    ) : roundData.photo && roundData.photo !== 'compressing...' ? (
      <span>📷 {roundData.photo.name}</span>
    ) : (
      <span>📷 Add Photo (optional)</span>
    )}
  </label>
</div>

        {/* Comment */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Add a note (optional):
          </label>
          <textarea
  value={roundData.comment}
  onChange={(e) => setRoundData(prev => ({ ...prev, comment: e.target.value.slice(0, 280) }))}
  className="w-full px-3 py-2 border rounded-lg text-sm"
  rows="2"
  placeholder="How was your round? (e.g., 'Just broke 80!' or 'Perfect weather!')"
  maxLength={280}
/>
        </div>

        {/* Action Buttons */}
<div className="flex gap-3">
  <button 
    onClick={onCancel}
    className="flex-1 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold"
  >
    Cancel
  </button>
  
  <button 
    onClick={saveRound}
    disabled={isSaving}
    className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
      isSaving 
        ? 'bg-gray-400 cursor-not-allowed' 
        : 'bg-green-600 hover:bg-green-700 text-white'
    }`}
  >
    {isSaving ? (
      <span className="flex items-center justify-center">
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Saving Round...
      </span>
    ) : (
      'Save Round'
    )}
  </button>
</div>
      </div>
    </div>
  )
}

export default ScoreEntry