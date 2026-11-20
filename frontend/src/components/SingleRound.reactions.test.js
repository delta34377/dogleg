import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SingleRound from './SingleRound'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'

// A signed-in user reacting on a single round page. (SingleRound.test.js
// covers the signed-out public view.)
jest.mock('../services/supabase', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('../services/roundsService', () => ({
  roundsService: {
    getRound: jest.fn(),
    getRoundByShortCode: jest.fn(),
    getReactions: jest.fn(),
    getComments: jest.fn(),
    getUserReactions: jest.fn(),
    saveReaction: jest.fn(),
  },
}))
jest.mock('../services/followService', () => ({
  followService: { getFollowStatuses: jest.fn() },
}))
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))

const ROUND = {
  id: 'round-1',
  short_code: 'ABC123',
  user_id: 'friend',
  course_name: 'Pebble Creek',
  total_score: 84,
  played_at: '2026-07-04',
  profiles: { username: 'friend' },
}

const fire = () => screen.getByTitle('fire')
const isMine = (button) => button.className.includes('bg-green-50')

function renderRound() {
  return render(
    <MemoryRouter initialEntries={['/rounds/ABC123']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/rounds/:roundId" element={<SingleRound />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  roundsService.getRoundByShortCode.mockResolvedValue({ data: ROUND, error: null })
  roundsService.getReactions.mockResolvedValue({ data: [] })
  roundsService.getComments.mockResolvedValue({ data: [] })
  roundsService.getUserReactions.mockResolvedValue({ data: [] })
  roundsService.saveReaction.mockResolvedValue({ data: null, error: null, superseded: false })
  followService.getFollowStatuses.mockResolvedValue({})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

test('a tap saves the state the card asks for (add, then remove)', async () => {
  renderRound()
  expect(await screen.findByText('Pebble Creek')).toBeInTheDocument()

  fireEvent.click(fire())
  expect(roundsService.saveReaction).toHaveBeenLastCalledWith('round-1', 'fire', true)
  expect(isMine(fire())).toBe(true)
  expect(fire()).toHaveTextContent('1')

  fireEvent.click(fire())
  expect(roundsService.saveReaction).toHaveBeenLastCalledWith('round-1', 'fire', false)
  expect(isMine(fire())).toBe(false)
})

test('a failed save puts the card back', async () => {
  roundsService.saveReaction.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, superseded: false })
  renderRound()
  expect(await screen.findByText('Pebble Creek')).toBeInTheDocument()

  fireEvent.click(fire())
  expect(isMine(fire())).toBe(true)
  await waitFor(() => expect(isMine(fire())).toBe(false))
})

test('a failed save that a later tap took over leaves the card alone', async () => {
  roundsService.saveReaction.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, superseded: true })
  renderRound()
  expect(await screen.findByText('Pebble Creek')).toBeInTheDocument()

  fireEvent.click(fire())
  // Once the failed reply has been handled...
  await waitFor(() => expect(console.error).toHaveBeenCalledWith('Failed to save reaction:', { message: 'offline' }))
  expect(isMine(fire())).toBe(true)
})
