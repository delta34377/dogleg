import { render, screen, fireEvent, act } from '@testing-library/react'
import InviteButton, { INVITE_SHARE_TITLE, INVITE_SHARE_TEXT } from './InviteButton'

let mockAuth = { user: { id: 'me' }, profile: { id: 'me', username: 'me_golfer' } }
jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const INVITE_URL = `${window.location.origin}/join/me_golfer`

// jsdom has neither navigator.share nor navigator.clipboard; tests add them
function setNavigator(name, value) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true })
}
function removeNavigator(name) {
  delete window.navigator[name]
}

const abortError = () => {
  const error = new Error('Share canceled')
  error.name = 'AbortError'
  return error
}

beforeEach(() => {
  mockAuth = { user: { id: 'me' }, profile: { id: 'me', username: 'me_golfer' } }
})

afterEach(() => {
  removeNavigator('share')
  removeNavigator('clipboard')
  jest.useRealTimers()
})

// Click, then let the share / copy promise finish. (With fake timers the
// promise is flushed without waiting on a timer.)
const clickInvite = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Invite friends' }))
  await act(() => Promise.resolve())
}

test('renders nothing until the user has a username', () => {
  mockAuth = { user: { id: 'me' }, profile: { id: 'me', username: null } }
  const { container, rerender } = render(<InviteButton />)
  expect(container).toBeEmptyDOMElement()

  mockAuth = { user: { id: 'me' }, profile: null }
  rerender(<InviteButton />)
  expect(container).toBeEmptyDOMElement()
})

test("opens the phone's share sheet with the invite link", async () => {
  const share = jest.fn().mockResolvedValue(undefined)
  const writeText = jest.fn().mockResolvedValue(undefined)
  setNavigator('share', share)
  setNavigator('clipboard', { writeText })
  render(<InviteButton />)

  await clickInvite()
  expect(share).toHaveBeenCalledWith({ title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url: INVITE_URL })
  expect(INVITE_SHARE_TITLE).toBe('Join me on Dogleg')
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument()
})

test('a second tap while the share sheet is open is ignored', async () => {
  let closeSheet
  const share = jest.fn(() => new Promise((resolve) => { closeSheet = resolve }))
  const writeText = jest.fn().mockResolvedValue(undefined)
  setNavigator('share', share)
  setNavigator('clipboard', { writeText })
  render(<InviteButton />)

  await clickInvite()
  await clickInvite()
  expect(share).toHaveBeenCalledTimes(1)
  expect(writeText).not.toHaveBeenCalled()

  await act(async () => closeSheet())
  await clickInvite()
  expect(share).toHaveBeenCalledTimes(2)
})

test('closing the share sheet does nothing else', async () => {
  const share = jest.fn().mockRejectedValue(abortError())
  const writeText = jest.fn().mockResolvedValue(undefined)
  setNavigator('share', share)
  setNavigator('clipboard', { writeText })
  render(<InviteButton />)

  await clickInvite()
  expect(share).toHaveBeenCalledTimes(1)
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.queryByText('Link copied')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('if sharing fails for another reason, the link is copied instead', async () => {
  const notAllowed = new Error('Permission denied')
  notAllowed.name = 'NotAllowedError'
  setNavigator('share', jest.fn().mockRejectedValue(notAllowed))
  const writeText = jest.fn().mockResolvedValue(undefined)
  setNavigator('clipboard', { writeText })
  render(<InviteButton />)

  await clickInvite()
  expect(writeText).toHaveBeenCalledWith(INVITE_URL)
  expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
})

test('without a share sheet the link is copied, and "Link copied" shows for 2 seconds', async () => {
  jest.useFakeTimers()
  const writeText = jest.fn().mockResolvedValue(undefined)
  setNavigator('clipboard', { writeText })
  render(<InviteButton />)

  await clickInvite()
  expect(writeText).toHaveBeenCalledWith(INVITE_URL)
  expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()

  act(() => { jest.advanceTimersByTime(1900) })
  expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(200) })
  expect(screen.getByRole('button', { name: 'Invite friends' })).toBeInTheDocument()
})

test('if copying is blocked, the link is shown to copy by hand', async () => {
  setNavigator('clipboard', { writeText: jest.fn().mockRejectedValue(new Error('Document is not focused')) })
  render(<InviteButton />)

  await clickInvite()
  const box = screen.getByLabelText('Copy your invite link')
  expect(box).toHaveValue(INVITE_URL)
  expect(box).toHaveAttribute('readonly')
  expect(screen.queryByText('Link copied')).not.toBeInTheDocument()
})

test('with no clipboard at all, the link is shown too', async () => {
  render(<InviteButton />)
  await clickInvite()
  expect(screen.getByLabelText('Copy your invite link')).toHaveValue(INVITE_URL)
})

test('unmounting while "Link copied" shows is harmless', async () => {
  jest.useFakeTimers()
  setNavigator('clipboard', { writeText: jest.fn().mockResolvedValue(undefined) })
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
  const { unmount } = render(<InviteButton />)
  await clickInvite()
  unmount()
  act(() => { jest.advanceTimersByTime(3000) })
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
})
