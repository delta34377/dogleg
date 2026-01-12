import { useState, useEffect, useCallback, useRef } from 'react'

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
  const [previewUrl, setPreviewUrl] = useState(null)
  const [generatedBlob, setGeneratedBlob] = useState(null)
  
  const shareUrl = `https://dogleg.io/rounds/${round.short_code || round.id}`
  const photoUrl = round.photo || round.photo_url

  // Helper to shrink text to fit width
  const drawTextToFit = (ctx, text, x, y, maxWidth, initialFontSize) => {
    let fontSize = initialFontSize
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    
    while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
      fontSize -= 1
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    }
    
    ctx.fillText(text, x, y)
    return fontSize
  }

  const generateImage = useCallback(async (scale = 3) => {
    const W = 360 * scale
    const H = 450 * scale 
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    
    ctx.scale(scale, scale)
    
    // --- LAYOUT CONFIGURATION ---
    const photoH = 450 * 0.65 
    const scorecardH = 450 - photoH
    
    // Load photo
    let photoImg = null
    if (photoUrl) {
      try {
        photoImg = await new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('Photo load failed'))
          img.src = photoUrl
        })
      } catch (e) {
        console.log('Photo failed to load, using gradient')
      }
    }
    
    // 1. DRAW PHOTO BACKGROUND
    if (photoImg) {
      const imgRatio = photoImg.width / photoImg.height
      const areaRatio = 360 / photoH
      let dw, dh, dx, dy
      if (imgRatio > areaRatio) {
        dh = photoH
        dw = photoH * imgRatio
        dx = -(dw - 360) / 2
        dy = 0
      } else {
        dw = 360
        dh = 360 / imgRatio
        dx = 0
        dy = -(dh - photoH) / 2
      }
      ctx.drawImage(photoImg, dx, dy, dw, dh)
      
      const overlay = ctx.createLinearGradient(0, 0, 0, photoH)
      overlay.addColorStop(0, 'rgba(0,0,0,0.6)')   
      overlay.addColorStop(0.3, 'rgba(0,0,0,0.2)') 
      overlay.addColorStop(1, 'rgba(0,0,0,0.6)')   
      ctx.fillStyle = overlay
      ctx.fillRect(0, 0, 360, photoH)
    } else {
      const grad = ctx.createLinearGradient(0, 0, 360, photoH)
      grad.addColorStop(0, '#15803d')
      grad.addColorStop(0.5, '#166534')
      grad.addColorStop(1, '#14532d')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 360, photoH)
    }
    
    // 2. TEXT & CONTENT
    ctx.fillStyle = 'white'
    ctx.textBaseline = 'top'
    
    // --- ADDED: Drop Shadow for legibility on white photos ---
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 1
    // --------------------------------------------------------
    
    // -- Top Section --
    // Load and draw logo
