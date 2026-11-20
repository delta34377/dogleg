import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'
import { roundsService, createRoundId } from '../services/roundsService'
import { useAuth } from '../context/AuthContext'
import getDisplayName from '../utils/courseNameUtils'
import { prepareRoundPhoto } from '../utils/roundPhoto'
import {
  EARLIEST_DATE,
  localDateString,
  parseScore,
  parseCoursePars,
  fillEighteen,
  eighteenMismatch,
  buildQuickEntry,
  buildHoleEntry,
  validateRound,
} from '../utils/scoreValidation'

const EMPTY_QUICK = {
  values: { front9: '', back9: '', total: '' },
  // true for boxes the golfer typed (the others we fill in for them)
  typed: { front9: false, back9: false, total: false },
}

// "E", "+3" or "-2" — or null when we can't tell
function formatVsPar(score, par) {
  if (!Number.isInteger(score) || !par) return null
  const diff = score - par
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

const vsParColor = (vsPar) =>
  vsPar === 'E' ? 'text-gray-700' : vsPar.startsWith('+') ? 'text-red-600' : 'text-green-600'

// Par for the front nine, back nine and 18 holes — null when unknown. We
// only show "vs par" from real numbers, never from a guessed card.
function parTotals(pars, totalPar, numHoles) {
  const sum = (list) => list.reduce((a, p) => a + p, 0)
  if (pars && pars.length === 18) {
    return { front: sum(pars.slice(0, 9)), back: sum(pars.slice(9)), eighteen: sum(pars) }
  }
  if (pars && pars.length === 9) {
    // A nine-hole course: the "back nine" is the same nine played again
    const nine = sum(pars)
    return { front: nine, back: nine, eighteen: nine * 2 }
  }
  const coursePar = parseInt(totalPar, 10)
  if (!coursePar) return { front: null, back: null, eighteen: null }
  if (Number(numHoles) === 9) return { front: coursePar, back: coursePar, eighteen: coursePar * 2 }
  return { front: null, back: null, eighteen: coursePar }
}

// What to tell the golfer when a save fails
function describeSaveError(error) {
  const code = error?.code
  const message = typeof error?.message === 'string' ? error.message : ''

  if (message === 'User not authenticated' || code === 'PGRST301' || code === 'PGRST303') {
    return 'Your session has expired. Sign in again to save this round.'
  }
  // 23514 = the database refused an impossible score and says why
  // (e.g. "Hole scores must be between 1 and 20")
  if (code === '23514') {
    return message && !message.startsWith('new row for relation')
      ? message
      : "That score isn't allowed. Check your numbers and try again."
  }
  if (code === '42501') {
    return "You don't have permission to save this round. Try signing out and back in."
  }
  if (code === 'PGRST204') {
    return 'Dogleg was just updated. Refresh the page and try again.'
  }
  return "Couldn't save your round. Check your connection and tap Save again — it won't post twice."
}

// A two-option switch, e.g. "18 holes | 9 holes"
function SegmentedControl({ label, options, value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`py-2 rounded-md text-sm font-semibold transition-colors ${
              selected ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const SCORE_INPUT_CLASS =
  'w-full px-3 py-3 text-xl font-bold text-center border-2 rounded-lg focus:border-green-500 focus:outline-none'

function ScoreEntry({ course, onComplete, onCancel }) {
  const { user } = useAuth()

  // One id for this whole entry session. Every Save attempt sends the same
  // id, so retrying after a lost connection can't post the round twice.
  const [roundId] = useState(() => createRoundId())

  const [tees, setTees] = useState([])
  const [selectedTee, setSelectedTee] = useState(null)
  const [fullCourseData, setFullCourseData] = useState(null)

  const [entryMode, setEntryMode] = useState('simple') // 'simple' (Quick Score) or 'holes'
  // Quick Score: 18 or 9 holes. Starts from the course's hole count.
  const [holesMode, setHolesMode] = useState(() => (Number(course?.num_holes) === 9 ? 9 : 18))
  const holesModeChosenRef = useRef(false)
  const [nineSide, setNineSide] = useState('front') // which nine, for 9 holes
  const [quick, setQuick] = useState(EMPTY_QUICK) // 18 holes: Front 9 / Back 9 / Total boxes
  const [nineScore, setNineScore] = useState('') // 9 holes: the one score box
  const [holes, setHoles] = useState(Array(18).fill('')) // Hole by Hole boxes

  const [date, setDate] = useState(() => localDateString())
  const [comment, setComment] = useState('')
  const [trackPutts, setTrackPutts] = useState(false)
  const [putts, setPutts] = useState(Array(18).fill(''))
  const [totalPutts, setTotalPutts] = useState('')

  // The photo is re-encoded as soon as it's picked; Save waits for that
  const [photo, setPhoto] = useState(null) // { file, name }
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [photoError, setPhotoError] = useState(null)
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false)
  const photoSeqRef = useRef(0) // ignores a slow photo the golfer already replaced

  const [isSaving, setIsSaving] = useState(false)
  // A ref as well as state: state updates land after the next render, so two
  // quick taps could both see isSaving === false
  const savingRef = useRef(false)
  const [formErrors, setFormErrors] = useState([])
  const confirmedWarningsRef = useRef('')

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load tees when component mounts
  useEffect(() => {
    const loadTees = async () => {
      try {
        const { data, error } = await supabase
          .from('tees')
          .select('*')
          .eq('course_id', course.course_id)
          .order('tee_id')

        if (!error && data) {
          setTees(data)
        }
      } catch (error) {
        console.error('Error loading tees:', error)
      }
    }

    if (course?.course_id) {
      loadTees()
    }
  }, [course])

  // Preselect the tee the user last played here (most golfers play the same
  // tees every time, and a selected tee is what makes the round count toward
  // their handicap index)
  useEffect(() => {
    const preselectLastTee = async () => {
      if (!user || !course?.course_id || tees.length === 0 || selectedTee) return

      try {
        const { data } = await supabase
          .from('rounds')
          .select('tee_id')
          .eq('user_id', user.id)
          .eq('course_id', course.course_id)
          .not('tee_id', 'is', null)
          .order('played_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data?.tee_id) {
          const lastTee = tees.find(t => t.tee_id === data.tee_id)
          if (lastTee) setSelectedTee(lastTee)
        }
      } catch (error) {
        // Preselection is a convenience — never block entry over it
      }
    }

    preselectLastTee()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tees, user?.id])

  // Load complete course data with hole pars
  useEffect(() => {
    const loadFullCourseData = async () => {
      try {
        const { data, error } = await supabase
          .from('courses')
          .select('*')
          .eq('course_id', course.course_id)
          .single()

        if (!error && data) {
          setFullCourseData(data)
          // A nine-hole course defaults to "9 holes" — unless the golfer
          // already picked
          if (!holesModeChosenRef.current && Number(data.num_holes) === 9) setHolesMode(9)
        }
      } catch (error) {
        console.error('Error loading course data:', error)
      }
    }

    if (course?.course_id) {
      loadFullCourseData()
    }
  }, [course])

  // Real pars or null (courses without par data). See parseCoursePars.
  const pars = parseCoursePars(fullCourseData?.pars)
  const isNineHoleCourse = Number(fullCourseData?.num_holes ?? course?.num_holes) === 9
  const parFor = parTotals(pars, fullCourseData?.total_par || course?.total_par, fullCourseData?.num_holes ?? course?.num_holes)
  const parForHole = (index) => (pars ? pars[pars.length === 9 ? index % 9 : index] : null)

  const clearErrors = () => {
    if (formErrors.length > 0) setFormErrors([])
  }

  const chooseHolesMode = (value) => {
    holesModeChosenRef.current = true
    setHolesMode(value)
    clearErrors()
  }

  // Quick Score, 18 holes: any two boxes fill in the third (fillEighteen)
  const handleQuickChange = (field, value) => {
    clearErrors()
    setQuick(prev => {
      const typed = { ...prev.typed, [field]: value !== '' }
      return { typed, values: fillEighteen({ ...prev.values, [field]: value }, typed) }
    })
  }

  const handleHoleScore = (holeIndex, value) => {
    clearErrors()
    setHoles(prev => {
      const next = [...prev]
      next[holeIndex] = value
      return next
    })

    // Auto-advance to next hole for typical scores (2-9)
    // Most golf scores are single digits between 2-9
    const score = parseInt(value, 10)
    if (value.length === 1 && score >= 2 && score <= 9) {
      const nextHoleIndex = holeIndex + 1
      if (nextHoleIndex < 18) {
        // Small delay to ensure state has updated
        setTimeout(() => {
          const nextInput = document.getElementById(`hole-input-${nextHoleIndex}`)
          if (nextInput) {
            nextInput.focus()
            // Select all text in the next input for easy overwrite
            nextInput.select()
          }
        }, 50)
      }
    }
  }

  // Clear all scores
  const clearScores = () => {
    clearErrors()
    setPutts(Array(18).fill(''))
    setTotalPutts('')
    setQuick(EMPTY_QUICK)
    setNineScore('')
    setHoles(Array(18).fill(''))
  }

  const handlePuttChange = (holeIndex, value) => {
    setPutts(prev => {
      const next = [...prev]
      next[holeIndex] = value
      return next
    })

    // Auto-advance to the next putts cell, same as hole score entry
    // (putts are always a single digit)
    if (value.length === 1 && /^[0-9]$/.test(value)) {
      const nextIndex = holeIndex + 1
      if (nextIndex < 18) {
        setTimeout(() => {
          const nextInput = document.getElementById(`putt-input-${nextIndex}`)
          if (nextInput) {
            nextInput.focus()
            nextInput.select()
          }
        }, 50)
      }
    }
  }

  // Every photo is re-encoded right away (strips GPS/EXIF data — see
  // utils/roundPhoto.js). Save stays disabled until it's done.
  const handlePhotoChange = async (event) => {
    const input = event.target
    const original = input.files?.[0]
    input.value = '' // so picking the same file again still triggers onChange
    if (!original) return

    const seq = ++photoSeqRef.current
    setPhoto(null)
    setPhotoError(null)
    setPhotoUploadFailed(false)
    setPhotoProcessing(true)

    try {
      const file = await prepareRoundPhoto(original)
      if (seq !== photoSeqRef.current || !mountedRef.current) return
      setPhoto({ file, name: original.name })
    } catch (error) {
      if (seq !== photoSeqRef.current || !mountedRef.current) return
      console.error('Photo processing error:', error)
      setPhotoError("We couldn't read that photo. Try a JPG or PNG, or post without a photo.")
    } finally {
      if (seq === photoSeqRef.current && mountedRef.current) setPhotoProcessing(false)
    }
  }

  const removePhoto = () => {
    photoSeqRef.current++ // forget a photo that's still processing
    setPhoto(null)
    setPhotoProcessing(false)
    setPhotoError(null)
    setPhotoUploadFailed(false)
  }

  // Total putts: the typed number, or the per-hole putts added up when every
  // scored hole has one
  const getTotalPutts = () => {
    const typed = parseScore(totalPutts)
    if (typed !== null) return typed
    if (entryMode === 'holes' && trackPutts) {
      const scored = holes.filter(h => h !== '').length
      const filled = putts.filter(p => p !== '')
      if (scored > 0 && filled.length === scored) {
        return filled.reduce((sum, x) => sum + (parseInt(x, 10) || 0), 0)
      }
    }
    return null
  }

  // What the boxes add up to right now, in the shape validateRound expects
  const holeSummary = buildHoleEntry(holes)
  const buildEntry = () => {
    const scores = entryMode === 'holes'
      ? holeSummary
      : buildQuickEntry({ holes: holesMode, side: isNineHoleCourse ? 'front' : nineSide, values: quick.values, nineScore })
    return { ...scores, date, putts: getTotalPutts() }
  }

  const saveRound = async ({ withoutPhoto = false } = {}) => {
    // Prevent double taps, and never save while the photo is still processing
    if (savingRef.current || photoProcessing) return
    if (!user) {
      setFormErrors(['Please log in to save your round.'])
      return
    }

    const entry = buildEntry()
    const { errors, warnings } = validateRound(entry, { today: localDateString() })
    if (errors.length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors([])

    // Unusual but possible scores: ask once (not again on a retry)
    const warningKey = warnings.join('\n')
    if (warnings.length > 0 && confirmedWarningsRef.current !== warningKey) {
      if (!window.confirm(`${warnings.join('\n\n')}\n\nAre you sure?`)) return
      confirmedWarningsRef.current = warningKey
    }

    savingRef.current = true
    setIsSaving(true)
    setPhotoUploadFailed(false)

    try {
      const result = await roundsService.saveRound({
        id: roundId, // the same id on every retry (see above)
        userId: user.id,
        course_id: course.course_id,
        course_name: course.course_name,
        club_name: course.club_name,
        city: course.city,
        state: course.state,
        tee: selectedTee,
        tee_id: selectedTee?.tee_id,
        date: date + 'T00:00:00',
        front9: entry.front9,
        back9: entry.back9,
        total: entry.total,
        holes: entry.scores || [],
        holesDeclared: entry.holesDeclared,
        statsByHole: entryMode === 'holes' && trackPutts && putts.some(p => p !== '')
          ? putts.map(p => ({ putts: parseInt(p, 10) >= 0 ? parseInt(p, 10) : null }))
          : null,
        totalPutts: entry.putts,
        comment: comment.slice(0, 280),
        photo: withoutPhoto ? null : (photo?.file || null),
        par: course.total_par || fullCourseData?.total_par || 72,
        coursePars: pars, // null when the course has no par data (STATS-7)
      })

      if (!mountedRef.current) return

      if (result.error) {
        console.error('Error saving round:', result.error)
        if (result.stage === 'photo') {
          // Nothing was posted. Let the golfer choose (ENTRY-7).
          setPhotoUploadFailed(true)
        } else {
          setFormErrors([describeSaveError(result.error)])
        }
        return
      }

      onComplete(result.data)
    } catch (error) {
      console.error('Unexpected error saving round:', error)
      if (mountedRef.current) setFormErrors([describeSaveError(error)])
    } finally {
      savingRef.current = false
      if (mountedRef.current) setIsSaving(false)
    }
  }

  const courseLabel = getDisplayName(course)
  const today = localDateString()

  // Live "vs par" line under the score boxes
  let quickScore = null
  let quickPar = null
  if (holesMode === 9) {
    quickScore = parseScore(nineScore)
    quickPar = isNineHoleCourse || nineSide === 'front' ? parFor.front : parFor.back
  } else {
    quickScore = parseScore(quick.values.total)
    quickPar = parFor.eighteen
  }
  const quickVsPar = formatVsPar(quickScore, quickPar)
  const quickMismatch = holesMode === 18 && quick.typed.front9 && quick.typed.back9 && quick.typed.total
    ? eighteenMismatch(quick.values)
    : null
  // A lone total under 60 in 18-hole mode is usually a nine
  const suggestNine = holesMode === 18 && Number.isInteger(quickScore) && quickScore >= 9 && quickScore < 60 &&
    quick.values.front9 === '' && quick.values.back9 === ''
  const hasQuickScores = nineScore !== '' || quick.values.front9 !== '' || quick.values.back9 !== '' || quick.values.total !== ''

  // Hole by hole: par for just the holes played (only when every one is known)
  let holesPar = null
  if (holeSummary.filled > 0) {
    const playedPars = holeSummary.scores.flatMap((s, i) => (s === null ? [] : [parForHole(i)]))
    if (playedPars.every(p => Number.isInteger(p))) holesPar = playedPars.reduce((a, p) => a + p, 0)
  }
  const holesVsPar = Number.isInteger(holeSummary.total) ? formatVsPar(holeSummary.total, holesPar) : null

  const saveDisabled = isSaving || photoProcessing

  const renderHoleInputs = (offset) => (
    <div className="grid grid-cols-9 gap-1">
      {[...Array(9)].map((_, i) => (
        <div key={i + offset}>
          <label htmlFor={`hole-input-${i + offset}`} className="block text-xs text-center text-gray-500 mb-1">
            {i + offset + 1}
          </label>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            id={`hole-input-${i + offset}`}
            value={holes[i + offset]}
            onChange={(e) => handleHoleScore(i + offset, e.target.value)}
            className="w-full px-1 py-2 text-center border rounded text-sm font-medium"
            min="1"
            max="20"
          />
        </div>
      ))}
    </div>
  )

  const renderPuttInputs = (offset) => (
    <div className="grid grid-cols-9 gap-1">
      {[...Array(9)].map((_, i) => (
        <input
          key={i + offset}
          id={`putt-input-${i + offset}`}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={putts[i + offset]}
          onChange={(e) => handlePuttChange(i + offset, e.target.value)}
          className="w-full px-1 py-1.5 text-center border border-dashed rounded text-sm text-gray-700"
          placeholder="P"
          aria-label={`Putts on hole ${i + offset + 1}`}
          min="0"
          max="9"
        />
      ))}
    </div>
  )

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Header — neutral: the course name in ink, green saved for the save button */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Enter Score</h2>
        <p className="text-gray-600 text-sm mt-1">{courseLabel}</p>
        {course.club_name && course.club_name !== courseLabel && (
          <p className="text-gray-500 text-sm">{course.club_name}</p>
        )}
      </div>

      <div className="p-6">
        {/* Date and Tees Row */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="round-date" className="block text-sm font-medium text-gray-700 mb-1">
              Date Played
            </label>
            <input
              id="round-date"
              type="date"
              value={date}
              onChange={(e) => { clearErrors(); setDate(e.target.value) }}
              className="w-full px-3 py-2 border rounded-lg text-sm h-[42px] appearance-none bg-white"
              // The golfer's own "today", not the UTC date (ENTRY-10)
              max={today}
              min={EARLIEST_DATE}
            />
          </div>

          <div>
            <label htmlFor="round-tees" className="block text-sm font-medium text-gray-700 mb-1">
              Tees (optional)
            </label>
            <select
              id="round-tees"
              value={selectedTee?.tee_id || ''}
              onChange={(e) => {
                const tee = tees.find(t => t.tee_id === e.target.value)
                setSelectedTee(tee)
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm h-[42px] appearance-none bg-white"
            >
              <option value="">Select tees...</option>
              {tees.map(tee => (
                <option key={tee.tee_id} value={tee.tee_id}>
                  {tee.tee_name || tee.tee_color}
                  {tee.total_length && ` • ${tee.total_length}${tee.measure_unit || 'y'}`}
                  {tee.slope && ` • ${tee.slope}/${tee.course_rating || ''}`}
                </option>
              ))}
            </select>
            <p className={`text-xs mt-1 ${selectedTee?.slope ? 'text-green-600' : 'text-gray-400'}`}>
              {selectedTee?.slope
                ? '✓ Counts toward your handicap index'
                : "No tees? We'll estimate from the course — pick tees for full accuracy"}
            </p>
          </div>
        </div>

        {/* Score Entry Mode Toggle */}
        <div className="mb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { clearErrors(); setEntryMode('simple') }}
              aria-pressed={entryMode === 'simple'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                entryMode === 'simple'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Quick Score
            </button>
            <button
              type="button"
              onClick={() => { clearErrors(); setEntryMode('holes') }}
              aria-pressed={entryMode === 'holes'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                entryMode === 'holes'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Hole by Hole
            </button>
          </div>
        </div>

        {/* Quick Score Entry */}
        {entryMode === 'simple' && (
          <div className="space-y-4 mb-6">
            {/* How many holes — never guessed from the score (ENTRY-1) */}
            <SegmentedControl
              label="Holes played"
              value={holesMode}
              onChange={chooseHolesMode}
              options={[
                { value: 18, label: '18 holes' },
                { value: 9, label: '9 holes' },
              ]}
            />

            {holesMode === 9 ? (
              <>
                {/* Which nine matters: each nine has its own rating */}
                {!isNineHoleCourse && (
                  <SegmentedControl
                    label="Which nine"
                    value={nineSide}
                    onChange={(side) => { clearErrors(); setNineSide(side) }}
                    options={[
                      { value: 'front', label: 'Front nine' },
                      { value: 'back', label: 'Back nine' },
                    ]}
                  />
                )}
                <div className="max-w-[10rem] mx-auto">
                  <label htmlFor="nine-score" className="block text-xs font-medium text-gray-600 mb-1 text-center">
                    Score (9 holes)
                  </label>
                  <input
                    id="nine-score"
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={nineScore}
                    onChange={(e) => { clearErrors(); setNineScore(e.target.value) }}
                    className={`${SCORE_INPUT_CLASS} bg-green-50`}
                    placeholder="--"
                    min="9"
                    max="120"
                  />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { field: 'front9', label: 'Front 9', max: 120 },
                  { field: 'back9', label: 'Back 9', max: 120 },
                  { field: 'total', label: 'Total', max: 200 },
                ].map(({ field, label, max }) => {
                  // Boxes we filled in are grey, so it's clear what was typed
                  const filledForYou = !quick.typed[field] && quick.values[field] !== ''
                  return (
                    <div key={field}>
                      <label htmlFor={`quick-${field}`} className="block text-xs font-medium text-gray-600 mb-1 text-center">
                        {label}
                      </label>
                      <input
                        id={`quick-${field}`}
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quick.values[field]}
                        onChange={(e) => handleQuickChange(field, e.target.value)}
                        className={`${SCORE_INPUT_CLASS} ${field === 'total' ? 'bg-green-50' : ''} ${filledForYou ? 'text-gray-400' : ''}`}
                        title={filledForYou ? 'Filled in for you' : undefined}
                        placeholder="--"
                        min="1"
                        max={max}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {quickMismatch && (
              <p className="text-xs text-red-600 text-center">{quickMismatch}</p>
            )}

            {suggestNine && (
              <p className="text-xs text-amber-700 text-center">
                Played only nine holes?{' '}
                <button type="button" onClick={() => chooseHolesMode(9)} className="underline font-semibold">
                  Switch to 9 holes
                </button>
              </p>
            )}

            {/* Show vs Par */}
            {quickVsPar !== null && (
              <div className="text-center">
                <span className="text-lg font-semibold">
                  Score: {quickScore}
                  <span className={`ml-2 ${vsParColor(quickVsPar)}`}>({quickVsPar})</span>
                </span>
                <span className="text-sm text-gray-500 ml-2">vs. par {quickPar}</span>
              </div>
            )}

            {/* Clear button */}
            {hasQuickScores && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={clearScores}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Clear scores
                </button>
              </div>
            )}

            <p className="text-xs text-gray-500 text-center">
              {holesMode === 9
                ? 'Pick the nine you played — each nine has its own rating.'
                : "Enter your total, or your front and back nines and we'll add them up."}
            </p>

            <div className="flex items-center justify-center gap-2">
              <label htmlFor="quick-putts" className="text-sm text-gray-600">Putts (optional):</label>
              <input
                id="quick-putts"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={totalPutts}
                onChange={(e) => { clearErrors(); setTotalPutts(e.target.value) }}
                className="w-20 px-2 py-1.5 text-center border rounded-lg text-sm"
                placeholder="total"
                min="0"
                max="99"
              />
            </div>
          </div>
        )}

        {/* Hole by Hole Entry */}
        {entryMode === 'holes' && (
          <div className="mb-6">
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Front 9</div>
              {renderHoleInputs(0)}
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Back 9</div>
              {renderHoleInputs(9)}
            </div>

            {/* Optional putts tracking — unlocks putting stats on the Stats tab */}
            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={trackPutts}
                  onChange={(e) => setTrackPutts(e.target.checked)}
                  className="rounded"
                />
                Track putts (optional)
              </label>
              {trackPutts && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="holes-total-putts" className="text-xs text-gray-500">Total putts:</label>
                    <input
                      id="holes-total-putts"
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={totalPutts}
                      onChange={(e) => { clearErrors(); setTotalPutts(e.target.value) }}
                      className="w-20 px-2 py-1 text-center border rounded text-sm"
                      placeholder="e.g. 32"
                      min="0"
                      max="99"
                    />
                    <span className="text-xs text-gray-400">— or tap them in per hole:</span>
                  </div>
                  {renderPuttInputs(0)}
                  {renderPuttInputs(9)}
                  <p className="text-xs text-gray-400 text-center">Putts per hole, same order as scores</p>
                </div>
              )}
            </div>

            {holeSummary.filled > 0 && (
              <div className="text-center pt-2 border-t">
                <div className="text-sm text-gray-600">
                  {holeSummary.filled} holes played • Front: {holeSummary.front9 ?? '--'} • Back: {holeSummary.back9 ?? '--'}
                </div>
                <div className="text-lg font-bold">
                  Total: {Number.isInteger(holeSummary.total) ? holeSummary.total : '--'}
                  {holesVsPar && (
                    <span className={`ml-2 ${vsParColor(holesVsPar)}`}>({holesVsPar})</span>
                  )}
                </div>
              </div>
            )}

            {/* Clear button for holes */}
            {holes.some(h => h !== '') && (
              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={clearScores}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  Clear all holes
                </button>
              </div>
            )}
          </div>
        )}

        {/* Photo (re-encoded on pick, which also strips location data) */}
        <div className="mb-4">
          {photo ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-2 border-gray-200 rounded-lg">
              <span className="text-sm text-gray-700 truncate">📷 {photo.name}</span>
              <button
                type="button"
                onClick={removePhoto}
                disabled={isSaving}
                className="shrink-0 text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              className={`w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 block text-center focus-within:ring-2 focus-within:ring-green-500 ${
                photoProcessing || isSaving ? 'cursor-wait' : 'cursor-pointer hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={photoProcessing || isSaving}
                // sr-only (not hidden) keeps the picker reachable by keyboard
                className="sr-only"
              />
              {photoProcessing ? (
                <span>⏳ Processing photo...</span>
              ) : (
                <span>📷 Add Photo (optional)</span>
              )}
            </label>
          )}
          {photoError && (
            <p className="text-xs text-red-600 mt-1" role="alert">{photoError}</p>
          )}
        </div>

        {/* Comment */}
        <div className="mb-6">
          <label htmlFor="round-comment" className="block text-sm font-medium text-gray-700 mb-1">
            Add a note (optional):
          </label>
          <textarea
            id="round-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 280))}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows="2"
            placeholder="How was your round? (e.g., 'Just broke 80!' or 'Perfect weather!')"
            maxLength={280}
          />
        </div>

        {/* Photo upload failed: nothing was posted yet — let the golfer pick */}
        {photoUploadFailed && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
            <p className="font-semibold">Your photo didn't upload.</p>
            <p className="text-xs mt-0.5">
              Nothing has been posted yet. The connection may be weak — try again, or post the round without the photo.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => saveRound()}
                disabled={saveDisabled}
                className="flex-1 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => saveRound({ withoutPhoto: true })}
                disabled={saveDisabled}
                className="flex-1 py-2 rounded-lg border border-amber-400 bg-white text-amber-900 font-semibold hover:bg-amber-100 disabled:opacity-50"
              >
                Post without photo
              </button>
            </div>
          </div>
        )}

        {/* Why the round can't be saved (hard limits, or the server's reason) */}
        {formErrors.length > 0 && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            {formErrors.length === 1 ? (
              <p>{formErrors[0]}</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {formErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            // Not while saving: closing mid-save used to lead to duplicate rounds
            disabled={isSaving}
            className="flex-1 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => saveRound()}
            disabled={saveDisabled}
            className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
              saveDisabled
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isSaving ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving Round...
              </span>
            ) : photoProcessing ? (
              'Processing photo...'
            ) : (
              'Save Round'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScoreEntry
