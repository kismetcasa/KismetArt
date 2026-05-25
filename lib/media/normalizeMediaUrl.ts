// Arweave txids are SHA-256 hashes base64url-encoded → exactly 43 chars
// over [A-Za-z0-9_-]. Tight enough that a random first path segment won't
// accidentally match.
const ARWEAVE_TXID = /^[A-Za-z0-9_-]{43}$/

/**
 * Normalise a user-pasted media URL to the canonical scheme the app stores
 * in metadata, so re-pointing a moment at content that ALREADY lives on
 * Arweave never re-uploads the bytes.
 *
 *   ar://AbC...                    → ar://AbC...        (kept)
 *   https://arweave.net/AbC...     → ar://AbC...        (gateway → ar://)
 *   https://permagate.io/AbC.../t  → ar://AbC.../t
 *   https://ipfs.io/ipfs/bafy...   → ipfs://bafy...
 *   https://example.com/clip.mp4   → kept as-is (opaque direct URL)
 *
 * Returns null for input that isn't a usable absolute media URL, so callers
 * can reject it before building metadata.
 */
export function normalizeMediaUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('ar://') || trimmed.startsWith('ipfs://')) return trimmed

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null

  // Path-style IPFS: /ipfs/<cid>[/<path>] on any host.
  const ipfsPath = u.pathname.match(/\/ipfs\/(.+?)\/?$/)
  if (ipfsPath) return `ipfs://${ipfsPath[1]}`

  // Arweave gateway: first path segment is a 43-char txid. Matches any AR.IO
  // gateway (arweave.net, permagate.io, Irys/Turbo, …) without a host list.
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length >= 1 && ARWEAVE_TXID.test(segs[0]!)) {
    const rest = segs.slice(1).join('/')
    return `ar://${segs[0]}${rest ? `/${rest}` : ''}`
  }

  // Opaque https media (no recognisable content hash) — keep verbatim; the
  // gateway pool / image proxy pass non-ar:// URLs through unchanged.
  return trimmed
}

/**
 * Best-effort media-kind guess from a URL's extension, for pre-selecting the
 * type control. ar:// / ipfs:// hashes carry no extension, so callers default
 * to 'video' (the common "restore my video" case) when this returns null.
 */
export function guessMediaTypeFromUrl(url: string): 'video' | 'gif' | 'image' | null {
  const path = url.split(/[?#]/, 1)[0]!.toLowerCase()
  if (/\.(mp4|webm|mov|ogv|m4v)$/.test(path)) return 'video'
  if (path.endsWith('.gif')) return 'gif'
  if (/\.(png|jpe?g|webp|avif|gif|svg)$/.test(path)) return 'image'
  return null
}
