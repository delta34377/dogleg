import { createRef } from 'react'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
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
    saveReaction: jest.fn(),
    saveComment: jest.fn(),
  },
}))
jest.mock('../services/statsService', () => ({
  statsService: { getRoundStatsFields: jest.fn() },
}))
jest.mock('../services/followService', () => ({
  followService: { getFollowStatuses: jest.fn(), followUser: jest.fn(), unfollowUser: jest.fn() },
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
  roundsService.saveReaction.mockResolvedValue({ data: null, error: null, superseded: false })
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
  document.body.style.overflow = ''
})

// Re-render the same Feed shown (active) or hidden behind another page
const showFeed = (rerender, ref, active) => rerender(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Feed ref={ref} active={active} />
  </MemoryRouter>
)

// The card for one round, found by its course name
const cardFor = (courseName) =>
  screen.getAllByRole('article').find((card) => within(card).queryByText(courseName))

// A reaction button on a card: its count, and whether it shows as the user's
const reactionButton = (courseName, type) => within(cardFor(courseName)).getByTitle(type)
const isMine = (button) => button.className.includes('bg-green-50')

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

describe('coming back to the Feed (SHELL-1)', () => {
  test('a Feed that had no rounds starts over from the top, e.g. after the user followed people', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page(1))

    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('No rounds in your feed yet')).toBeInTheDocument()

    showFeed(rerender, ref, false)
    showFeed(rerender, ref, true)

    expect(await screen.findByText('Course 1')).toBeInTheDocument()
    expect(offsetsRequested()).toEqual([0, 0])
  })

  test('a Feed whose first page failed tries again', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
      .mockResolvedValueOnce(page(1))

    const { rerender, ref } = renderFeed()
    expect(await screen.findByText("Couldn't load your feed")).toBeInTheDocument()

    showFeed(rerender, ref, false)
    showFeed(rerender, ref, true)

    expect(await screen.findByText('Course 1')).toBeInTheDocument()
  })

  test('a loaded Feed refreshes its cards in place, keeping every page and the scroll position', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce(page(1, 2))
      .mockResolvedValueOnce(page(3)) // a short page: the end

    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 2')).toBeInTheDocument()
    scroll()
    expect(await screen.findByText("You've reached the end of your feed")).toBeInTheDocument()
    window.scrollY = 900
    scroll()

    showFeed(rerender, ref, false)

    // Meanwhile, elsewhere in the app: the user reacted to round 3 on a
    // profile, someone commented on round 1, and the user followed its poster
    roundsService.getReactions.mockResolvedValue({ data: [
      { round_id: 'r3', reaction_type: 'fire', user_id: 'me' },
      { round_id: 'r3', reaction_type: 'fire', user_id: 'someone' },
    ] })
    roundsService.getUserReactions.mockResolvedValue({ data: [{ round_id: 'r3', reaction_type: 'fire' }] })
    roundsService.getComments.mockResolvedValue({ data: [
      { id: 'c1', round_id: 'r1', content: 'Great round!', created_at: '2026-07-04T20:00:00Z', user_id: 'pal', profiles: { username: 'pal' } },
    ] })
    followService.getFollowStatuses.mockResolvedValue({ friend: true })
    window.scrollTo.mockClear()

    showFeed(rerender, ref, true)
    expect(window.scrollTo).toHaveBeenCalledWith(0, 900)

    expect(await screen.findByText('Great round!')).toBeInTheDocument()
    const fire = reactionButton('Course 3', 'fire')
    expect(isMine(fire)).toBe(true)
    expect(fire).toHaveTextContent('2')
    expect(await within(cardFor('Course 1')).findByRole('button', { name: 'Following' })).toBeInTheDocument()

    // Nothing was reloaded or dropped, and the page did not jump
    expect(offsetsRequested()).toEqual([0, 2])
    expect(screen.getByText('Course 1')).toBeInTheDocument()
    expect(screen.getByText('Course 2')).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  test('a part that fails to refresh keeps what it showed; the rest still refreshes', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    roundsService.getReactions.mockResolvedValue({ data: [{ round_id: 'r1', reaction_type: 'clap', user_id: 'x' }] })

    const { rerender, ref } = renderFeed()
    await waitFor(() => expect(reactionButton('Course 1', 'clap')).toHaveTextContent('1'))

    showFeed(rerender, ref, false)
    roundsService.getReactions.mockResolvedValue({ data: null, error: { message: 'offline' } })
    roundsService.getComments.mockResolvedValue({ data: [
      { id: 'c1', round_id: 'r1', content: 'Nice!', created_at: '2026-07-04T20:00:00Z', user_id: 'pal', profiles: { username: 'pal' } },
    ] })
    followService.getFollowStatuses.mockResolvedValue({}) // the follow lookup failed
    showFeed(rerender, ref, true)

    expect(await screen.findByText('Nice!')).toBeInTheDocument()
    expect(reactionButton('Course 1', 'clap')).toHaveTextContent('1') // not wiped to 0
  })

  test('a refresh that throws changes nothing', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    roundsService.getReactions.mockResolvedValue({ data: [{ round_id: 'r1', reaction_type: 'clap', user_id: 'x' }] })

    const { rerender, ref } = renderFeed()
    await waitFor(() => expect(reactionButton('Course 1', 'clap')).toHaveTextContent('1'))

    showFeed(rerender, ref, false)
    followService.getFollowStatuses.mockRejectedValue(new Error('offline'))
    showFeed(rerender, ref, true)

    await waitFor(() => expect(console.error).toHaveBeenCalledWith('Could not refresh the feed cards:', expect.any(Error)))
    expect(reactionButton('Course 1', 'clap')).toHaveTextContent('1')
    expect(screen.getByText('Course 1')).toBeInTheDocument()
  })

  test('a refresh reply that arrives after the user tapped a card does not undo the tap', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    showFeed(rerender, ref, false)
    const slow = deferred()
    roundsService.getReactions.mockReturnValue(slow.promise)
    showFeed(rerender, ref, true)

    // The user taps clap before the refresh answers
    fireEvent.click(reactionButton('Course 1', 'clap'))
    expect(roundsService.saveReaction).toHaveBeenCalledWith('r1', 'clap', true)

    // The refresh was read before the tap reached the server: no clap in it
    await act(async () => slow.resolve({ data: [] }))
    expect(isMine(reactionButton('Course 1', 'clap'))).toBe(true)
    expect(reactionButton('Course 1', 'clap')).toHaveTextContent('1')
  })

  test('a refresh reply is dropped if the Feed started over meanwhile', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(1))
    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    showFeed(rerender, ref, false)
    const slow = deferred()
    roundsService.getReactions.mockReturnValueOnce(slow.promise)
    showFeed(rerender, ref, true)

    // The user re-taps the Feed tab: start over (its own reply has no reactions)
    await act(async () => ref.current.refresh())
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    // The old refresh finally answers with an out-of-date reaction
    await act(async () => slow.resolve({ data: [{ round_id: 'r1', reaction_type: 'goat', user_id: 'x' }] }))
    expect(within(cardFor('Course 1')).queryByTitle('goat')).not.toBeInTheDocument()
  })
})

