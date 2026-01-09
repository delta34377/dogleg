import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import ShareImageCard from './ShareImageCard'

// Utility function to intelligently display course/club names
const getDisplayName = (round) => {
  let courseName = round.course_name
  let clubName = round.club_name
  
  const toProperCase = (str) => {
    if (!str) return str
    if (str === str.toUpperCase() && str.length > 2) {
      return str.toLowerCase().split(' ').map((word, index) => {
        if (index > 0 && ['of', 'at', 'the'].includes(word)) return word
        return word.charAt(0).toUpperCase() + word.slice(1)
      }).join(' ')
    }
    return str
  }
  
  courseName = toProperCase(courseName)
  clubName = toProperCase(clubName)
  
  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
    return clubName || 'Unknown Course'
  }
  
  if (!clubName) return courseName
  
  const singleWordsThatNeedCourse = [
    'Old', 'New', 'North', 'South', 'East', 'West',
    'Championship', 'Palmer', 'Club', 'Woodfield',
    'Executive', 'Blue', 'Red', 'Gold', 'Silver'
  ]
  
  if (singleWordsThatNeedCourse.includes(courseName)) {
    courseName = courseName + ' Course'
  }
  
  const cleanCourse = courseName.toLowerCase()
    .replace(/golf|club|country|cc|course|resort|links/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
  
  const cleanClub = clubName.toLowerCase()
    .replace(/golf|club|country|cc|course|resort|links/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
  
  const courseWords = cleanCourse.split(' ').filter(w => w.length > 2)
  const clubWords = cleanClub.split(' ').filter(w => w.length > 2)
  
  if (courseWords.length > 0) {
    const matchingWords = courseWords.filter(word => 
      clubWords.some(clubWord => clubWord.includes(word) || word.includes(clubWord))
    )
    
    if (matchingWords.length / courseWords.length >= 0.7) {
      return clubName
    }
  }
  
  return `${courseName} @ ${clubName}`
}

function ShareModal({ round, username, onClose }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const cardRef = useRef(null)
  
  const shareUrl = `https://dogleg.io/rounds/${round.short_code || round.id}`
  const photoUrl = round.photo || round.photo_url
  
  // 1. Load image - but don't generate preview
  useEffect(() => {
    const loadImage = async () => {
      if (!photoUrl) {
        setImageLoaded(true)
        return
      }
      
      const timeout = setTimeout(() => {
        console.log('Image load timeout')
        setImageLoaded(true)
      }, 3000)
      
      try {
        const response = await fetch(photoUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        
        const blob = await response.blob()
        const reader = new FileReader()
        reader.onloadend = () => {
          clearTimeout(timeout)
          setImageDataUrl(reader.result)
          setImageLoaded(true)
        }
        reader.onerror = () => {
          clearTimeout(timeout)
          setImageLoaded(true)
        }
        reader.readAsDataURL(blob)
      } catch (error) {
        clearTimeout(timeout)
        console.error('Error loading image:', error)
        setImageLoaded(true)
      }
    }
    
    loadImage()
  }, [photoUrl])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
      const textArea = document.createElement('textarea')
      textArea.value = shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }
  
  const handleShareImage = async () => {
    setIsGenerating(true)
    
    // SAFETY TIMEOUT: Force stop after 8 seconds
    const safetyTimer = setTimeout(() => {
        setIsGenerating(false)
        alert('Taking too long. Please try again or use a smaller photo.')
    }, 8000)

    try {
      if (!cardRef.current) throw new Error('Card ref not available')
      
      // Generate the canvas
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, // Good balance for mobile
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#e2e8f0',
        logging: false,
      })
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      clearTimeout(safetyTimer) // Clear timeout if successful
      
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `dogleg-round.png`, { type: 'image/png' })
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Golf Round',
            text: `I shot ${round.total} at ${getDisplayName(round)}!`,
          })
          setIsGenerating(false)
          onClose()
          return
        }
      }
      
      // Fallback: download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dogleg-round.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      clearTimeout(safetyTimer)
      console.error('Error sharing image:', error)
      alert('Could not generate image. Try copying the link instead.')
    }
    
    setIsGenerating(false)
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl max-w-sm w-full max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-bold">Share Round</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        {/* LIVE PREVIEW AREA (CSS Scaled) */}
        <div className="p-4 bg-gray-50 flex justify-center overflow-hidden shrink-0">
            {/* We render the REAL card here, but scale it down with CSS 
                so it fits in the modal. This avoids html2canvas needing to run for preview.
            */}
            <div style={{ 
                width: '360px', 
                height: '440px', 
                transform: 'scale(0.75)', // Scale down to fit mobile
                transformOrigin: 'top center',
                marginBottom: '-110px' // Compensate for the scale whitespace
            }}>
                <ShareImageCard 
                    ref={cardRef}
                    round={round}
                    username={username}
                    photoUrl={imageDataUrl}
                    isLive={true} // Prop to tell card it's visible
                />
            </div>
        </div>
        
        {/* Options */}
        <div className="p-4 space-y-3 bg-white relative z-10">
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {linkCopied ? <span className="text-green-600 font-bold">✓ Copied!</span> : <span>🔗 Copy Link</span>}
          </button>
          
          <button
            onClick={handleShareImage}
            disabled={isGenerating || !imageLoaded}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Generating...</span>
              </>
            ) : (
              <span>📸 Share to Instagram/Text</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShareModal