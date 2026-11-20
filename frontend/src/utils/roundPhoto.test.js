import imageCompression from 'browser-image-compression'
import { prepareRoundPhoto, ROUND_PHOTO_OPTIONS } from './roundPhoto'

jest.mock('browser-image-compression', () => jest.fn())

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

it('never falls back to the original file', async () => {
  const picked = original()
  imageCompression.mockResolvedValue(picked)
  await expect(prepareRoundPhoto(picked)).rejects.toThrow('not re-encoded')
})

it('passes on decode failures (e.g. HEIC on desktop Chrome) so the UI can explain', async () => {
  imageCompression.mockRejectedValue(new Error('The file given is not an image'))
  await expect(prepareRoundPhoto(original())).rejects.toThrow('not an image')
})
