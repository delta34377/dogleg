import imageCompression from 'browser-image-compression'
import { prepareRoundPhoto, ROUND_PHOTO_OPTIONS } from './roundPhoto'

jest.mock('browser-image-compression', () => jest.fn())

beforeEach(() => imageCompression.mockReset())

const original = () => new File(['raw bytes with exif'], 'IMG_0001.jpg', { type: 'image/jpeg' })

it('re-encodes every photo, even a small one, to a clean JPEG without EXIF', async () => {
  imageCompression.mockResolvedValue(new Blob(['re-encoded'], { type: 'image/jpeg' }))

  const file = await prepareRoundPhoto(original())

  expect(imageCompression).toHaveBeenCalledTimes(1)
  const options = imageCompression.mock.calls[0][1]
  expect(options).toEqual(ROUND_PHOTO_OPTIONS)
  expect(options.fileType).toBe('image/jpeg')
  expect(options.preserveExif).toBeUndefined() // the library keeps EXIF only when asked
  expect(file).toBeInstanceOf(File)
  expect(file.type).toBe('image/jpeg')
  expect(file.name).toBe('round-photo.jpg')
})

it('turns the web worker off explicitly, so no code is fetched from a CDN (DEPLOY-3)', async () => {
  imageCompression.mockResolvedValue(new Blob(['re-encoded'], { type: 'image/jpeg' }))
  await prepareRoundPhoto(original())
  const options = imageCompression.mock.calls[0][1]
  // Must be the boolean false: the library treats a missing value as true
  expect(options.useWebWorker).toBe(false)
  expect(options.libURL).toBeUndefined()
})

describe('the real library with these options', () => {
  // A stand-in Worker that records how it was used, so the test can see
  // whether the library would have loaded its code from jsDelivr
  let workers
  let originalWorker
  let originalCreateObjectURL

  beforeEach(() => {
    workers = []
    originalWorker = global.Worker
    originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = jest.fn(() => 'blob:worker-script')
    global.Worker = class {
      constructor(url) {
        this.url = url
        this.messages = []
        workers.push(this)
      }
      addEventListener() {}
      postMessage(message) { this.messages.push(message) }
      terminate() {}
    }
  })

  afterEach(() => {
    global.Worker = originalWorker
    URL.createObjectURL = originalCreateObjectURL
  })

  // Lets the library run up to the point where it picks worker or main thread
  const settle = () => new Promise(resolve => setTimeout(resolve, 20))

  it('never starts a worker, so nothing is loaded from jsDelivr', async () => {
    const realImageCompression = jest.requireActual('browser-image-compression')
    // jsdom can't decode images, so the main-thread work never finishes;
    // only what happens before that matters here
    realImageCompression(original(), ROUND_PHOTO_OPTIONS).catch(() => {})
    await settle()
    expect(workers).toHaveLength(0)
  })

  it('(control) with the worker on, the library would load itself from jsDelivr', async () => {
    const realImageCompression = jest.requireActual('browser-image-compression')
    realImageCompression(original(), { ...ROUND_PHOTO_OPTIONS, useWebWorker: true }).catch(() => {})
    await settle()
    expect(workers).toHaveLength(1)
    expect(workers[0].messages[0].imageCompressionLibUrl).toMatch(/^https:\/\/cdn\.jsdelivr\.net\//)
  })
})

it('never falls back to the original file', async () => {
  const picked = original()
  imageCompression.mockResolvedValue(picked)
  await expect(prepareRoundPhoto(picked)).rejects.toThrow('not re-encoded')
})

it('passes on decode failures (e.g. HEIC on desktop Chrome) so the UI can explain', async () => {
  imageCompression.mockRejectedValue(new Error('The file given is not an image'))
  await expect(prepareRoundPhoto(original())).rejects.toThrow('not an image')
})
