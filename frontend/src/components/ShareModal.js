import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import ShareImageCard from './ShareImageCard'

// ... Keep your getDisplayName helper function exactly as is ...
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
  const cleanCourse = courseName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi, '').replace(/[^a-z0-9]/g, ' ').trim()
  const cleanClub = clubName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi, '').replace(/[^a-z0-9]/g, ' ').trim()
  const courseWords = cleanCourse.split(' ').filter(w => w.length > 2)
  const clubWords = cleanClub.split(' ').filter(w => w.length > 2)
  if (courseWords.length > 0) {
    const matchingWords = courseWords.filter(word => 
      clubWords.some(clubWord => clubWord.includes(word) || word.includes(clubWord))
    )
    if (matchingWords.length / courseWords.length >= 0.7) return clubName
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
  
  // NEW: Image resizing utility to prevent memory crashes
  const resizeImage = (blob) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        
        // Max size 1200px (plenty for social, safe for memory)
        const MAX_SIZE = 1200
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width
            width = MAX_SIZE
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height
            height = MAX_SIZE
          }
        }
        
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85)) // High quality JPG
      }
      img.src = URL.createObjectURL(blob)
    })
  }

  useEffect(() => {
    const loadImage = async () => {
      if (!photoUrl) {
        setImageLoaded(true)
        return
      }
      
      const timeout = setTimeout(() => {
        console.log('Image load timeout')
        setImageLoaded(true)
      }, 5000)
      
      try {
        const response = await fetch(photoUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        
        const blob = await response.blob()
        
        // CHANGED: Resize image before storing
        const resizedDataUrl = await resizeImage(blob)
        
        clearTimeout(timeout)
        setImageDataUrl(resizedDataUrl)
        setImageLoaded(true)
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
    
    // CHANGED: Increased timeout to 15s to be safe
    const safetyTimer = setTimeout(() => {
        setIsGenerating(false)
        alert('Sharing took too long. Try a different photo or just copy the link.')
    }, 15000)

    try {
      if (!cardRef.current) throw new Error('Card ref not available')
      
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#e2e8f0',
        logging: false,
      })
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      clearTimeout(safetyTimer)
      
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
      alert('Could not generate image.')
    }
    
    setIsGenerating(false)
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl max-w-sm w-full max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-bold">Share Round</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        {/* LIVE PREVIEW - SCALED DOWN */}
        <div className="p-4 bg-gray-50 flex justify-center overflow-hidden shrink-0">
            <div style={{ 
                width: '360px', 
                height: '440px', 
                transform: 'scale(0.75)',
                transformOrigin: 'top center',
                marginBottom: '-110px'
            }}>
                {/* Preview is relative, so it shows up */}
                <ShareImageCard 
                    round={round}
                    username={username}
                    photoUrl={imageDataUrl}
                />
            </div>
        </div>
        
        <div className="p-4 space-y-3 bg-white relative z-10">
          <button onClick={handleCopyLink} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
            {linkCopied ? <span className="text-green-600 font-bold">✓ Copied!</span> : <span>🔗 Copy Link</span>}
          </button>
          
          <button onClick={handleShareImage} disabled={isGenerating || !imageLoaded} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
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
      
      {/* HIDDEN CAPTURE CARD - Fixed Offscreen */}
      {createPortal(
        <ShareImageCard 
          ref={cardRef}
          round={round}
          username={username}
          photoUrl={imageDataUrl}
          // CHANGED: Force this specific instance to be fixed and hidden
          style={{ position: 'fixed', left: '-9999px', top: 0 }}
        />,
        document.body
      )}
    </div>
  )
}

export default ShareModal