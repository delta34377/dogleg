import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import ShareImageCard from './ShareImageCard'

const getDisplayName = (round) => {
  let courseName = round.course_name
  let clubName = round.club_name
  
  const toProperCase = (str) => {
    if (!str) return str
    if (str === str.toUpperCase() && str.length > 2) {
      return str
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
          if (index > 0 && ['of', 'at', 'the'].includes(word)) return word
          return word.charAt(0).toUpperCase() + word.slice(1)
        })
        .join(' ')
    }
    return str
  }
  
  courseName = toProperCase(courseName)
  clubName = toProperCase(clubName)
  
  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') {
    return clubName || 'Unknown Course'
  }
  if (!clubName) return courseName
  
  const cleanCourse = courseName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi, '').replace(/[^a-z0-9]/g, ' ').trim()
  const cleanClub = clubName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi, '').replace(/[^a-z0-9]/g, ' ').trim()
  const courseWords = cleanCourse.split(' ').filter(w => w.length > 2)
  const clubWords = cleanClub.split(' ').filter(w => w.length > 2)
  
  if (courseWords.length > 0) {
    const matchingWords = courseWords.filter(word => clubWords.some(clubWord => clubWord.includes(word) || word.includes(clubWord)))
    if (matchingWords.length / courseWords.length >= 0.7) return clubName
  }
  
  return `${courseName} @ ${clubName}`
}

function ShareModal({ round, username, onClose }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [imageDataUrl, setImageDataUrl] = useState(null)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const cardRef = useRef(null)
  
  const shareUrl = `https://dogleg.io/rounds/${round.short_code || round.id}`
  const photoUrl = round.photo || round.photo_url

  // Step 1: Load and compress photo
  useEffect(() => {
    if (!photoUrl) {
      setPhotoLoaded(true)
      return
    }
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const maxWidth = 400
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      setImageDataUrl(canvas.toDataURL('image/jpeg', 0.8))
      setPhotoLoaded(true)
    }
    img.onerror = () => {
      console.log('Photo load error')
      setPhotoLoaded(true)
    }
    img.src = photoUrl
  }, [photoUrl])

  // Step 2: Generate preview after photo loads
  useEffect(() => {
    if (!photoLoaded) return
    if (!cardRef.current) return
    
    const timer = setTimeout(async () => {
      try {
        const canvas = await html2canvas(cardRef.current, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#e2e8f0',
          onclone: (clonedDoc, element) => {
            element.style.position = 'static'
            element.style.opacity = '1'
            element.style.left = '0'
            element.style.top = '0'
          }
        })
        setPreviewUrl(canvas.toDataURL('image/png'))
      } catch (e) {
        console.error('Preview generation failed:', e)
        setPreviewUrl('error')
      }
    }, 500)
    
    return () => clearTimeout(timer)
  }, [photoLoaded, imageDataUrl])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch (err) {
      const textArea = document.createElement('textarea')
      textArea.value = shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleShareImage = async () => {
    if (!cardRef.current) return
    
    setIsGenerating(true)
    
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#e2e8f0',
        onclone: (clonedDoc, element) => {
          element.style.position = 'static'
          element.style.opacity = '1'
          element.style.left = '0'
          element.style.top = '0'
        }
      })
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `dogleg-round-${round.short_code || round.id}.png`, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Golf Round',
            text: `I shot ${round.total} at ${getDisplayName(round)}!`,
          })
          onClose()
          return
        }
      }
      
      // Fallback: download
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dogleg-round-${round.short_code || round.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Share error:', error)
      alert('Failed to generate image. Please try again.')
    }
    
    setIsGenerating(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Share Round</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        
        {/* Preview */}
        <div className="p-4">
          <div className="rounded-lg overflow-hidden shadow-lg mx-auto" style={{ maxWidth: '280px' }}>
            {previewUrl && previewUrl !== 'error' ? (
              <img src={previewUrl} alt="Preview" className="w-full h-auto" />
            ) : previewUrl === 'error' ? (
              <div className="bg-gray-200 aspect-[4/5] flex items-center justify-center p-4 text-center">
                <p className="text-gray-600 text-sm">Preview unavailable</p>
              </div>
            ) : (
              <div className="bg-gray-200 aspect-[4/5] flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                <p className="text-xs text-gray-500 mt-2">Generating preview...</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Buttons */}
        <div className="p-4 space-y-3">
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            {linkCopied ? (
              <>
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600">Link Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Copy Link</span>
              </>
            )}
          </button>
          
          <button
            onClick={handleShareImage}
            disabled={isGenerating || !previewUrl || previewUrl === 'error'}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Share Image</span>
              </>
            )}
          </button>
          
          <p className="text-xs text-center text-gray-500">
            {navigator.share ? 'Share directly to Instagram, Messages, and more' : 'Download image to share'}
          </p>
        </div>
      </div>
      
      {/* Hidden card for html2canvas */}
      <ShareImageCard ref={cardRef} round={round} username={username} photoUrl={imageDataUrl} />
    </div>
  )
}

export default ShareModal