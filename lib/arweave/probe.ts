import { gatewayUrls } from './gateways'

interface ProbeResult {
  /** First gateway URL that responded 200, or null if every probe failed/timed out. */
  url: string | null
  /** Wall-clock ms from probe start to first 200 (or to timeout). */
  elapsedMs: number
}

interface ProbeOptions {
  /**
   * Hard timeout for the race. Each gateway probe gets an AbortSignal so a
   * slow gateway doesn't keep the connection open after a faster one wins.
   * Defaults to 3500ms — past that, falling back to the serial walker (which
   * MomentImage already does on error) is better than holding the paint.
   */
  timeoutMs?: number
  /** HTTP method for the probe. HEAD is cheap; GET is needed for some IPFS gateways that don't respond to HEAD. */
  method?: 'HEAD' | 'GET'
}

/**
 * Race the gateway pool for `uri` in parallel and return the first URL that
 * returns 200. Phase 2 plug-in point for MomentImage: instead of rendering
 * arweave.net first and walking the pool on error (the current `useFallbackUrl`
 * behavior), call this on mount and render the winner. Cuts tail latency when
 * the primary gateway has a stale 404 cached at its CDN edge.
 *
 * Returns the same URL shape that `gatewayUrls()` produces — a full
 * `https://gateway/<txid>` string — so callers can drop it straight into
 * `<Image src={...}>` or pass it through next/image's optimizer.
 *
 * Non-ar/ipfs URIs (https://, blob:, data:) skip the race entirely since
 * there's nothing to fan out across; the URI is returned as-is.
 */
export async function probeFirstGateway(
  uri: string,
  { timeoutMs = 3500, method = 'HEAD' }: ProbeOptions = {},
): Promise<ProbeResult> {
  const urls = gatewayUrls(uri)
  const started = Date.now()
  if (urls.length === 0) return { url: null, elapsedMs: 0 }
  // Single-element list (https://, blob:, data:) — nothing to race.
  if (urls.length === 1) return { url: urls[0], elapsedMs: 0 }

  // One AbortController per probe so we can cancel the losers as soon as a
  // winner emerges — keeps the network pane from showing zombie requests and
  // lets the runtime free the connections.
  const controllers = urls.map(() => new AbortController())
  const overallTimer = setTimeout(() => {
    for (const c of controllers) c.abort()
  }, timeoutMs)

  try {
    const probes = urls.map((u, i) =>
      fetch(u, { method, cache: 'no-store', signal: controllers[i].signal }).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return u
      }),
    )
    const winner = await Promise.any(probes)
    // Cancel any still-in-flight losers.
    for (const c of controllers) c.abort()
    return { url: winner, elapsedMs: Date.now() - started }
  } catch {
    // Every gateway 404'd, errored, or aborted on the timeout — give up.
    return { url: null, elapsedMs: Date.now() - started }
  } finally {
    clearTimeout(overallTimer)
  }
}
