import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SearchUsers from './SearchUsers'
import { searchService } from '../services/searchService'
import { followService } from '../services/followService'

jest.mock('../services/searchService', () => ({
  searchService: {
    getSuggestedUsers: jest.fn(),
    searchUsers: jest.fn(),
  },
}))
jest.mock('../services/followService', () => ({
  followService: {
    getFollowStatuses: jest.fn(),
    followUser: jest.fn(),
    unfollowUser: jest.fn(),
  },
}))
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))

const PAT = { id: 'pat', username: 'pat', full_name: 'Pat Putter', avatar_url: null, bio: null, location: 'Austin, TX', reason: 'Plays Pebble Beach Golf Links' }
const FAN = { id: 'fan', username: 'fan', full_name: 'Fan Golfer', avatar_url: null, bio: null, location: null, reason: 'Follows you' }
const OLD = { id: 'old', username: 'old_timer', full_name: null, avatar_url: null, bio: null, location: null, reason: null }

const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/search-users']}>
    <SearchUsers />
  </MemoryRouter>
)
// The one golfer card on screen whose name line is exactly `username`
const cardFor = (username) => {
  const cards = screen.getAllByRole('listitem').filter((card) => within(card).queryByText(username, { exact: true }))
  if (cards.length !== 1) throw new Error(`Expected one card for ${username}, found ${cards.length}`)
  return cards[0]
}
const typeSearch = (value) => fireEvent.change(screen.getByPlaceholderText('Search by username or name...'), { target: { value } })

beforeEach(() => {
  jest.clearAllMocks()
  searchService.getSuggestedUsers.mockResolvedValue({ data: [FAN, PAT, OLD], error: null })
  searchService.searchUsers.mockResolvedValue({ data: [], error: null })
  followService.getFollowStatuses.mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, false])))
  followService.followUser.mockResolvedValue({ data: {}, error: null })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {}) // React Router's v7 notices
})

afterEach(() => {
  console.error.mockRestore()
  console.warn.mockRestore()
})

test('shows "Suggested golfers" with the reason under each golfer\'s name', async () => {
  renderPage()

  expect(screen.getByRole('heading', { name: 'Suggested golfers' })).toBeInTheDocument()
  expect(await screen.findByText('Follows you')).toBeInTheDocument()
  expect(searchService.getSuggestedUsers).toHaveBeenCalledWith('me')

  const pat = cardFor('pat')
  expect(within(pat).getByText('Pat Putter')).toBeInTheDocument()
  expect(within(pat).getByText('Plays Pebble Beach Golf Links')).toHaveClass('text-xs', 'text-gray-500')
  expect(within(cardFor('fan')).getByText('Follows you')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /pat/ })).toHaveAttribute('href', '/profile/pat')

  // Best first, as the service ranked them; no reason line when there is none
  expect(screen.getAllByRole('link').map((a) => a.getAttribute('href')))
    .toEqual(['/profile/fan', '/profile/pat', '/profile/old_timer'])
  expect(cardFor('old_timer').textContent).not.toMatch(/null/)
  expect(screen.queryByText('Suggested Users')).not.toBeInTheDocument()
})

test('says it is looking (not "nothing to suggest") until the suggestions arrive', async () => {
  const answer = deferred()
  searchService.getSuggestedUsers.mockReturnValue(answer.promise)
  renderPage()

  expect(screen.getByText('Finding golfers for you...')).toBeInTheDocument()
  expect(screen.queryByText('No golfers to suggest yet')).not.toBeInTheDocument()

  await act(async () => answer.resolve({ data: [PAT], error: null }))
  expect(screen.queryByText('Finding golfers for you...')).not.toBeInTheDocument()
  expect(screen.getByText('Plays Pebble Beach Golf Links')).toBeInTheDocument()
})

test('with no one to suggest it points to inviting friends', async () => {
  searchService.getSuggestedUsers.mockResolvedValue({ data: [], error: null })
  renderPage()

  expect(await screen.findByText('No golfers to suggest yet')).toBeInTheDocument()
  expect(screen.getByText(/Invite the friends you play with to join Dogleg/)).toBeInTheDocument()
  expect(followService.getFollowStatuses).not.toHaveBeenCalled()
})

test('when the suggestions cannot be loaded it says so and can try again', async () => {
  searchService.getSuggestedUsers.mockResolvedValueOnce({ data: [], error: { message: 'offline' } })
  renderPage()

  expect(await screen.findByText("Couldn't load suggestions")).toBeInTheDocument()
  expect(screen.queryByText('No golfers to suggest yet')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Follows you')).toBeInTheDocument()
  expect(searchService.getSuggestedUsers).toHaveBeenCalledTimes(2)
})

test('search results are shown as before, without suggestion reasons', async () => {
  searchService.searchUsers.mockResolvedValue({ data: [{ id: 'sam', username: 'sam', full_name: 'Sam Slice', reason: undefined }], error: null })
  renderPage()
  await screen.findByText('Follows you')

  typeSearch('sam')
  expect(await screen.findByRole('heading', { name: 'Search Results' })).toBeInTheDocument()
  expect(searchService.searchUsers).toHaveBeenCalledWith('sam')
  expect(screen.getByText('Sam Slice')).toBeInTheDocument()
  expect(screen.queryByText('Follows you')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Suggested golfers' })).not.toBeInTheDocument()
})

test('a golfer followed from the suggestions still shows "Following" after a search is cleared', async () => {
  searchService.searchUsers.mockResolvedValue({ data: [{ id: 'sam', username: 'sam', full_name: 'Sam Slice' }], error: null })
  renderPage()
  await screen.findByText('Follows you')

  fireEvent.click(within(cardFor('pat')).getByRole('button', { name: 'Follow' }))
  expect(await within(cardFor('pat')).findByRole('button', { name: 'Following' })).toBeInTheDocument()
  expect(followService.followUser).toHaveBeenCalledWith('pat')

  // The search's own status lookup used to replace every known status
  typeSearch('sam')
  expect(await screen.findByText('Sam Slice')).toBeInTheDocument()
  await waitFor(() => expect(followService.getFollowStatuses).toHaveBeenCalledWith(['sam']))

  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(await screen.findByRole('heading', { name: 'Suggested golfers' })).toBeInTheDocument()
  expect(within(cardFor('pat')).getByRole('button', { name: 'Following' })).toBeInTheDocument()
  expect(within(cardFor('fan')).getByRole('button', { name: 'Follow' })).toBeInTheDocument()
})

test('a follow-status lookup that answers after a tap does not undo it', async () => {
  const lookup = deferred()
  followService.getFollowStatuses.mockReturnValueOnce(lookup.promise)
  renderPage()
  await screen.findByText('Follows you')

  fireEvent.click(within(cardFor('pat')).getByRole('button', { name: 'Follow' }))
  expect(await within(cardFor('pat')).findByRole('button', { name: 'Following' })).toBeInTheDocument()

  // Looked up before the tap
  await act(async () => lookup.resolve({ fan: false, pat: false, old: false }))
  expect(within(cardFor('pat')).getByRole('button', { name: 'Following' })).toBeInTheDocument()
})

test('clearing a search that is still running goes straight back to the suggestions', async () => {
  searchService.searchUsers.mockReturnValue(new Promise(() => {})) // never answers
  renderPage()
  await screen.findByText('Follows you')

  typeSearch('sa')
  expect(await screen.findByText('Searching...')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.queryByText('Searching...')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Suggested golfers' })).toBeInTheDocument()
  expect(screen.getByText('Follows you')).toBeInTheDocument()
})

test('shortening a running search to one letter does not leave the spinner up', async () => {
  searchService.searchUsers.mockReturnValue(new Promise(() => {})) // never answers
  renderPage()
  await screen.findByText('Follows you')

  typeSearch('sa')
  expect(await screen.findByText('Searching...')).toBeInTheDocument()
  typeSearch('s')
  await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument())
  expect(screen.getByText('No users found matching "s"')).toBeInTheDocument()
})