describe('feedRefresh events (SHELL-1)', () => {
  const followEvent = (userId, following = true) =>
    new CustomEvent('feedRefresh', { detail: { reason: 'follow', userId, following } })

  test('a follow made while the Feed was hidden starts it over from the top when it is shown', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(9, 1)) // the newly followed golfer's round comes first

    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()
    window.scrollY = 640
    scroll()

    showFeed(rerender, ref, false)
    act(() => { window.dispatchEvent(followEvent('newpal')) })
    expect(offsetsRequested()).toEqual([0]) // nothing loads while hidden

    window.scrollTo.mockClear()
    showFeed(rerender, ref, true)
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0) // from the top, not 640
    expect(await screen.findByText('Course 9')).toBeInTheDocument()
    expect(offsetsRequested()).toEqual([0, 0])
  })

  test('a follow tapped while the Feed is on screen just updates those cards', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1, 2))
    renderFeed()
    expect(await screen.findByText('Course 2')).toBeInTheDocument()

    act(() => { window.dispatchEvent(followEvent('friend')) })

    expect(await within(cardFor('Course 1')).findByRole('button', { name: 'Following' })).toBeInTheDocument()
    expect(await within(cardFor('Course 2')).findByRole('button', { name: 'Following' })).toBeInTheDocument()
    expect(offsetsRequested()).toEqual([0]) // no reload under the user's thumb
  })

  test('a plain feedRefresh on screen starts over from the top', async () => {
    roundsService.getFeedWithDiscovery
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(5))
    renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    act(() => { window.dispatchEvent(new Event('feedRefresh')) })

    expect(await screen.findByText('Course 5')).toBeInTheDocument()
    expect(screen.queryByText('Course 1')).not.toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })
})

describe('reactions (SHELL-1)', () => {
  test('a tap saves the state the card asks for, never a blind toggle', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    fireEvent.click(reactionButton('Course 1', 'fire'))
    expect(roundsService.saveReaction).toHaveBeenLastCalledWith('r1', 'fire', true)
    expect(isMine(reactionButton('Course 1', 'fire'))).toBe(true)
    expect(reactionButton('Course 1', 'fire')).toHaveTextContent('1')

    fireEvent.click(reactionButton('Course 1', 'fire'))
    expect(roundsService.saveReaction).toHaveBeenLastCalledWith('r1', 'fire', false)
    expect(isMine(reactionButton('Course 1', 'fire'))).toBe(false)
  })

  test('a failed save puts the card back', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    roundsService.saveReaction.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, superseded: false })
    renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    fireEvent.click(reactionButton('Course 1', 'fire'))
    expect(isMine(reactionButton('Course 1', 'fire'))).toBe(true)
    await waitFor(() => expect(isMine(reactionButton('Course 1', 'fire'))).toBe(false))
  })

  test('a failed save that a later tap took over leaves the card to that tap', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    roundsService.saveReaction.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, superseded: true })
    renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    fireEvent.click(reactionButton('Course 1', 'fire'))
    // Once the failed reply has been handled...
    await waitFor(() => expect(console.error).toHaveBeenCalledWith('Failed to save reaction:', { message: 'offline' }))
    expect(isMine(reactionButton('Course 1', 'fire'))).toBe(true)
  })
})

describe('pop-ups when the Feed is hidden (SHELL-3)', () => {
  test('the Share pop-up closes and page scrolling is unlocked', async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce(page(1))
    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    fireEvent.click(within(cardFor('Course 1')).getByRole('button', { name: /Share/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    // e.g. the phone's Back button: the route changes and the Feed is hidden
    showFeed(rerender, ref, false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')

    // ...and it does not pop back up on return
    showFeed(rerender, ref, true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test("a card's own pop-up (the Dogleg Score explainer) closes too", async () => {
    roundsService.getFeedWithDiscovery.mockResolvedValueOnce({
      data: { rounds: [{ ...makeRound(1), dogleg_score: 7.5 }] },
      error: null,
    })
    const { rerender, ref } = renderFeed()
    expect(await screen.findByText('Course 1')).toBeInTheDocument()

    fireEvent.click(within(cardFor('Course 1')).getByTitle(/Dogleg Score/))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    showFeed(rerender, ref, false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')

    showFeed(rerender, ref, true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Course 1')).toBeInTheDocument()
  })
})
