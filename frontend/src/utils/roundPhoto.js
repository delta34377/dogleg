import imageCompression from 'browser-image-compression'

// Every round photo is re-encoded in the browser before upload, whatever its
// size. Drawing the picture onto a canvas and saving a fresh JPEG throws away
// the photo's hidden metadata (EXIF: GPS location, time, phone model), which
// matters because the round-photos bucket is public (PROFILES-5 / WEB-6 /
// SECURITY-6). It also shrinks multi-MB phone photos so the feed loads
// quickly on mobile data.
//
// browser-image-compression only keeps EXIF when asked to (preserveExif),
// and we never ask.
//
// useWebWorker must be false, and said out loud (leaving it out means true).
// In worker mode the library starts a Web Worker that downloads its own code
// from cdn.jsdelivr.net (its default libURL) and hands that code the ORIGINAL
// photo, GPS data included. That would tell a third party the golfer's IP
// address on every upload and run code we don't ship on the untouched
// picture. On the main thread it uses only the copy bundled with the app; it
// still re-encodes through a canvas, so the metadata is still removed. The
// cost is a short pause while a big photo is processed.
export const ROUND_PHOTO_OPTIONS = {
  maxSizeMB: 1,             // plenty for a feed photo and the share card
  maxWidthOrHeight: 2048,   // longest edge in pixels
  fileType: 'image/jpeg',   // one predictable format (and file extension)
  initialQuality: 0.85,
  useWebWorker: false,      // no code fetched from a CDN (see above)
}

// Takes the File the golfer picked and resolves to a new, clean JPEG File.
// Rejects when the browser can't read the picture (for example a HEIC photo
// on desktop Chrome) — we never fall back to uploading the original, because
// that would bring the location data back.
export async function prepareRoundPhoto(file) {
  if (!file) throw new Error('No photo given')

  const compressed = await imageCompression(file, ROUND_PHOTO_OPTIONS)
  if (!compressed || compressed === file) {
    // Defensive: the library always draws a fresh copy, but make sure
    throw new Error('Photo was not re-encoded')
  }

  return new File([compressed], 'round-photo.jpg', {
    type: compressed.type || 'image/jpeg',
    lastModified: Date.now(),
  })
}
