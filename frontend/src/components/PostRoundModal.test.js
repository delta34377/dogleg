import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PostRoundModal, { describeRound, normalizeSavedRound } from './PostRoundModal'

const mockLoadProfile = jest.fn(() => Promise.resolve())
let mockProfile = { username: 'tiger', handicap_index: null, handicap: null }
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: mockProfile, loadProfile: mockLoadProfile }),
}))

// Every query answers with mockReply (the round refresh and the count)
let mockReply = { data: null, count: 0, error: null }
jest.mock('../services/supabase', () => {
  const query = {}
  ;['select', 'eq', 'not', 'or'].forEach((name) => { query[name] = () => query })
  query.maybeSingle = () => Promise.resolve(mockReply)
  query.then = (resolve, reject) => Promise.resolve(mockReply).then(resolve, reject)
  return { supabase: { from: () => query } }
})

// The real share card draws on a canvas, which jsdom can't do
jest.mock('./ShareModal', () => ({ round, onClose }) => (
  <div role="dialog">
    Share card for {round.total} on {round.date}
    <button onClick={onClose}>Close share</button>
  </div>
))

const savedRow = (extra = {}) => ({
  id: 'round-1',
  user_id: 'me',
  short_code: 'K7FX9M',
  course_name: 'Pebble Beach Golf Links',
  club_name: 'Pebble Beach',
  played_at: '2026-11-20T00:00:00',
  total_score: 85,
  front9: null,
  back9: null,
  scores_by_hole: null,
  course_pars: null,
  par: 72,
  holes_played: 18,
  differential: 12.4,
  dogleg_score: 7.4,
  strokes_vs_usual: 3.1,
  achievements: [{ type: 'broke_90', label: '💯 First time breaking 90' }],
  ...extra,
})

// Renders the modal and lets its "catch up with the database" requests finish
const renderModal = async (round, onClose = jest.fn()) => {
  const view = render(
    <MemoryRouter initialEntries={['/add']}>
      <Routes>
        <Route path="/add" element={<PostRoundModal round={round} onClose={onClose} />} />
        <Route path="/my-rounds" element={<p>My Rounds page</p>} />
        <Route path="/rounds/:code" element={<p>Round page</p>} />
      </Routes>
    </MemoryRouter>
  )
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return view
}

beforeEach(() => {
  mockProfile = { username: 'tiger', handicap_index: null, handicap: null }
  mockReply = { data: null, count: 0, error: null }
  mockLoadProfile.mockClear()
})

describe('describeRound', () => {
  it('says a rated round counts', () => {
    expect(describeRound(savedRow()).handicap).toMatchObject({ tone: 'good', text: 'Counts toward your handicap.' })
    expect(describeRound(savedRow()).scoreNote).toBeNull()
  })

  it('explains the first rated round (no baseline yet) and suggests a handicap', () => {
    const { scoreNote } = describeRound(savedRow({ dogleg_score: null, strokes_vs_usual: null }))
    expect(scoreNote).toMatch(/baseline/)
    expect(scoreNote).toMatch(/Add your handicap/)
    expect(describeRound(savedRow({ dogleg_score: null }), { hasHandicap: true }).scoreNote).not.toMatch(/Add your handicap/)
  })

  it('marks an unrated nine as pending until there is a handicap', () => {
    const nine = savedRow({ holes_played: 9, total_score: 47, front9: 47, differential: null, dogleg_score: null })
    const { handicap, scoreNote } = describeRound(nine)
    expect(handicap.tone).toBe('pending')
    expect(scoreNote).toMatch(/unlocks/)
  })

  it('says a nine is rated "as a nine" when it counts', () => {
    expect(describeRound(savedRow({ holes_played: 9, total_score: 47, front9: 47 })).handicap.text).toMatch(/as a nine/)
  })

  it('explains rounds that cannot count', () => {
    expect(describeRound(savedRow({ holes_played: 17, differential: null, dogleg_score: null })).handicap.text).toMatch(/17 holes/)
    expect(describeRound(savedRow({ holes_played: null, differential: null, dogleg_score: null })).handicap.tone).toBe('none')
  })
})