try {
  const logoImg = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject()
    img.src = '/logo-share.png'
  })
  ctx.drawImage(logoImg, 10, 8, 28, 28)
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('dogleg.io', 42, 16)
} catch (e) {
  // Fallback if logo fails
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('🏌️ dogleg.io', 16, 16)
}
    
    let currentY = 50 
    
    // Username
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.globalAlpha = 0.95
    ctx.fillText(`${username} posted a score`, 16, currentY)
    ctx.globalAlpha = 1
    
    currentY += 20 
    
    // Course Name
    const courseName = getDisplayName(round)
    drawTextToFit(ctx, courseName, 16, currentY, 320, 28) 
    
    currentY += 34 
    
    // Date & Location
    const formatDate = (d) => {
      if (!d) return ''
      const [y, m, day] = d.split('T')[0].split('-')
      return `${parseInt(m)}/${parseInt(day)}/${y}`
    }
    
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.globalAlpha = 0.9
    ctx.fillText(`${formatDate(round.date)} • ${round.city}, ${round.state}`, 16, currentY)
    ctx.globalAlpha = 1
    
    // -- Bottom Section (Score) --
    const scoreY = photoH - 90 
    
    ctx.font = 'bold 80px -apple-system, BlinkMacSystemFont, sans-serif'
    const scoreText = String(round.total)
    ctx.fillText(scoreText, 14, scoreY)
    
    const scoreWidth = ctx.measureText(scoreText).width
    
    // Vs Par
    const calcVsPar = () => {
      if (!round.par && !round.coursePars) return null
      let par = round.par || 72
      if (round.holes && round.holes.some(h => h) && round.coursePars) {
        par = round.holes.reduce((s, score, i) => score ? s + parseInt(round.coursePars[i] || 4) : s, 0)
      }
      const diff = round.total - par
      return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
    }
    
    const vsPar = calcVsPar()
    if (vsPar) {
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = vsPar.startsWith('-') ? '#4ade80' : vsPar.startsWith('+') ? '#fca5a5' : 'white'
      ctx.fillText(`(${vsPar})`, 14 + scoreWidth + 15, scoreY + 42) 
    }
    
    // 3. SCORECARD SECTION
    
    // --- RESET SHADOWS (Important: Scorecard shouldn't have drop shadows) ---
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    // ------------------------------------------------------------------------

    const scGrad = ctx.createLinearGradient(0, photoH, 0, 450)
    scGrad.addColorStop(0, '#f1f5f9')
    scGrad.addColorStop(1, '#e2e8f0')
    ctx.fillStyle = scGrad
    ctx.fillRect(0, photoH, 360, scorecardH)
    
    // Scorecard logic
    const hasHoles = round.holes && round.holes.some(h => h !== '' && h !== null)
    const pars = round.coursePars || Array(18).fill(4)
    
    const getScoreColor = (score, par) => {
      if (!score) return { bg: '#ffffff', fg: '#334155' }
      const diff = parseInt(score) - parseInt(par)
      if (diff <= -2) return { bg: '#0d7d0d', fg: '#ffffff' }
      if (diff === -1) return { bg: '#4caf50', fg: '#ffffff' }
      if (diff === 0) return { bg: '#ffffff', fg: '#334155' }
      if (diff === 1) return { bg: '#ffcdd2', fg: '#333333' }
      if (diff === 2) return { bg: '#ef5350', fg: '#ffffff' }
      return { bg: '#c62828', fg: '#ffffff' }
    }
    
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }
    
    if (hasHoles) {
      const cellW = 32
      const gap = 2
      const startX = 10 
      
      let y = photoH + 15 
      
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // --- FRONT 9 ---
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#64748b'
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(i + 1), startX + i * (cellW + gap) + cellW/2, y)
      }
      ctx.fillText('Out', startX + 9 * (cellW + gap) + cellW/2, y)
      
      y += 14
      
      ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#94a3b8'
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(pars[i]), startX + i * (cellW + gap) + cellW/2, y)
      }
      const frontPar = pars.slice(0, 9).reduce((a, b) => a + parseInt(b), 0)
      ctx.fillText(String(frontPar), startX + 9 * (cellW + gap) + cellW/2, y)
      
      y += 20 
      
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif'
      for (let i = 0; i < 9; i++) {
        const score = round.holes[i]
        const colors = getScoreColor(score, pars[i])
        ctx.fillStyle = colors.bg
        roundRect(startX + i * (cellW + gap), y - 10, cellW, 28, 4)
        ctx.fill()
        ctx.fillStyle = colors.fg
        ctx.fillText(score || '-', startX + i * (cellW + gap) + cellW/2, y + 4)
      }
      // Out total
      ctx.fillStyle = '#1e293b'
      roundRect(startX + 9 * (cellW + gap), y - 10, cellW, 28, 4)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.fillText(String(round.front9 || '-'), startX + 9 * (cellW + gap) + cellW/2, y + 4)
      
      // --- BACK 9 ---
      y += 42 
      
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#64748b'
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(i + 10), startX + i * (cellW + gap) + cellW/2, y)
      }
      ctx.fillText('In', startX + 9 * (cellW + gap) + cellW/2, y)
      
      y += 14
      
      ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#94a3b8'
      for (let i = 0; i < 9; i++) {
        ctx.fillText(String(pars[i + 9]), startX + i * (cellW + gap) + cellW/2, y)
      }
      const backPar = pars.slice(9, 18).reduce((a, b) => a + parseInt(b), 0)
      ctx.fillText(String(backPar), startX + 9 * (cellW + gap) + cellW/2, y)
      
      y += 20
      
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif'
      for (let i = 0; i < 9; i++) {
        const score = round.holes[i + 9]
        const colors = getScoreColor(score, pars[i + 9])
        ctx.fillStyle = colors.bg
        roundRect(startX + i * (cellW + gap), y - 10, cellW, 28, 4)
        ctx.fill()
        ctx.fillStyle = colors.fg
        ctx.fillText(score || '-', startX + i * (cellW + gap) + cellW/2, y + 4)
      }
      // In total
      ctx.fillStyle = '#1e293b'
      roundRect(startX + 9 * (cellW + gap), y - 10, cellW, 28, 4)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.fillText(String(round.back9 || '-'), startX + 9 * (cellW + gap) + cellW/2, y + 4)
      
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      
    } else {
      // Fallback display
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const centerY = photoH + scorecardH / 2
      
      ctx.fillStyle = 'white'
      roundRect(80, centerY - 35, 80, 70, 12)
      ctx.fill()
      
      roundRect(200, centerY - 35, 80, 70, 12)
      ctx.fill()
      
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Front 9', 120, centerY - 15)
      ctx.fillText('Back 9', 240, centerY - 15)
      
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = '#1e293b'
      ctx.fillText(String(round.front9 || '--'), 120, centerY + 15)
      ctx.fillText(String(round.back9 || '--'), 240, centerY + 15)
      
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
    }
    
    return canvas
  }, [photoUrl, round, username])

  // Generate preview on mount
  useEffect(() => {
    const generate = async () => {
      try {
        const canvas = await generateImage(2)
        setPreviewUrl(canvas.toDataURL('image/png'))
        
        const fullCanvas = await generateImage(3)
        const blob = await new Promise(resolve => fullCanvas.toBlob(resolve, 'image/png'))
        setGeneratedBlob(blob)
      } catch (e) {
        console.error('Image generation failed:', e)
        setPreviewUrl('error')
      }
    }
    generate()
  }, [generateImage])

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
    if (!generatedBlob) return
    
    setIsGenerating(true)
    
    try {
      if (navigator.share && navigator.canShare) {
        const file = new File([generatedBlob], `dogleg-round-${round.short_code || round.id}.png`, { type: 'image/png' })
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
      
      const url = URL.createObjectURL(generatedBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dogleg-round-${round.short_code || round.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Share error:', error)
      alert('Failed to share image. Please try again.')
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
            disabled={isGenerating || !generatedBlob}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Sharing...</span>
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
    </div>
  )
}

export default ShareModal