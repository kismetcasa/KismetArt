// First entry is 0 so the immediate try doesn't pay a sleep.
const BACKOFF_MS = [0, 1000, 2000, 3000, 5000, 8000, 8000, 8000, 8000]

// Pool of public AR.IO gateways federating the same Arweave data. Each has
// its own CDN edge cache, so a stale 404 cached at one (e.g. CDN77 in front
// of arweave.net during the propagation window) doesn't block verification
// on the others. First successful HEAD wins.
const ARWEAVE_GATEWAYS = [
  'https://arweave.net',
  'https://permagate.io',
  'https://g8way.io',
  'https://ar-io.dev',
] as const

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
] as const

function gatewayUrls(uri: string): string[] {
  if (!uri) return []
  if (uri.startsWith('ar://')) {
    const id = uri.slice(5)
    return ARWEAVE_GATEWAYS.map((g) => `${g}/${id}`)
  }
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice(7)
    return IPFS_GATEWAYS.map((g) => `${g}/${cid}`)
  }
  return [uri]
}

/**
 * Poll the gateway pool for `uri` until any HEAD returns 200 or the budget
 * runs out. Used pre-mint to verify Turbo upload propagation: a 404 from
 * every gateway means the bundle hasn't propagated, and committing a mint
 * that references it produces a moment with empty/stale metadata. Probing
 * the pool in parallel is robust to single-edge stale 404s during the
 * propagation window.
 *
 * Returns true on the first 200 from any gateway, false if every poll
 * exhausts. Per-gateway network errors are treated as transient.
 */
export async function verifyArweaveAvailable(
  uri: string,
  budgetMs: number = 45_000,
): Promise<boolean> {
  const urls = gatewayUrls(uri)
  if (urls.length === 0) return false
  const start = Date.now()
  for (const delay of BACKOFF_MS) {
    if (Date.now() - start + delay >= budgetMs) return false
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    const probes = urls.map((u) =>
      fetch(u, { method: 'HEAD', cache: 'no-store' }).then((r) =>
        r.ok ? Promise.resolve() : Promise.reject(new Error(`${r.status}`)),
      ),
    )
    try {
      await Promise.any(probes)
      return true
    } catch {
      // every gateway 404'd or errored — keep polling
    }
  }
  return false
}
