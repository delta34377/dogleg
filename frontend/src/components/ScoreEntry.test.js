import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import ScoreEntry from './ScoreEntry'
import { roundsService, createRoundId } from '../services/roundsService'
import { prepareRoundPhoto } from '../utils/roundPhoto'

jest.mock('../services/roundsService', () => ({
  roundsService: { saveRound: jest.fn() },
  createRoundId: jest.fn(),
}))
jest.mock('../utils/roundPhoto', () => ({ prepareRoundPhoto: jest.fn() }))
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}))

// Course data for the "courses" query; tees and last-tee lookups return nothing
let mockCourseRow = null
jest.mock('../services/supabase', () => {
  const makeQuery = (table) => {
    const query = {}
    ;['select', 'eq', 'not', 'order', 'limit'].forEach((name) => { query[name] = () => query })
    const reply = () => Promise.resolve(table === 'courses'
      ? { data: mockCourseRow, error: mockCourseRow ? null : { code: 'PGRST116' } }
      : { data: table === 'tees' ? [] : null, error: null })
    query.single = reply
    query.maybeSingle = reply
    query.then = (resolve, reject) => reply().then(resolve, reject)
    return query
  }
  return { supabase: { from: makeQuery } }
})

const COURSE = {
  course_id: 'c1',
  course_name: 'Pine Valley',
  club_name: 'Pine Valley Golf Club',
  city: 'Pine Valley',
  state: 'NJ',
  num_holes: 18,
  total_par: 70,
}

const renderEntry = async (course = COURSE, onComplete = jest.fn()) => {
  const view = render(<ScoreEntry course={course} onComplete={onComplete} onCancel={jest.fn()} />)
  // let the tees / course queries settle
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return { ...view, onComplete }
}

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save Round|Processing photo/ }))
// The file input sits inside its "Add Photo" label
const pickPhoto = (file) => fireEvent.change(screen.getByLabelText(/Add Photo/), { target: { files: [file] } })
const savedPayload = () => roundsService.saveRound.mock.calls[roundsService.saveRound.mock.calls.length - 1][0]

beforeEach(() => {
  mockCourseRow = null
  // (CRA resets mock implementations before every test, so set it here)
  createRoundId.mockReturnValue('session-round-id')
  roundsService.saveRound.mockReset()
  roundsService.saveRound.mockResolvedValue({ data: { id: 'session-round-id', total_score: 88 }, error: null })
  prepareRoundPhoto.mockReset()
  jest.spyOn(window, 'confirm').mockReturnValue(true)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('saves an 18-hole total with holes_declared 18, the session id and no fake pars', async () => {
  const { onComplete } = await renderEntry()
  type('Total', '88')
  save()

  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ id: 'session-round-id', total_score: 88 }))
  expect(savedPayload()).toMatchObject({
    id: 'session-round-id',
    userId: 'me',
    total: 88,
    front9: null,
    back9: null,
    holesDeclared: 18,
    holes: [],
    coursePars: null, // the course has no par data
  })
})

