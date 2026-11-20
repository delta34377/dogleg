import { fireEvent, render, screen } from '@testing-library/react'
import PrivacyPolicy from './PrivacyPolicy'

// The page only uses navigate(), so a stand-in is enough (no router needed)
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const renderPage = () => render(<PrivacyPolicy />)

beforeEach(() => {
  window.localStorage.clear()
  window.gtag = jest.fn()
  mockNavigate.mockClear()
})

afterEach(() => {
  delete window.gtag
})

it('shows the analytics cookie switch with no option chosen yet', () => {
  renderPage()
  expect(screen.getByRole('group', { name: /analytics cookies/i })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'On' })).not.toBeChecked()
  expect(screen.getByRole('radio', { name: 'Off' })).not.toBeChecked()
  expect(screen.getByText(/haven't chosen yet/i)).toBeInTheDocument()
})

it('turning analytics cookies off saves the choice and tells Google Analytics', () => {
  renderPage()
  fireEvent.click(screen.getByRole('radio', { name: 'Off' }))

  expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked()
  expect(window.localStorage.getItem('dogleg_analytics_optout')).toBe('1')
  expect(window.gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied' }))
  expect(screen.getByText(/analytics cookies are off in this browser/i)).toBeInTheDocument()
})

it('shows a saved choice when the page opens', () => {
  window.localStorage.setItem('dogleg_analytics_optout', '1')
  renderPage()
  expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked()
})

it('only promises what exists: email deletion within 30 days, no settings or push', () => {
  renderPage()
  const text = document.body.textContent
  expect(text).toMatch(/hello@dogleg\.io from the email address on your Dogleg account/)
  expect(text).toMatch(/within 30 days/)
  expect(text).not.toMatch(/through the Service settings/i)
  expect(text).not.toMatch(/privacy@dogleg\.io/)
  expect(text).toMatch(/We don't send push notifications/)
})

it('Back goes to the home page when there is no earlier page (opened in a new tab)', () => {
  window.history.replaceState({ idx: 0 }, '')
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('Back goes back when there is an earlier page in the app', () => {
  window.history.replaceState({ idx: 2 }, '')
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  expect(mockNavigate).toHaveBeenCalledWith(-1)
})
