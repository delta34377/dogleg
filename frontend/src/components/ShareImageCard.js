import { forwardRef } from 'react'

const getDisplayName = (round) => {
  let courseName = round.course_name, clubName = round.club_name
  const toProperCase = (str) => {
    if (!str) return str
    if (str === str.toUpperCase() && str.length > 2) return str.toLowerCase().split(' ').map((w,i) => i>0 && ['of','at','the'].includes(w) ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
    return str
  }
  courseName = toProperCase(courseName); clubName = toProperCase(clubName)
  if (!courseName || courseName === 'Unknown Course' || courseName === 'Course Name N/A') return clubName || 'Unknown Course'
  if (!clubName) return courseName
  const cleanCourse = courseName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi,'').replace(/[^a-z0-9]/g,' ').trim()
  const cleanClub = clubName.toLowerCase().replace(/golf|club|country|cc|course|resort|links/gi,'').replace(/[^a-z0-9]/g,' ').trim()
  const courseWords = cleanCourse.split(' ').filter(w => w.length > 2), clubWords = cleanClub.split(' ').filter(w => w.length > 2)
  if (courseWords.length > 0 && courseWords.filter(w => clubWords.some(cw => cw.includes(w) || w.includes(cw))).length / courseWords.length >= 0.7) return clubName
  return `${courseName} @ ${clubName}`
}

const ShareImageCard = forwardRef(({ round, username, photoUrl }, ref) => {
  const calcVsPar = () => {
    if (!round.par && !round.coursePars) return null
    let par = round.par || 72
    if (round.holes?.some(h => h) && round.coursePars) par = round.holes.reduce((s, sc, i) => sc ? s + parseInt(round.coursePars[i] || 4) : s, 0)
    else if (round.front9 && !round.back9) par = round.coursePars ? round.coursePars.slice(0,9).reduce((s,p) => s+parseInt(p), 0) : Math.round(par/2)
    else if (!round.front9 && round.back9) par = round.coursePars ? round.coursePars.slice(9,18).reduce((s,p) => s+parseInt(p), 0) : Math.round(par/2)
    const diff = round.total - par
    return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
  }
  const vsPar = calcVsPar()
  const hasPhoto = !!photoUrl
  const hasHoles = round.holes?.some(h => h !== '' && h !== null)
  const pars = round.coursePars || Array(18).fill(4)
  const formatDate = (d) => { if (!d) return ''; const [y,m,day] = d.split('T')[0].split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
  const getColor = (s, p) => {
    if (!s) return { bg: 'white', fg: '#334155', border: '1px solid #e2e8f0' }
    const d = parseInt(s) - parseInt(p)
    if (d <= -2) return { bg: '#0d7d0d', fg: 'white' }
    if (d === -1) return { bg: '#4caf50', fg: 'white' }
    if (d === 0) return { bg: 'white', fg: '#334155', border: '1px solid #e2e8f0' }
    if (d === 1) return { bg: '#ffcdd2', fg: '#333' }
    if (d === 2) return { bg: '#ef5350', fg: 'white' }
    return { bg: '#c62828', fg: 'white' }
  }

  return (
    <div ref={ref} style={{ width: '360px', height: '450px', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', position: 'fixed', top: 0, left: '-400px', background: 'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)' }}>
      {/* Photo 55% */}
      <div style={{ position: 'relative', height: '55%', ...(hasPhoto ? { backgroundImage: `url(${photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: 'linear-gradient(135deg, #166534 0%, #15803d 40%, #14532d 100%)' }) }}>
        <div style={{ position: 'absolute', inset: 0, background: hasPhoto ? 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.5) 100%)' : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.2) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '10px 14px', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            <span style={{ fontSize: '16px' }}>🏌️</span>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Dogleg.io</span>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: '12px', opacity: 0.95, marginBottom: '2px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{username} posted a score</div>
            <div style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.2, marginBottom: '2px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{getDisplayName(round)}</div>
            <div style={{ fontSize: '11px', opacity: 0.9, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{formatDate(round.date)} • {round.city}, {round.state}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{round.total}</span>
              {vsPar && <span style={{ fontSize: '24px', fontWeight: 700, color: vsPar.startsWith('-') ? '#4ade80' : vsPar.startsWith('+') ? '#fca5a5' : 'white', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>({vsPar})</span>}
            </div>
          </div>
        </div>
      </div>
      {/* Scorecard 45% */}
      <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {hasHoles ? (<>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {[1,2,3,4,5,6,7,8,9,'Out'].map(h => <div key={`fh${h}`} style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{h}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {pars.slice(0,9).map((p,i) => <div key={`fp${i}`} style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>{p}</div>)}
              <div style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>{pars.slice(0,9).reduce((a,b)=>a+parseInt(b),0)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {round.holes.slice(0,9).map((s,i) => { const c = getColor(s, pars[i]); return <div key={`fs${i}`} style={{ height: '30px', lineHeight: '30px', textAlign: 'center', fontSize: '14px', fontWeight: 700, borderRadius: '4px', background: c.bg, color: c.fg, border: c.border || 'none', boxSizing: 'border-box' }}>{s||'-'}</div> })}
              <div style={{ height: '30px', lineHeight: '30px', textAlign: 'center', fontSize: '14px', fontWeight: 700, borderRadius: '4px', background: '#1e293b', color: 'white' }}>{round.front9}</div>
            </div>
          </div>
          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {[10,11,12,13,14,15,16,17,18,'In'].map(h => <div key={`bh${h}`} style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{h}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {pars.slice(9,18).map((p,i) => <div key={`bp${i}`} style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>{p}</div>)}
              <div style={{ height: '16px', lineHeight: '16px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>{pars.slice(9,18).reduce((a,b)=>a+parseInt(b),0)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}>
              {round.holes.slice(9,18).map((s,i) => { const c = getColor(s, pars[i+9]); return <div key={`bs${i}`} style={{ height: '30px', lineHeight: '30px', textAlign: 'center', fontSize: '14px', fontWeight: 700, borderRadius: '4px', background: c.bg, color: c.fg, border: c.border || 'none', boxSizing: 'border-box' }}>{s||'-'}</div> })}
              <div style={{ height: '30px', lineHeight: '30px', textAlign: 'center', fontSize: '14px', fontWeight: 700, borderRadius: '4px', background: '#1e293b', color: 'white' }}>{round.back9}</div>
            </div>
          </div>
        </>) : round.front9 && round.back9 ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <div style={{ background: 'white', padding: '12px 24px', borderRadius: '12px', textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Front 9</div><div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>{round.front9}</div></div>
            <div style={{ background: 'white', padding: '12px 24px', borderRadius: '12px', textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Back 9</div><div style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b' }}>{round.back9}</div></div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ background: 'white', padding: '16px 40px', borderRadius: '12px', textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Par {round.par || 72}</div><div style={{ fontSize: '36px', fontWeight: 700, color: '#1e293b' }}>Total: {round.total}</div></div></div>
        )}
      </div>
    </div>
  )
})

ShareImageCard.displayName = 'ShareImageCard'
export default ShareImageCard