import { forwardRef } from 'react'

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

const ShareImageCard = forwardRef(({ round, username, photoUrl }, ref) => {
  const calculateVsPar = () => {
    if (!round.par && !round.coursePars) return null
    let parForHolesPlayed = round.par || 72
    if (round.holes && round.holes.some(h => h)) {
      const playedHoleIndices = []
      round.holes.forEach((score, index) => {
        if (score !== null && score !== '' && score !== undefined) {
          playedHoleIndices.push(index)
        }
      })
      if (round.coursePars && playedHoleIndices.length > 0) {
        parForHolesPlayed = playedHoleIndices.reduce((sum, holeIndex) => {
          return sum + parseInt(round.coursePars[holeIndex] || 4)
        }, 0)
      }
    }
    const diff = round.total - parForHolesPlayed
    if (diff === 0) return 'E'
    if (diff > 0) return `+${diff}`
    return `${diff}`
  }

  const vsPar = calculateVsPar()
  const hasPhoto = !!photoUrl
  const hasHoleByHole = round.holes && round.holes.some(h => h !== '' && h !== null)
  const pars = round.coursePars || Array(18).fill(4)
  
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('T')[0].split('-')
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  }

  const getScoreColor = (score, par) => {
    if (!score) return { background: 'white', color: '#334155', border: '1px solid #e2e8f0' }
    const diff = parseInt(score) - parseInt(par)
    if (diff <= -2) return { background: '#0d7d0d', color: 'white' }
    if (diff === -1) return { background: '#4caf50', color: 'white' }
    if (diff === 0) return { background: 'white', color: '#334155', border: '1px solid #e2e8f0' }
    if (diff === 1) return { background: '#ffcdd2', color: '#333' }
    if (diff === 2) return { background: '#ef5350', color: 'white' }
    return { background: '#c62828', color: 'white' }
  }

  return (
    <div 
      ref={ref}
      style={{
        width: '360px',
        height: '450px',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'fixed',
        top: '0px',
        left: '0px',
        opacity: '0.01',
        pointerEvents: 'none',
        zIndex: 40,
        background: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)',
      }}
    >
      {/* Photo section - 55% */}
      <div 
        style={{
          position: 'relative',
          height: '55%',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #15803d 0%, #166534 50%, #14532d 100%)',
        }}
      >
        {/* Photo as img tag for better html2canvas support */}
        {hasPhoto && (
          <img 
            src={photoUrl}
            crossOrigin="anonymous"
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        
        {/* Overlay */}
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            background: hasPhoto 
              ? 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.5) 100%)'
              : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.2) 100%)',
          }}
        />
        
        <div 
          style={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 14px 8px 14px',
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            <span style={{ fontSize: '16px' }}>🏌️</span>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Dogleg.io</span>
          </div>
          
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: '12px', opacity: 0.95, marginBottom: '1px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {username} posted a score
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.15, marginBottom: '1px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {getDisplayName(round)}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {formatDate(round.date)} • {round.city}, {round.state}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '60px', fontWeight: 800, lineHeight: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {round.total}
              </span>
              {vsPar && (
                <span style={{ 
                  fontSize: '22px', 
                  fontWeight: 700,
                  color: vsPar.startsWith('-') ? '#4ade80' : vsPar.startsWith('+') ? '#fca5a5' : 'white',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}>
                  ({vsPar})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Scorecard section - 45% */}
      <div 
        style={{
          flex: 1,
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        {hasHoleByHole ? (
          <>
            {/* Front 9 */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {[1,2,3,4,5,6,7,8,9,'Out'].map(h => (
                  <div key={`fh-${h}`} style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#475569' }}>{h}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {pars.slice(0,9).map((p, i) => (
                  <div key={`fp-${i}`} style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 500, color: '#64748b' }}>{p}</div>
                ))}
                <div style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 500, color: '#64748b' }}>
                  {pars.slice(0,9).reduce((a,b) => a + parseInt(b), 0)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {round.holes.slice(0,9).map((s, i) => {
                  const colors = getScoreColor(s, pars[i])
                  return (
                    <div key={`fs-${i}`} style={{ 
                      height: '32px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px', 
                      fontWeight: 700, 
                      borderRadius: '4px', 
                      background: colors.background, 
                      color: colors.color, 
                      border: colors.border || 'none',
                      boxSizing: 'border-box',
                    }}>{s || '-'}</div>
                  )
                })}
                <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, borderRadius: '4px', background: '#1e293b', color: 'white' }}>{round.front9}</div>
              </div>
            </div>
            
            {/* Back 9 */}
            <div style={{ marginTop: '6px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {[10,11,12,13,14,15,16,17,18,'In'].map(h => (
                  <div key={`bh-${h}`} style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#475569' }}>{h}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {pars.slice(9,18).map((p, i) => (
                  <div key={`bp-${i}`} style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 500, color: '#64748b' }}>{p}</div>
                ))}
                <div style={{ height: '18px', lineHeight: '18px', textAlign: 'center', fontSize: '10px', fontWeight: 500, color: '#64748b' }}>
                  {pars.slice(9,18).reduce((a,b) => a + parseInt(b), 0)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {round.holes.slice(9,18).map((s, i) => {
                  const colors = getScoreColor(s, pars[i+9])
                  return (
                    <div key={`bs-${i}`} style={{ 
                      height: '32px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px', 
                      fontWeight: 700, 
                      borderRadius: '4px', 
                      background: colors.background, 
                      color: colors.color, 
                      border: colors.border || 'none',
                      boxSizing: 'border-box',
                    }}>{s || '-'}</div>
                  )
                })}
                <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, borderRadius: '4px', background: '#1e293b', color: 'white' }}>{round.back9}</div>
              </div>
            </div>
          </>
        ) : round.front9 && round.back9 ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <div style={{ background: 'white', padding: '12px 24px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Front 9</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>{round.front9}</div>
            </div>
            <div style={{ background: 'white', padding: '12px 24px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Back 9</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>{round.back9}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'white', padding: '16px 40px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Par {round.par || 72}</div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: '#1e293b' }}>Total: {round.total}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

ShareImageCard.displayName = 'ShareImageCard'

export default ShareImageCard