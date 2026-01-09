import { forwardRef } from 'react'

// Utility function to intelligently display course/club names
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
          if (index > 0 && ['of', 'at', 'the'].includes(word)) {
            return word
          }
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

const ShareImageCard = forwardRef(({ round, username, photoUrl }, ref) => {
  // Calculate vs par
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
    } else if (round.front9 && !round.back9) {
      if (round.coursePars) {
        parForHolesPlayed = round.coursePars.slice(0, 9).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round((round.par || 72) / 2)
      }
    } else if (!round.front9 && round.back9) {
      if (round.coursePars) {
        parForHolesPlayed = round.coursePars.slice(9, 18).reduce((sum, p) => sum + parseInt(p), 0)
      } else {
        parForHolesPlayed = Math.round((round.par || 72) / 2)
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
  
  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('T')[0].split('-')
    return `${parseInt(month)}/${parseInt(day)}/${year}`
  }

  // Get score class for coloring
  const getScoreClass = (score, par) => {
    if (!score) return ''
    const diff = parseInt(score) - parseInt(par)
    if (diff <= -2) return 'eagle'
    if (diff === -1) return 'birdie'
    if (diff === 0) return 'par-score'
    if (diff === 1) return 'bogey'
    if (diff === 2) return 'double'
    return 'triple'
  }

  // Score cell colors
  const scoreColors = {
    eagle: { background: '#0d7d0d', color: 'white' },
    birdie: { background: '#4caf50', color: 'white' },
    'par-score': { background: 'white', color: '#334155', border: '1px solid #e2e8f0' },
    bogey: { background: '#ffcdd2', color: '#333' },
    double: { background: '#ef5350', color: 'white' },
    triple: { background: '#c62828', color: 'white' },
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
        background: '#e2e8f0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
      }}
    >
      {/* Photo section (top) - 58% */}
      <div 
        style={{
          position: 'relative',
          height: '58%',
          ...(hasPhoto 
            ? {
                backgroundImage: `url(${photoUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {
                background: 'linear-gradient(135deg, #166534 0%, #15803d 40%, #14532d 100%)',
              }
          ),
        }}
      >
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
        
        {/* Content */}
        <div 
          style={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 16px',
            color: 'white',
          }}
        >
          {/* Branding */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 1px 6px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ fontSize: '20px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>🏌️</span>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Dogleg.io</span>
          </div>
          
          {/* Course info - pushed to bottom with marginTop auto */}
          <div style={{ marginTop: 'auto' }}>
            <div 
              style={{ 
                fontSize: '13px', 
                opacity: 0.95, 
                marginBottom: '4px',
                textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 1px 6px rgba(0,0,0,0.4)',
              }}
            >
              {username} posted a score
            </div>
            <div 
              style={{ 
                fontSize: '24px', 
                fontWeight: 700, 
                lineHeight: 1.15, 
                marginBottom: '4px',
                textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              {getDisplayName(round)}
            </div>
            <div 
              style={{ 
                fontSize: '12px', 
                opacity: 0.9,
                textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 1px 6px rgba(0,0,0,0.4)',
              }}
            >
              {formatDate(round.date)} • {round.city}, {round.state}
            </div>
            
            {/* Big score */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span 
                style={{ 
                  fontSize: '72px', 
                  fontWeight: 800, 
                  lineHeight: 1,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                {round.total}
              </span>
              {vsPar && (
                <span 
                  style={{ 
                    fontSize: '28px', 
                    fontWeight: 700,
                    color: vsPar.startsWith('-') ? '#4ade80' : vsPar.startsWith('+') ? '#fca5a5' : 'white',
                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  }}
                >
                  ({vsPar})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Scorecard section (bottom) */}
      <div 
        style={{
          flex: 1,
          background: '#e2e8f0',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {hasHoleByHole ? (
          <>
            {/* Front 9 */}
            <div style={{ marginBottom: '2px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {[1,2,3,4,5,6,7,8,9,'Out'].map(h => (
                  <div key={`f-hole-${h}`} style={{ 
                    height: '14px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: 500,
                    color: '#64748b',
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {pars.slice(0,9).map((p, i) => (
                  <div key={`f-par-${i}`} style={{ 
                    height: '14px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '9px',
                    color: '#94a3b8',
                  }}>
                    {p}
                  </div>
                ))}
                <div style={{ 
                  height: '14px',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '9px',
                  color: '#94a3b8',
                }}>
                  {pars.slice(0,9).reduce((a,b) => a + parseInt(b), 0)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {round.holes.slice(0,9).map((s, i) => {
                  const scoreClass = getScoreClass(s, pars[i])
                  const colors = scoreColors[scoreClass] || scoreColors['par-score']
                  return (
                    <div key={`f-score-${i}`} style={{ 
                      height: '26px',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      background: colors.background,
                      color: colors.color,
                      border: colors.border || 'none',
                    }}>
                      {s || '-'}
                    </div>
                  )
                })}
                <div style={{ 
                  height: '26px',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  background: '#1e293b',
                  color: 'white',
                }}>
                  {round.front9}
                </div>
              </div>
            </div>
            
            {/* Back 9 */}
            <div style={{ marginTop: '4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {[10,11,12,13,14,15,16,17,18,'In'].map(h => (
                  <div key={`b-hole-${h}`} style={{ 
                    height: '14px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: 500,
                    color: '#64748b',
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {pars.slice(9,18).map((p, i) => (
                  <div key={`b-par-${i}`} style={{ 
                    height: '14px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '9px',
                    color: '#94a3b8',
                  }}>
                    {p}
                  </div>
                ))}
                <div style={{ 
                  height: '14px',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '9px',
                  color: '#94a3b8',
                }}>
                  {pars.slice(9,18).reduce((a,b) => a + parseInt(b), 0)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
                {round.holes.slice(9,18).map((s, i) => {
                  const scoreClass = getScoreClass(s, pars[i+9])
                  const colors = scoreColors[scoreClass] || scoreColors['par-score']
                  return (
                    <div key={`b-score-${i}`} style={{ 
                      height: '26px',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      background: colors.background,
                      color: colors.color,
                      border: colors.border || 'none',
                    }}>
                      {s || '-'}
                    </div>
                  )
                })}
                <div style={{ 
                  height: '26px',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  background: '#1e293b',
                  color: 'white',
                }}>
                  {round.back9}
                </div>
              </div>
            </div>
          </>
        ) : round.front9 && round.back9 ? (
          /* Front/Back only */
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <div style={{
              background: 'white',
              padding: '16px 28px',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Front 9</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{round.front9}</div>
            </div>
            <div style={{
              background: 'white',
              padding: '16px 28px',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Back 9</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b' }}>{round.back9}</div>
            </div>
          </div>
        ) : (
          /* Total only */
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              background: 'white',
              padding: '20px 48px',
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Par {round.par || 72}</div>
              <div style={{ fontSize: '40px', fontWeight: 700, color: '#1e293b' }}>Total: {round.total}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

ShareImageCard.displayName = 'ShareImageCard'

export default ShareImageCard