import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import ShareImageCard from './ShareImageCard'

function ShareModal({ round, username, onClose }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const cardRef = useRef(null)
  
  const shareUrl = `https://dogleg.io/rounds/${round.short_code || round.id}`
  
  // Generate preview on mount
  useEffect(() => {
    generatePreview()
  }, [])
  
  const generatePreview = async () => {
    // Small delay to ensure the card is rendered
    await new Promise(resolve => setTimeout(resolve, 100))
    
    if (cardRef.current) {
      try {
        const canvas = await html2canvas(cardRef.current, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
        })
        setPreviewUrl(canvas.toDataURL('image/png'))
      } catch (error) {
        console.error('Error generating preview:', error)
      }
    }
  }
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
      // Fallback for older browsers
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
    
    try {
      if (!cardRef.current) {
        throw new Error('Card ref not available')
      }
      
      const canvas = await html2canvas(cardRef.current, {
        scale: 3, // High quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      })
      
      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      
      // Check if native share is available (mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `dogleg-round-${round.short_code || round.id}.png`, { type: 'image/png' })
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'My Golf Round',
            text: `I shot ${round.total} at ${round.course_name || round.club_name}! Check it out on Dogleg.io`,
          })
          setIsGenerating(false)
          onClose()
          return
        }
      }
      
      // Fallback: download the image
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dogleg-round-${round.short_code || round.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      console.error('Error sharing image:', error)
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
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Preview */}
        <div className="p-4">
          <div className="rounded-lg overflow-hidden shadow-lg mx-auto" style={{ maxWidth: '280px' }}>
            {previewUrl ? (
              <img 
                src={previewUrl} 
                alt="Share preview" 
                className="w-full h-auto"
              />
            ) : (
              <div className="bg-gray-100 aspect-[4/5] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            )}
          </div>
        </div>
        
        {/* Share Options */}
        <div className="p-4 space-y-3">
          {/* Copy Link */}
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
          
          {/* Share/Download Image */}
          <button
            onClick={handleShareImage}
            disabled={isGenerating || !previewUrl}
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
            {navigator.share ? 'Share directly to Instagram, Messages, and more' : 'Download image to share on social media'}
          </p>
        </div>
      </div>
      
      {/* Hidden card for html2canvas */}
      <ShareImageCard 
        ref={cardRef}
        round={round}
        username={username}
        photoUrl={round.photo}
      />
    </div>
  )
}

export default ShareModal