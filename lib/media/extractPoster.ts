'use client'

/**
 * Extract the first frame of a video file as a JPEG File, suitable for
 * uploading to Arweave as a moment's `image` poster.
 *
 * Browser-native (HTMLVideoElement → canvas → JPEG blob), so it has no
 * FFmpeg.wasm dependency and works on long videos that would exceed the
 * GIF transcoder's ~100MB ceiling. Mirrors the technique used inside
 * `lib/media/thumbhash.ts` for the same reason.
 *
 * Returns null on any decode/encode failure; callers should fall back to
 * letting `meta.image` stay undefined rather than substituting the video
 * URL itself (which the renderer would try to load as an image and fail).
 */
export async function extractVideoPoster(file: File): Promise<File | null> {
  if (!file.type.startsWith('video/')) return null
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('video decode failed')), { once: true })
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    if (!blob) return null
    const base = file.name.replace(/\.[^.]+$/, '') || 'poster'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(video.src)
  }
}
