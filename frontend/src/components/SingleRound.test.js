import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SingleRound, { normalizePublicRound } from './SingleRound'
import AchievementBadges from './AchievementBadges'
import { buildShareText } from './ShareModal'
import { supabase } from '../services/supabase'

// The real Supabase client needs environment settings; these tests only need
// the one call the public round page makes.
jest.mock('../services/supabase', () => ({
  supabase: { rpc: jest.fn() },
}))
jest.mock('../services/roundsService', () => ({ roundsService: {} }))
jest.mock('../services/followService', () => ({ followService: {} }))
// Signed out
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

const publicPayload = {
  round: {
    id: 'round-1',
    short_code: 'ABC123',
    user_id: 'user-1',
    total_score: 84,
    course_name: 'Pebble Creek',
    club_name: null,
    city: 'Austin',
    state: 'TX',
    played_at: '2026-07-04',
    dogleg_score: 7.2,
    strokes_vs_usual: 1.5,
  },
  author: { id: 'user-1', username: 'alex_fairway', full_name: 'Alex', avatar_url: null },
  reactions: { fire: 3, clap: 1, made_up: 99 },
  comment_count: 1,
  comments: [
    { id: 'c1', content: 'Nice round!', created_at: '2026-07-04T20:00:00Z', author: { username: 'sam', full_name: 'Sam', avatar_url: null } },
  ],
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/rounds/:roundId" element={<SingleRound />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

describe('normalizePublicRound', () => {
  test('turns the RPC result into the card shape', () => {
    const round = normalizePublicRound(publicPayload)
    expect(round.id).toBe('round-1')
    expect(round.total_score).toBe(84)
    expect(round.profiles).toEqual({ username: 'alex_fairway', full_name: 'Alex', avatar_url: null })
    expect(round.reactions.fire).toBe(3)
    expect(round.reactions.clap).toBe(1)
    expect(round.reactions.made_up).toBeUndefined() // unknown reaction types are dropped
    expect(round.comments).toEqual([
      { id: 'c1', text: 'Nice round!', author: 'sam', author_username: 'sam', author_avatar: null, date: '2026-07-04T20:00:00Z' },
    ])
    expect(round.comment_count).toBe(1)
    expect(round.userReacted).toEqual([])
  })

  test('returns null for empty or malformed results', () => {
    expect(normalizePublicRound(null)).toBeNull()
    expect(normalizePublicRound({})).toBeNull()
    expect(normalizePublicRound({ round: 'nope' })).toBeNull()
  })
})

describe('SingleRound signed out', () => {
  test('shows a read-only round with the join call to action', async () => {
    supabase.rpc.mockResolvedValue({ data: publicPayload, error: null })
    renderAt('/rounds/ABC123')

    expect(await screen.findByText('Pebble Creek')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('get_public_round', { p_code: 'ABC123' })
    expect(screen.getByText('Nice round!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Dogleg to react and comment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()

    // Read-only: no comment box, no reaction picker, no options menu
    expect(screen.queryByPlaceholderText('Add a comment...')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add reaction' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Round options' })).not.toBeInTheDocument()
  })

  test('shows the unavailable state when the round is private or missing', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    renderAt('/rounds/ABC123')
    expect(await screen.findByText("This round isn't available")).toBeInTheDocument()
  })

  test('shows the unavailable state when the RPC is not deployed yet', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    renderAt('/rounds/ABC123')
    expect(await screen.findByText("This round isn't available")).toBeInTheDocument()
  })

  test('shows the unavailable state when the request throws', async () => {
    supabase.rpc.mockRejectedValue(new Error('Failed to fetch'))
    renderAt('/rounds/ABC123')
    expect(await screen.findByText("This round isn't available")).toBeInTheDocument()
  })
})

describe('AchievementBadges', () => {
  test('draws only badges whose label is text', () => {
    render(
      <AchievementBadges
        achievements={[
          { type: 'pr', label: 'New PR' },
          { type: 'forged', label: { a: 1 } },
          null,
          'junk',
          { type: 'first', label: 'First round here' },
        ]}
      />
    )
    expect(screen.getByText('New PR')).toBeInTheDocument()
    expect(screen.getByText('First round here')).toBeInTheDocument()
  })

  test('draws nothing when no badge is valid', () => {
    const { container } = render(<AchievementBadges achievements={[{ label: 5 }, { label: { a: 1 } }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('buildShareText', () => {
  const round = { total: 84, course_name: 'Pebble Creek', club_name: null }
  const shareUrl = 'https://dogleg.io/rounds/ABC123'

  test('says "I shot" only for your own round', () => {
    expect(buildShareText({ round, username: 'alex', isOwn: true, shareUrl }))
      .toBe('I shot 84 at Pebble Creek! https://dogleg.io/rounds/ABC123')
  })

  test("names the golfer for someone else's round", () => {
    expect(buildShareText({ round, username: 'alex', isOwn: false, shareUrl }))
      .toBe('alex shot 84 at Pebble Creek! https://dogleg.io/rounds/ABC123')
  })
})
