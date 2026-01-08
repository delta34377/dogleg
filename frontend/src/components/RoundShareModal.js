import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'

const RoundShareModal = ({ round, onClose, userProfile }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const cardRef = useRef(null)

  // 1. Helper to color code scores vs Par
  const getScoreStyle = (score, par) => {
    if (!score || score === '') return 'text-gray-800'
    const diff = parseInt(score) - parseInt(par)
    
    // GHIN Colors:
    // Eagle (-2): Yellow circle
    if (diff <= -2) return 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400 rounded-full w-6 h-6 flex items-center justify-center font-bold'
    // Birdie (-1): Red circle
    if (diff === -1) return 'border border-red-500 rounded-full w-6 h-6 flex items-center justify-center text-red-600 font-bold'
    // Par (0): Plain text
    if (diff === 0) return 'text-gray-900 font-bold'
    // Bogey (+1): Gray square
    if (diff === 1) return 'bg-gray-100 border border-gray-400 rounded w-6 h-6 flex items-center justify-center text-gray-800'
    // Double+ (+2): Black square
    if (diff >= 2) return 'bg-gray-800 border-2 border-gray-900 rounded w-6 h-6 flex items-center justify-center text-white font-bold'
    
    return 'text-gray-800'
  }

  // 2. Logic to Share/Download
  const handleShare = async () => {
    setIsGenerating(true)
    if (!cardRef.current) return

    try {
      // Create the image
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true, // Allow images from other domains
        scale: 3, // High resolution (3x) for crisp text
        backgroundColor: null
      })

      canvas.toBlob(async (blob) => {
        if (!blob) return
        
        const file = new File([blob], 'dogleg-round.png', { type: 'image/png' })

        // Try native mobile share
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'My Round on Dogleg',
              text: `Shot a ${round.total} at ${round.course_name}! 🏌️‍♂️`
            })
          } catch (err) {
            console.log('Share closed:', err)
          }
        } else {
          // Desktop fallback: Download it
          const link = document.createElement('a')
          link.href = canvas.toDataURL('image/png')
          link.download = 'dogleg-share.png'
          link.click()
        }
        setIsGenerating(false)
      }, 'image/png')

    } catch (error) {
      console.error('Error:', error)
      setIsGenerating(false)
      alert('Could not generate image')
    }
  }

  // 3. Score Calculations
  const pars = round.coursePars || Array(18).fill(4)
  const calculateDiff = () => {
    let totalPar = round.coursePars ? round.coursePars.reduce((a,b)=>a+parseInt(b),0) : 72
    const diff = round.total - totalPar
    if(diff > 0) return `+${diff}`
    if(diff === 0) return 'E'
    return diff
  }

  const hasHoles = round.holes && round.holes.some(h => h)
  const diffScore = calculateDiff()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-sm">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-lg">Share Preview</h3>
          <button onClick={onClose} className="text-white bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
        </div>

        {/* --- THE IMAGE AREA --- */}
        <div ref={cardRef} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl overflow-hidden shadow-2xl relative text-white" style={{ aspectRatio: '4/5' }}>
            
            {/* Optional Photo Background */}
            {round.photo && (
                <div className="absolute inset-0 z-0 opacity-40">
                    <img src={round.photo} className="w-full h-full object-cover grayscale mix-blend-overlay" crossOrigin="anonymous" alt="" />
                </div>
            )}

            {/* Content */}
            <div className="relative z-10 p-6 flex flex-col h-full justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-2 opacity-90">
                        <span className="text-xl">🏌️</span>
                        <span className="font-bold tracking-widest text-xs uppercase">Dogleg.io</span>
                    </div>
                    <div className="text-sm font-light text-gray-300">
                        {userProfile?.username || 'Golfer'} posted a score at
                    </div>
                    <h1 className="text-3xl font-bold leading-tight mt-1 text-white shadow-black drop-shadow-md">
                        {round.course_name}
                    </h1>
                    <p className="text-xs text-gray-300 mt-2 flex items-center gap-1">
                       📅 {new Date().toLocaleDateString()} • 📍 {round.city || 'Golf City'}, {round.state || 'FL'}
                    </p>
                </div>

                {/* Big Score */}
                <div className="flex items-baseline gap-3 my-2">
                    <span className="text-9xl font-black tracking-tighter text-white drop-shadow-xl">
                        {round.total}
                    </span>
                    <span className={`text-4xl font-bold drop-shadow-md ${diffScore.toString().includes('+') ? 'text-red-400' : 'text-green-400'}`}>
                        ({diffScore})
                    </span>
                </div>

                {/* Scorecard Grid */}
                {hasHoles ? (
                    <div className="bg-white/95 backdrop-blur-sm text-gray-900 rounded-lg p-3 shadow-lg">
                        <div className="grid grid-cols-10 gap-y-1 text-center text-[10px] sm:text-xs">
                             {/* Header Row */}
                            <div className="col-span-1 text-left font-bold text-gray-400">#</div>
                            {[1,2,3,4,5,6,7,8,9].map(n => <div key={n} className="text-gray-400">{n}</div>)}
                            <div className="text-gray-400 border-l border-gray-300">Out</div>

                             {/* Scores Row */}
                            <div className="col-span-1 text-left font-bold text-gray-800">Sc</div>
                            {round.holes.slice(0,9).map((score, i) => (
                                <div key={i} className="flex justify-center">
                                    <div className={getScoreStyle(score, pars[i])}>{score}</div>
                                </div>
                            ))}
                            <div className="font-bold border-l border-gray-300">{round.front9}</div>

                             {/* Header Row Back */}
                             <div className="col-span-1 text-left font-bold text-gray-400 mt-1">#</div>
                            {[10,11,12,13,14,15,16,17,18].map(n => <div key={n} className="text-gray-400 mt-1">{n}</div>)}
                            <div className="text-gray-400 border-l border-gray-300 mt-1">In</div>

                             {/* Scores Row Back */}
                            <div className="col-span-1 text-left font-bold text-gray-800">Sc</div>
                            {round.holes.slice(9,18).map((score, i) => (
                                <div key={i} className="flex justify-center">
                                    <div className={getScoreStyle(score, pars[i+9])}>{score}</div>
                                </div>
                            ))}
                            <div className="font-bold border-l border-gray-300">{round.back9}</div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white/90 text-gray-900 rounded-lg p-4 shadow-lg flex justify-between items-center px-8">
                        <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase">Front</div>
                            <div className="text-2xl font-bold">{round.front9 || '-'}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase">Back</div>
                            <div className="text-2xl font-bold">{round.back9 || '-'}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase">Total</div>
                            <div className="text-2xl font-bold">{round.total}</div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex justify-between items-end opacity-80">
                     <div className="text-[10px] text-white">
                        HANDICAP INDEX® <span className="font-bold">12.3</span>
                     </div>
                     <div className="text-[10px] text-white text-right">
                        Posted on <span className="font-bold">Dogleg.io</span>
                     </div>
                </div>
            </div>
        </div>

        {/* --- ACTIONS --- */}
        <button 
            onClick={handleShare}
            disabled={isGenerating}
            className="w-full mt-6 bg-green-600 active:bg-green-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
            {isGenerating ? 'Generating...' : '🚀 Share to Instagram / Text'}
        </button>
      </div>
    </div>
  )
}

export default RoundShareModal