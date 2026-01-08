import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'

const RoundShareModal = ({ round, onClose, userProfile }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const cardRef = useRef(null)

  // 1. EXACT Style Logic from MyRounds.js
  const getScoreStyle = (score, par) => {
    if (!score || score === '') return { backgroundColor: 'white', color: '#999' }
    
    const diff = parseInt(score) - parseInt(par)
    if (diff <= -2) return { backgroundColor: '#0d7d0d', color: '#fff' } // Eagle
    if (diff === -1) return { backgroundColor: '#4caf50', color: '#fff' } // Birdie
    if (diff === 0) return { backgroundColor: 'white', color: '#333' }    // Par
    if (diff === 1) return { backgroundColor: '#ffcdd2', color: '#333' }  // Bogey
    if (diff === 2) return { backgroundColor: '#ef5350', color: '#fff' }  // Double
    return { backgroundColor: '#c62828', color: '#fff' }                  // Triple+
  }

  // 2. Logic to Generate Image
  const handleShare = async () => {
    setIsGenerating(true)
    if (!cardRef.current) return

    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 3, 
        backgroundColor: null,
        logging: false
      })

      canvas.toBlob(async (blob) => {
        if (!blob) return
        
        const file = new File([blob], 'dogleg-round.png', { type: 'image/png' })

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Round at ${round.course_name}`,
              text: `Shot a ${round.total} at ${round.course_name}!`
            })
          } catch (err) {
            console.log('Share dismissed')
          }
        } else {
          const link = document.createElement('a')
          link.href = canvas.toDataURL('image/png')
          link.download = `dogleg-${round.date || 'share'}.png`
          link.click()
        }
        setIsGenerating(false)
        onClose() 
      }, 'image/png')

    } catch (error) {
      console.error('Share Error:', error)
      setIsGenerating(false)
      alert('Could not create image. Please try again.')
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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm flex flex-col gap-4">
        
        {/* Header */}
        <div className="flex justify-between items-center text-white px-1">
          <h3 className="font-bold text-lg">Share Preview</h3>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {/* --- THE IMAGE AREA --- */}
        <div 
          ref={cardRef} 
          className="relative overflow-hidden rounded-xl bg-[#0f172a] text-white shadow-2xl"
          style={{ aspectRatio: '4/5' }}
        >
            {/* Background Image (Darkened) */}
            {round.photo ? (
                <div className="absolute inset-0 z-0">
                    <img src={round.photo} className="w-full h-full object-cover opacity-30 mix-blend-overlay" crossOrigin="anonymous" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent"></div>
                </div>
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-green-900 to-[#0f172a] z-0"></div>
            )}

            {/* Content Container */}
            <div className="relative z-10 p-6 flex flex-col h-full justify-between">
                
                {/* 1. Header Info */}
                <div>
                    <div className="flex items-center gap-2 mb-2 opacity-90">
                        <span className="text-xl">🏌️</span>
                        <span className="font-bold tracking-widest text-xs uppercase">Dogleg.io</span>
                    </div>
                    <div className="text-sm font-light text-gray-300">
                        {userProfile?.username || 'Golfer'} posted a score
                    </div>
                    <h1 className="text-2xl font-bold leading-tight mt-1 text-white drop-shadow-lg">
                        {round.course_name}
                    </h1>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-6xl font-black tracking-tighter text-white drop-shadow-2xl">
                            {round.total}
                        </span>
                        <span className={`text-2xl font-bold drop-shadow-lg ${diffScore.toString().includes('+') ? 'text-blue-400' : diffScore === 'E' ? 'text-white' : 'text-green-400'}`}>
                            ({diffScore})
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                       {round.date ? new Date(round.date).toLocaleDateString() : new Date().toLocaleDateString()} • {round.city}
                    </p>
                </div>

                {/* 2. THE SCORECARD (Exact replica of MyRounds style) */}
                <div className="bg-white text-gray-900 rounded-lg p-3 shadow-xl mt-2">
                    {hasHoles ? (
                        <div className="flex flex-col gap-4">
                             {/* --- FRONT 9 --- */}
                             <div>
                                <div className="bg-gray-100 px-2 py-1 rounded mb-1 inline-block">
                                    <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Front 9</div>
                                </div>
                                <div className="grid grid-cols-10 gap-0.5 text-center text-[10px]">
                                    {/* Hole Numbers */}
                                    {[1,2,3,4,5,6,7,8,9].map(n => <div key={n} className="text-gray-400 font-medium pb-1">{n}</div>)}
                                    <div className="text-gray-800 font-bold pb-1 border-l border-gray-200">OUT</div>

                                    {/* Scores */}
                                    {round.holes.slice(0,9).map((score, i) => (
                                        <div key={i} className="flex justify-center h-6">
                                            <div 
                                                className="w-full h-full flex items-center justify-center rounded font-bold"
                                                style={getScoreStyle(score, pars[i])}
                                            >
                                                {score}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="font-bold bg-gray-900 text-white rounded flex items-center justify-center h-6 ml-0.5">{round.front9}</div>
                                </div>
                             </div>

                             {/* --- BACK 9 --- */}
                             <div>
                                <div className="bg-gray-100 px-2 py-1 rounded mb-1 inline-block">
                                    <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Back 9</div>
                                </div>
                                <div className="grid grid-cols-10 gap-0.5 text-center text-[10px]">
                                    {/* Hole Numbers */}
                                    {[10,11,12,13,14,15,16,17,18].map(n => <div key={n} className="text-gray-400 font-medium pb-1">{n}</div>)}
                                    <div className="text-gray-800 font-bold pb-1 border-l border-gray-200">IN</div>

                                    {/* Scores */}
                                    {round.holes.slice(9,18).map((score, i) => (
                                        <div key={i} className="flex justify-center h-6">
                                            <div 
                                                className="w-full h-full flex items-center justify-center rounded font-bold"
                                                style={getScoreStyle(score, pars[i+9])}
                                            >
                                                {score}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="font-bold bg-gray-900 text-white rounded flex items-center justify-center h-6 ml-0.5">{round.back9}</div>
                                </div>
                             </div>
                        </div>
                    ) : (
                        // Fallback (Simple View)
                        <div className="flex justify-around items-center px-4 py-4">
                            <div className="text-center">
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Front</div>
                                <div className="text-3xl font-bold">{round.front9 || '-'}</div>
                            </div>
                            <div className="h-10 w-px bg-gray-200"></div>
                            <div className="text-center">
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Back</div>
                                <div className="text-3xl font-bold">{round.back9 || '-'}</div>
                            </div>
                            <div className="h-10 w-px bg-gray-200"></div>
                            <div className="text-center">
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total</div>
                                <div className="text-3xl font-bold text-blue-900">{round.total}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-4 flex justify-between items-end opacity-80">
                     <div className="text-[10px] text-white/70">
                        {round.tee?.tee_name ? `${round.tee.tee_name} TEES` : 'TEES'}
                     </div>
                     <div className="text-[10px] text-white/70 text-right">
                        Posted on <span className="font-bold text-white">dogleg.io</span>
                     </div>
                </div>
            </div>
        </div>

        {/* --- ACTION BUTTON --- */}
        <button 
            onClick={handleShare}
            disabled={isGenerating}
            className="w-full bg-green-600 active:bg-green-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
            {isGenerating ? (
                <>
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                </>
            ) : (
                <>
                    <span>🚀</span> Share Round
                </>
            )}
        </button>
      </div>
    </div>
  )
}

export default RoundShareModal