it('saves a back-nine Quick Score as total + back9 with holes_declared 9', async () => {
  await renderEntry()
  fireEvent.click(screen.getByRole('radio', { name: '9 holes' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Back nine' }))
  type('Score (9 holes)', '44')
  save()

  await waitFor(() => expect(roundsService.saveRound).toHaveBeenCalled())
  expect(savedPayload()).toMatchObject({ total: 44, front9: null, back9: 44, holesDeclared: 9 })
})

it('defaults to 9 holes on a nine-hole course and sends it as the front nine', async () => {
  await renderEntry({ ...COURSE, num_holes: 9, total_par: 36 })
  expect(screen.getByRole('radio', { name: '9 holes' })).toHaveAttribute('aria-checked', 'true')
  // a nine-hole course has only one nine to pick
  expect(screen.queryByRole('radio', { name: 'Back nine' })).not.toBeInTheDocument()

  type('Score (9 holes)', '41')
  save()
  await waitFor(() => expect(roundsService.saveRound).toHaveBeenCalled())
  expect(savedPayload()).toMatchObject({ total: 41, front9: 41, back9: null, holesDeclared: 9 })
})

it('keeps a typed Total when Front 9 is typed after it (ENTRY-1)', async () => {
  await renderEntry()
  type('Total', '85')
  type('Front 9', '40')

  expect(screen.getByLabelText('Total')).toHaveValue(85)
  expect(screen.getByLabelText('Back 9')).toHaveValue(45)

  save()
  await waitFor(() => expect(roundsService.saveRound).toHaveBeenCalled())
  expect(savedPayload()).toMatchObject({ total: 85, front9: 40, back9: 45, holesDeclared: 18 })
})

it('blocks impossible scores with an inline message (hard limit)', async () => {
  await renderEntry()
  type('Total', '201')
  save()

  expect(screen.getByRole('alert')).toHaveTextContent('between 9 and 200')
  expect(roundsService.saveRound).not.toHaveBeenCalled()
})

it('asks "Are you sure?" for an unusual score, and stops if the golfer says no', async () => {
  window.confirm.mockReturnValue(false)
  await renderEntry()
  type('Total', '47')
  save()

  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/47 for 18 holes[\s\S]*Are you sure\?/))
  expect(roundsService.saveRound).not.toHaveBeenCalled()
})

it('shows the database message for a refused score (23514)', async () => {
  roundsService.saveRound.mockResolvedValue({
    data: null,
    error: { code: '23514', message: 'Hole scores must be between 1 and 20' },
    stage: 'round',
  })
  await renderEntry()
  type('Total', '88')
  save()

  expect(await screen.findByRole('alert')).toHaveTextContent('Hole scores must be between 1 and 20')
})

it('keeps Save disabled while the photo is processing (ENTRY-6), then sends the clean photo', async () => {
  let finish
  prepareRoundPhoto.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  const clean = new File(['clean'], 'round-photo.jpg', { type: 'image/jpeg' })
  await renderEntry()
  type('Total', '88')

  pickPhoto(new File(['raw'], 'IMG_1234.HEIC', { type: 'image/heic' }))

  const button = screen.getByRole('button', { name: 'Processing photo...' })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(roundsService.saveRound).not.toHaveBeenCalled()

  await act(async () => { finish(clean) })
  expect(screen.getByText(/IMG_1234\.HEIC/)).toBeInTheDocument()
  save()
  await waitFor(() => expect(roundsService.saveRound).toHaveBeenCalled())
  expect(savedPayload().photo).toBe(clean)
})

it('offers "Try again" / "Post without photo" when the upload fails (ENTRY-7), reusing the id', async () => {
  const clean = new File(['clean'], 'round-photo.jpg', { type: 'image/jpeg' })
  prepareRoundPhoto.mockResolvedValue(clean)
  roundsService.saveRound
    .mockResolvedValueOnce({ data: null, error: { message: 'upload failed' }, stage: 'photo' })
    .mockResolvedValueOnce({ data: { id: 'session-round-id' }, error: null })

  const { onComplete } = await renderEntry()
  type('Total', '88')
  pickPhoto(new File(['raw'], 'a.jpg', { type: 'image/jpeg' }))
  expect(await screen.findByText(/a\.jpg/)).toBeInTheDocument() // processed
  save()

  expect(await screen.findByText("Your photo didn't upload.")).toBeInTheDocument()
  expect(onComplete).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Post without photo' }))
  await waitFor(() => expect(onComplete).toHaveBeenCalled())

  const [first, second] = roundsService.saveRound.mock.calls.map(([payload]) => payload)
  expect(first.photo).toBe(clean)
  expect(second.photo).toBeNull()
  expect(first.id).toBe('session-round-id')
  expect(second.id).toBe(first.id)
  expect(createRoundId).toHaveBeenCalledTimes(1) // one id per entry session
})

it('uses real course pars when the course has them', async () => {
  mockCourseRow = { ...COURSE, pars: ['4', '4', '3', '5', '4', '4', '3', '5', '4', '4', '4', '3', '5', '4', '4', '3', '4', '5'] }
  await renderEntry()
  type('Total', '88')
  save()
  await waitFor(() => expect(roundsService.saveRound).toHaveBeenCalled())
  expect(savedPayload().coursePars).toEqual([4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5])
})

it('limits the date picker to the local date', async () => {
  await renderEntry()
  const now = new Date()
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  expect(screen.getByLabelText('Date Played')).toHaveAttribute('max', local)
})
