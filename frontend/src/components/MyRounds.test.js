import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyRounds from './MyRounds'
import { roundsService } from '../services/roundsService'
import { followService } from '../services/followService'

// Reactions on the user's own rounds page
jest.mock('../services/supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    or: () => Promise.resolve({ count: 1, error: null }),
  }
  return { supabase: { from: () => query } }
})
jest.mock('../services/roundsService', () => ({
  roundsService: {
    getMyRoundsWithEverything: jest.fn(),
    saveReaction: jest.fn(),
  },
}))
jest.mock('../services/followService', () => ({
  followService: { getFollowCounts: jest.fn() },
}))
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, profile: { id: 'me', username: 'me_golfer' } }),
}))
jest.mock('./AvatarUpload', () => () => null)

const fire = () => screen.getByTitle('fire')
const isMine = (button) => button.className.includes('bg-green-50')

function renderMyRounds() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MyRounds />
    </MemoryRouter>
  )
}

beforeEach(() => {
  // The user already reacted with fire to their own round
  roundsService.getMyRoundsWithEverything.mockResolvedValue({
    data: {
      rounds: [{ id: 'r1', course_name: 'Home Course', total_score: 80, played_at: '2026-07-04' }],
      reactions: [{ round_id: 'r1', reaction_type: 'fire', user_id: 'me' }],
      userReactions: [{ round_id: 'r1', reaction_type: 'fire' }],
      comments: [],
    },
    error: null,
  })
  roundsService.saveReaction.mockResolvedValue({ data: null, error: null, superseded: false })
  followService.getFollowCounts.mockResolvedValue({ followers: 0, following: 0 })
  window.scrollTo = jest.fn()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

test('a tap on a reaction the card shows as yours asks to remove it', async () => {
  renderMyRounds()
  expect(await screen.findByText('Home Course')).toBeInTheDocument()
  expect(isMine(fire())).toBe(true)

  fireEvent.click(fire())
  expect(roundsService.saveReaction).toHaveBeenLastCalledWith('r1', 'fire', false)
  expect(isMine(fire())).toBe(false)
})

test('a failed save puts the card back', async () => {
  roundsService.saveReaction.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, superseded: false })
  renderMyRounds()
  expect(await screen.findByText('Home Course')).toBeInTheDocument()

  fireEvent.click(fire())
  expect(isMine(fire())).toBe(false)
  await waitFor(() => expect(isMine(fire())).toBe(true))
  expect(fire()).toHaveTextContent('1')
})
