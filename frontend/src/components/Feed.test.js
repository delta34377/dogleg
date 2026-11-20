import { createRef } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Feed from './Feed'
import { roundsService } from '../services/roundsService'
import { statsService } from '../services/statsService'
import { followService } from '../services/followService'
import { getFeedSettings, subscribeToFeedSettings } from '../services/feedSettingsService'

// Infinite-scroll guard tests. The services are fakes; each test controls
// exactly when a page request finishes.
jest.mock('../services/roundsService', () => ({
  roundsService: {
    getFeedWithDiscovery: jest.fn(),
    getReactions: jest.fn(),
    getComments: jest.fn(),
    getUserReactions: jest.fn(),
  },
}))
jest.mock('../services/statsService', () => ({
  statsService: { getRoundStatsFields: jest.fn() },
}))
jest.mock('../services/followService', () => ({
  followService: { getFollowStatuses: jest.fn() },
}))
jest.mock('../services/feedSettingsService', () => ({
  getFeedSettings: jest.fn(),
  subscribeToFeedSettings: jest.fn(),
}))
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))

const makeRound = (n) => ({
  id: `r${n}`,
  user_id: 'friend',
  total_score: 80 + n,
  course_name: `Course ${n}`,
  played_at: '2026-07-04',
  profiles: { username: 'friend' },
})
const page = (...numbers) => ({ data: { rounds: numbers.map(makeRound) }, error: null })

// A promise the test resolves by hand
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const offsetsRequested = () => roundsService.getFeedWithDiscovery.mock.calls.map((call) => call[1])

// In jsdom every element is 0px tall, so any scroll counts as "near the bottom"
const scroll = () => fireEvent.scroll(window)

function renderFeed(props = {}) {
  const ref = createRef()
  const utils = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Feed ref={ref} {...props} />
    </MemoryRouter>
  )
  return { ref, ...utils }
}

// (Create React App resets every mock before each test, so the fake
// answers are set up here rather than in the jest.mock calls above.)
beforeEach(() => {
  roundsService.getFeedWithDiscovery.mockReset()
  roundsService.getReactions.mockResolvedValue({ data: [] })
  roundsService.getComments.mockResolvedValue({ data: [] })
  roundsService.getUserReactions.mockResolvedValue({ data: [] })
  statsService.getRoundStatsFields.mockResolvedValue({ data: {} })
  followService.getFollowStatuses.mockResolvedValue({})
  // Two rounds per page keeps the tests short
  getFeedSettings.mockResolvedValue({ mode: 'following', discoveryRatio: 0, feedLimit: 2 })
  subscribeToFeedSettings.mockReturnValue(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  window.scrollTo = jest.fn()
})

afterEach(() => {
  console.error.mockRestore()
})

test('a burst of scroll events loads the next page once, then continues from the right offset', async () => {
  const nextPage = deferred()
  roundsService.getFeedWithDiscovery
    .mockResolvedValueOnce(page(1, 2))
    .mockReturnValueOnce(nextPage.promise)
    .mockResolvedValueOnce(page(5, 6))

  renderFeed()
  expect(await screen.findByText('Course 2')).toBeInTheDocument()

  // Five scroll events while page 2 is still loading
  scroll(); scroll(); scroll(); scroll(); scroll()
  expect(offsetsRequested()).toEqual([0, 2])

  await act(async () => nextPage.resolve(page(3, 4)))
  expect(await screen.findByText('Course 4')).toBeInTheDocument()

  scroll()
  expect(offsetsRequested()).toEqual([0, 2, 4]) // no page skipped
  expect(await screen.findByText('Course 6')).toBeInTheDocument()
})

test('a failed page stops auto-loading until Retry', async () => {
  roundsService.getFeedWithDiscovery
    .mockResolvedValueOnce(page(1, 2))
    .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    .mockResolvedValueOnce(page(3, 4))

  renderFeed()
  expect(await screen.findByText('Course 2')).toBeInTheDocument()

  scroll()
  expect(await screen.findByText("Couldn't load more rounds.")).toBeInTheDocument()

  scroll(); scroll(); scroll()
  expect(offsetsRequested()).toEqual([0, 2]) // no retry storm

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Course 4')).toBeInTheDocument()
  expect(offsetsRequested()).toEqual([0, 2, 2]) // retried the same page
})

test('a failed first load shows an error with Retry, not "No rounds yet"', async () => {
  roundsService.getFeedWithDiscovery
    .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    .mockResolvedValueOnce(page(1))

  renderFeed()
  expect(await screen.findByText("Couldn't load your feed")).toBeInTheDocument()
  expect(screen.queryByText('No rounds in your feed yet')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Course 1')).toBeInTheDocument()
})

test('a hidden Feed (active=false) does not load on scroll, and restores its scroll position when shown', async () => {
  roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1, 2))

  const { rerender, ref } = renderFeed()
  expect(await screen.findByText('Course 2')).toBeInTheDocument()

  // The reader had scrolled down to 640px when they left the Feed
  roundsService.getFeedWithDiscovery.mockReturnValue(new Promise(() => {}))
  window.scrollY = 640
  scroll()
  const callsBeforeHiding = roundsService.getFeedWithDiscovery.mock.calls.length

  const withActive = (active) => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Feed ref={ref} active={active} />
    </MemoryRouter>
  )
  rerender(withActive(false))
  window.scrollY = 0
  scroll(); scroll()
  expect(roundsService.getFeedWithDiscovery.mock.calls.length).toBe(callsBeforeHiding)

  window.scrollTo.mockClear()
  rerender(withActive(true))
  expect(window.scrollTo).toHaveBeenCalledWith(0, 640)
  expect(typeof ref.current.refresh).toBe('function')
})
