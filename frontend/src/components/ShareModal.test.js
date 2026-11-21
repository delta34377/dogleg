import { render, waitFor } from '@testing-library/react'
import ShareModal from './ShareModal'

// The share image is drawn on a <canvas>, which jsdom doesn't implement.
// These tests swap in a canvas that records the text drawn on it, which is
// enough to check the "(+14)" next to the score.
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

let drawnText
let originalImage

function recordingContext() {
  const state = {}
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'fillText') return (text) => drawnText.push(String(text))
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 8 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
      if (prop in target) return target[prop]
      return () => {} // every other drawing call does nothing
    },
  })
}

beforeEach(() => {
  drawnText = []
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext())
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,')
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob(['png'])))
  // Images (the logo) "fail" straight away, so the image falls back to text
  originalImage = global.Image
  global.Image = class {
    set src(value) {
      this._src = value
      setTimeout(() => this.onerror && this.onerror(new Error('no images in tests')), 0)
    }
    get src() { return this._src }
  }
})

afterEach(() => {
  global.Image = originalImage
  jest.restoreAllMocks()
})

// What PostRoundModal passes for an 18-hole Quick Score (42 + 44) on a
// nine-hole course: the database stores the nine's par (36) as the round's
// par and the nine's card padded with nulls (ENTRY-3)
const eighteenOnANineHoleCourse = {
  id: 'round-1',
  short_code: 'ABC123',
  user_id: 'user-1',
  course_name: 'Little Links',
  date: '2026-07-04',
  front9: 42,
  back9: 44,
  total: 86,
  par: 36,
  holes_played: 18,
  holes: [],
  coursePars: [4, 4, 3, 5, 4, 4, 3, 5, 4, ...Array(9).fill(null)],
}

it('the share image shows vs par against twice the nine par on a nine-hole course', async () => {
  render(<ShareModal round={eighteenOnANineHoleCourse} username="alex_fairway" onClose={() => {}} />)

  await waitFor(() => expect(drawnText).toContain('86'))
  await waitFor(() => expect(drawnText).toContain('(+14)'))
  // Next to the big score and in the VS PAR tile of the bottom panel
  expect(drawnText).toContain('+14')
  expect(drawnText).not.toContain('(+50)')
  expect(drawnText).not.toContain('+50')
})

it('a normal 18-hole round still reads against the course par', async () => {
  const round = { ...eighteenOnANineHoleCourse, front9: 40, back9: 39, total: 79, par: 72, coursePars: null }
  render(<ShareModal round={round} username="alex_fairway" onClose={() => {}} />)

  await waitFor(() => expect(drawnText).toContain('(+7)'))
})