describe('normalizeSavedRound', () => {
  it('maps database columns to the shape ShareModal and RoundCard use', () => {
    const round = normalizeSavedRound(savedRow({ photo_url: 'https://x/p.jpg', caption: 'Windy' }))
    expect(round).toMatchObject({
      id: 'round-1', user_id: 'me', short_code: 'K7FX9M',
      total: 85, date: '2026-11-20T00:00:00', holes: [], coursePars: null,
      photo: 'https://x/p.jpg', comment: 'Windy', dogleg_score: 7.4,
    })
  })
})

describe('PostRoundModal', () => {
  it('shows the score, the Dogleg Score, strokes vs usual and the badges', async () => {
    await renderModal(savedRow())

    expect(screen.getByRole('heading', { name: /You shot 85/ })).toBeInTheDocument()
    expect(screen.getByText('+3.1')).toBeInTheDocument()
    expect(screen.getByText(/strokes vs your usual/)).toBeInTheDocument()
    expect(screen.getByText('💯 First time breaking 90')).toBeInTheDocument()
    expect(screen.getByText('Counts toward your handicap.')).toBeInTheDocument()
    await waitFor(() => expect(mockLoadProfile).toHaveBeenCalledWith('me'))
    // count 0 rated rounds -> 3 more to an index
    expect(await screen.findByText(/3 more rated rounds until your handicap index/)).toBeInTheDocument()
  })

  // ENTRY-3: the row the database stores for an 18-hole Quick Score (42 + 44)
  // on a nine-hole course: par 36 (courses.total_par) and the nine's card
  // padded with nulls. Vs par is against twice the nine, not against 36.
  it('reads vs par against twice the nine for an 18 on a nine-hole course', async () => {
    await renderModal(savedRow({
      front9: 42, back9: 44, total_score: 86, par: 36, holes_played: 18,
      course_pars: [4, 4, 3, 5, 4, 4, 3, 5, 4, ...Array(9).fill(null)],
    }))
    expect(screen.getByRole('heading', { name: 'You shot 86 (+14)' })).toBeInTheDocument()
    expect(screen.queryByText('(+50)')).not.toBeInTheDocument()
  })

  it('reads vs par against the course par for an 18 on an 18-hole course', async () => {
    await renderModal(savedRow())
    expect(screen.getByRole('heading', { name: 'You shot 85 (+13)' })).toBeInTheDocument()
  })

  it('moves focus into the dialog and names it', async () => {
    await renderModal(savedRow())
    const heading = screen.getByRole('heading', { name: /You shot 85/ })
    expect(heading).toHaveFocus()
    expect(screen.getByRole('dialog', { name: /You shot 85/ })).toBeInTheDocument()
  })

  it('explains a missing Dogleg Score once the refresh finds none', async () => {
    await renderModal(savedRow({ dogleg_score: null, strokes_vs_usual: null }))
    expect(await screen.findByText(/sets your baseline/)).toBeInTheDocument()
  })

  it('picks up a score the database added after the save', async () => {
    mockReply = { data: { differential: 14.2, dogleg_score: 8.3, strokes_vs_usual: 4.4, short_code: 'K7FX9M' }, count: 3, error: null }
    await renderModal(savedRow({ holes_played: 9, total_score: 47, front9: 47, differential: null, dogleg_score: null }))
    expect(await screen.findByText('+4.4')).toBeInTheDocument()
  })

  it('opens the share card with a normalized round, then comes back', async () => {
    await renderModal(savedRow())
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByText('Share card for 85 on 2026-11-20T00:00:00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close share' }))
    expect(screen.getByRole('heading', { name: /You shot 85/ })).toBeInTheDocument()
  })

  it('View round goes to the short-code link; Done goes to My Rounds', async () => {
    const { unmount } = await renderModal(savedRow())
    fireEvent.click(screen.getByRole('button', { name: 'View round' }))
    expect(screen.getByText('Round page')).toBeInTheDocument()
    unmount()

    await renderModal(savedRow())
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('My Rounds page')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = jest.fn()
    await renderModal(savedRow(), onClose)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
