import getDisplayName, { getDisplayName as namedExport } from './courseNameUtils'

// getDisplayName decides the label for every course on every screen: round
// cards, search results, Stats, the Course page and the Enter Score header.
// PRs #3 and #6 both fixed screens that showed the literal text
// "Unknown Course" (how some imported courses are stored) instead of going
// through this function, so the fallback rules are pinned down first.

describe('getDisplayName: "Unknown Course" fallback (PRs #3 and #6)', () => {
  test('a course stored as "Unknown Course" shows its club name instead', () => {
    expect(getDisplayName({ course_name: 'Unknown Course', club_name: 'Pebble Creek Golf Club' }))
      .toBe('Pebble Creek Golf Club')
  })

  test('the "Course Name N/A" placeholder also falls back to the club name', () => {
    expect(getDisplayName({ course_name: 'Course Name N/A', club_name: 'Riverside Golf Club' }))
      .toBe('Riverside Golf Club')
  })

  test('an ALL CAPS "UNKNOWN COURSE" from an import is caught too', () => {
    expect(getDisplayName({ course_name: 'UNKNOWN COURSE', club_name: 'Pebble Creek Golf Club' }))
      .toBe('Pebble Creek Golf Club')
  })

  test.each([null, undefined, ''])('a missing course name (%p) falls back to the club name', (courseName) => {
    expect(getDisplayName({ course_name: courseName, club_name: 'Riverside Golf Club' }))
      .toBe('Riverside Golf Club')
  })

  test('says "Unknown Course" only when there is no club name either', () => {
    expect(getDisplayName({ course_name: 'Unknown Course', club_name: null })).toBe('Unknown Course')
    expect(getDisplayName({ course_name: null, club_name: '' })).toBe('Unknown Course')
    expect(getDisplayName({})).toBe('Unknown Course')
  })

  test('works on the Stats rows PR #3 routed through it (best round, most played)', () => {
    // These rows come from the stats RPCs, not the courses table, but carry
    // the same two name fields.
    const bestRound = { total_score: 78, course_name: 'Unknown Course', club_name: 'Oak Hollow Golf Club', played_at: '2025-07-12' }
    const mostPlayed = { course_name: 'Unknown Course', club_name: 'Oak Hollow Golf Club', rounds: 7, best_score: 78 }
    expect(getDisplayName(bestRound)).toBe('Oak Hollow Golf Club')
    expect(getDisplayName(mostPlayed)).toBe('Oak Hollow Golf Club')
  })

  test('returns the club name unchanged, so the Course page can drop the repeated subtitle (PR #6)', () => {
    // CoursePage and ScoreEntry hide the club-name subtitle when it is
    // identical (===) to the title. That only works if the fallback hands
    // back the club name exactly as stored.
    const course = { course_name: 'Unknown Course', club_name: 'Pebble Creek Golf Club', city: 'Tampa', state: 'FL' }
    const title = getDisplayName(course)
    const subtitle = [course.club_name, course.city, course.state]
      .filter(Boolean).filter(part => part !== title).join(' · ')
    expect(title).toBe('Pebble Creek Golf Club')
    expect(subtitle).toBe('Tampa · FL')
  })
})

describe('getDisplayName: single-course clubs collapse to the club name', () => {
  test.each([
    ['Pebble Creek', 'Pebble Creek Golf Club'],
    ['Riverside Golf Course', 'Riverside Golf Club'],
    ['Pebble Beach Golf Links', 'Pebble Beach Golf Links'],
  ])('%p at %p shows just the club', (courseName, clubName) => {
    expect(getDisplayName({ course_name: courseName, club_name: clubName })).toBe(clubName)
  })

  test('with no club name the course name is shown as-is', () => {
    expect(getDisplayName({ course_name: 'Augusta National', club_name: null })).toBe('Augusta National')
  })
})

describe('getDisplayName: multi-course clubs show "Course @ Club"', () => {
  test('distinct course and club names are joined with @', () => {
    expect(getDisplayName({ course_name: 'Ocean', club_name: 'Kiawah Island Golf Resort' }))
      .toBe('Ocean @ Kiawah Island Golf Resort')
  })

  test.each(['Blue', 'North', 'Championship'])('a bare %p gets "Course" added', (word) => {
    expect(getDisplayName({ course_name: word, club_name: 'Doral Golf Resort' }))
      .toBe(`${word} Course @ Doral Golf Resort`)
  })

  // Known bug, out of scope for this round of fixes: "Pinehurst No. 2" and
  // "Pinehurst No. 4" at "Pinehurst Resort" both become "Pinehurst Resort",
  // because short tokens like "2" are ignored. See ENTRY-11 in the review.
  test.todo('numbered courses at the same club get different labels (ENTRY-11)')
})

describe('getDisplayName: ALL CAPS names are converted to proper case', () => {
  test('both names are converted, keeping "of", "at" and "the" lowercase mid-name', () => {
    expect(getDisplayName({ course_name: 'THE LINKS AT SPANISH BAY', club_name: 'PEBBLE BEACH RESORTS' }))
      .toBe('The Links at Spanish Bay @ Pebble Beach Resorts')
  })

  test('an ALL CAPS club name is converted when it is the fallback', () => {
    expect(getDisplayName({ course_name: 'Unknown Course', club_name: 'OAK HOLLOW GOLF CLUB' }))
      .toBe('Oak Hollow Golf Club')
  })

  test('mixed-case names are left alone', () => {
    expect(getDisplayName({ course_name: 'McArthur', club_name: 'The Club at McArthur' }))
      .toBe('The Club at McArthur')
  })
})

test('the default and named exports are the same function', () => {
  expect(namedExport).toBe(getDisplayName)
})
