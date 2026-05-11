import { NextRequest } from 'next/server'
import { gatewayUrls } from '@/lib/arweave/gateways'

// Node runtime: edge has stricter streaming + body-size semantics, and the
// proxy's whole job is streaming arbitrary-size GIF/image bytes. Node also
// lets us tie `req.signal` to upstream fetches without runtime quirks.
export const runtime = 'nodejs'
// Cap function duration. Pro plans support up to 300s; 60s is the Hobby
// ceiling and comfortably covers the typical multi-MB GIF over a slow
// gateway. Anything longer than this and the user has already abandoned
// the tab — better to surface a 502 and let MomentImage walk to direct.
export const maxDuration = 60

// Soft upper bound on declared upstream size. The on-chain media fields are
// open-ended (Turbo bundle limit is 420MB), and a single runaway upload
// shouldn't be able to monopolize function-seconds + bandwidth budget. This
// is a runaway-prevention cap, not a curation rule — typical moments are
// orders of magnitude below.
const MAX_DECLARED_BYTES = 500 * 1024 * 1024
// Hard ceiling for the gateway race. Past 30s the page is already past the
// user's "is this broken?" threshold; bailing here and falling through to
// MomentImage's direct-gateway walk is better UX than blocking longer.
const RACE_TIMEOUT_MS = 30_000

/**
 * Race the AR.IO / IPFS gateway pool for `uri` and return the first 200
 * response. Losing gateways are aborted as soon as a winner emerges so
 * their bodies don't stay open consuming compute + upstream sockets. The
 * caller's request signal is wired in so a browser disconnect aborts every
 * in-flight upstream fetch — avoids billing orphaned function time.
 *
 * Inline (not factored to lib/) because this is the only consumer: the
 * client side has no need to race gateways once the proxy is doing it
 * server-side with a long-cached response.
 */
async function raceFetchGateways(
  uri: string,
  timeoutMs: number,
  clientSignal: AbortSignal,
): Promise<Response | null> {
  const urls = gatewayUrls(uri)
  if (urls.length === 0) return null
  // Single-URL case (gatewayUrls returns the input verbatim for non-ar/non-ipfs).
  // We SSRF-guard above so this only fires for the ar:// / ipfs:// schemes that
  // genuinely have one gateway entry. Stream it directly.
  if (urls.length === 1) {
    try {
      const r = await fetch(urls[0], { cache: 'no-store', signal: clientSignal })
      return r.ok ? r : null
    } catch {
      return null
    }
  }
  const controllers = urls.map(() => new AbortController())
  const cancelAll = () => controllers.forEach((c) => c.abort())
  const timer = setTimeout(cancelAll, timeoutMs)
  // Browser hangs up mid-stream → propagate the abort to every probe so we
  // don't keep gateway sockets open after the user is gone.
  clientSignal.addEventListener('abort', cancelAll, { once: true })
  try {
    const probes = urls.map((u, idx) =>
      fetch(u, { cache: 'no-store', signal: controllers[idx].signal }).then((r) => {
        if (!r.ok) throw new Error(`${u} -> ${r.status}`)
        return { response: r, idx }
      }),
    )
    const winner = await Promise.any(probes)
    // Cancel losers — their headers may already have come back, but we
    // don't want their bodies tying up bandwidth or function time.
    controllers.forEach((c, i) => { if (i !== winner.idx) c.abort() })
    return winner.response
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /api/img?u=ar://<txid>  (or ipfs://<cid>)
 *
 * Streams the bytes back with `Cache-Control: public, max-age=1y, immutable`
 * so the Vercel CDN edge caches the response per-region. Subsequent viewers
 * in any region get the bytes off the nearest POP instead of round-tripping
 * to Arweave/IPFS. Since `ar://<txid>` and `ipfs://<cid>` are
 * content-addressed (the URI literally contains the hash), the bytes at a
 * given URL are immutable — a year-long cache is safe.
 *
 * Used by MomentImage's 'proxy' mode for content the next/image optimizer
 * can't handle (animated GIFs, files >4MB that 413). The proxy is the bridge
 * that puts those assets behind an edge cache they'd otherwise miss.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new Response('missing u', { status: 400 })
  // SSRF guard. The proxy wraps our gateway pool, not an arbitrary outbound
  // fetcher — anything else is either already client-renderable (https://,
  // blob:, data:) so doesn't benefit, or unsafe to follow.
  if (!u.startsWith('ar://') && !u.startsWith('ipfs://')) {
    return new Response('only ar:// and ipfs:// supported', { status: 400 })
  }
  const upstream = await raceFetchGateways(u, RACE_TIMEOUT_MS, req.signal)
  if (!upstream || !upstream.body) {
    // Every gateway 404'd / errored / timed out. Don't cache the failure —
    // by the time the next request arrives the bundle may have propagated.
    return new Response('upstream unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const declaredLen = upstream.headers.get('content-length')
  if (declaredLen && Number(declaredLen) > MAX_DECLARED_BYTES) {
    upstream.body.cancel().catch(() => {})
    return new Response('too large', {
      status: 413,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const headers = new Headers({
    // Browser refuses to render `image/<x>` content with an empty Content-Type
    // in some cases; default to octet-stream so it at least attempts.
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    // `immutable` tells the browser not to revalidate on reload. The long
    // max-age covers both Vercel's CDN edge cache (per-region) and the
    // user's browser HTTP cache. Safe because the URI is content-addressed.
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
  if (declaredLen) headers.set('Content-Length', declaredLen)
  // Stream upstream body through without buffering. fetch's response body is
  // a ReadableStream; Response accepts one directly.
  return new Response(upstream.body, { status: 200, headers })
}
