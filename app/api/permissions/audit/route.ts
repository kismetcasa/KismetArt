import { NextRequest, NextResponse } from 'next/server'
import { type Address, verifyMessage } from 'viem'
import { isAddress } from '@/lib/address'
import { redis } from '@/lib/redis'
import { getCollectionMeta, getTrackedCollections } from '@/lib/kv'
import { PLATFORM_COLLECTION } from '@/lib/config'
import { hasAdminBit, readPermissions } from '@/lib/permissions'
import { resolveSmartWallet } from '@/lib/resolveSmartWallet'
import { serverBaseClient } from '@/lib/rpc'

// Mirrors the admin-session pattern used by app/api/featured/route.ts —
// a 4-hour signed-message session keyed off ADMIN_ADDRESS. We reuse the
// same shape so the admin UI's existing session machinery just works
// without standing up a new auth layer for this one endpoint.
const ADMIN_ADDRESS = (process.env.ADMIN_ADDRESS ?? '').toLowerCase()
const SESSION_TTL = 4 * 60 * 60 * 1000

async function verifyAdminSession(body: {
  signature?: string
  timestamp?: number
}): Promise<{ error: string; status: number } | null> {
  if (!ADMIN_ADDRESS) return { error: 'Admin not configured', status: 403 }
  if (!body.signature || body.timestamp == null) {
    return { error: 'signature and timestamp required', status: 400 }
  }
  if (Date.now() - body.timestamp > SESSION_TTL) {
    return { error: 'Session expired — please sign in again', status: 401 }
  }
  const message = `Kismet Art admin session\nAddress: ${ADMIN_ADDRESS}\nTimestamp: ${body.timestamp}`
  const verified = await verifyMessage({
    address: ADMIN_ADDRESS as `0x${string}`,
    message,
    signature: body.signature as `0x${string}`,
  })
  if (!verified) return { error: 'Signature verification failed', status: 401 }
  return null
}

// One row in the audit cache. Persisted at kismetart:collection-perms:<addr>
// so the GET endpoint (and any future UI badge) can render last-known state
// without re-hitting RPC every load.
//
// `perms` is the bigint serialized as a decimal string — JSON.stringify
// on bigint throws, so we always normalize before persisting.
interface CollectionPermsCacheEntry {
  collection: string
  artist: string | null
  smartWallet: string | null
  perms: string
  hasAdmin: boolean
  checkedAt: number
  error?: string
}

const cacheKey = (addr: string) =>
  `kismetart:collection-perms:${addr.toLowerCase()}`

async function writeCacheEntry(entry: CollectionPermsCacheEntry): Promise<void> {
  try {
    await redis.set(cacheKey(entry.collection), JSON.stringify(entry))
  } catch (err) {
    // Cache write failure is non-fatal — the audit response still
    // returns the freshly-read result. Log so a Redis outage during
    // audit doesn't silently mean "no cached results next time".
    console.error('[permissions/audit] cache write failed', {
      collection: entry.collection,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Audit one collection: resolve its artist's smart wallet, read on-chain
 * permissions for that wallet at tokenId 0, persist the result.
 *
 * Designed to never throw — all error paths are captured in the returned
 * `error` field so the batch caller can keep auditing the rest of the
 * list rather than aborting on the first hiccup.
 */
async function auditOne(
  client: ReturnType<typeof serverBaseClient>,
  collection: string,
): Promise<CollectionPermsCacheEntry> {
  const checkedAt = Date.now()
  const meta = await getCollectionMeta(collection)
  const artist = meta?.artist ?? null

  if (!artist || !isAddress(artist)) {
    const entry: CollectionPermsCacheEntry = {
      collection,
      artist: null,
      smartWallet: null,
      perms: '0',
      hasAdmin: false,
      checkedAt,
      error: 'no artist recorded in KV meta',
    }
    await writeCacheEntry(entry)
    return entry
  }

  // Resolve the artist's inprocess smart wallet via the shared helper.
  // resolveSmartWallet centralizes the defensive shape parsing
  // (`address`/`smartWallet`/`smart_wallet`/`smartAccount` + raw
  // string), so this endpoint and the local proxy at
  // /api/inprocess/smart-wallet can never drift on which response
  // shapes they accept. Returns null on any failure (network,
  // non-200, unparseable). Caches under Next's data cache for 1h
  // (smart-wallet → artist mapping is effectively immutable).
  const smartWallet = await resolveSmartWallet(artist)

  if (!smartWallet) {
    const entry: CollectionPermsCacheEntry = {
      collection,
      artist,
      smartWallet: null,
      perms: '0',
      hasAdmin: false,
      checkedAt,
      error: 'smartwallet lookup failed or returned no address',
    }
    await writeCacheEntry(entry)
    return entry
  }

  let perms: bigint
  try {
    perms = await readPermissions(client, collection as Address, 0n, smartWallet as Address)
  } catch (err) {
    const entry: CollectionPermsCacheEntry = {
      collection,
      artist,
      smartWallet,
      perms: '0',
      hasAdmin: false,
      checkedAt,
      error: err instanceof Error ? err.message : String(err),
    }
    await writeCacheEntry(entry)
    return entry
  }

  const entry: CollectionPermsCacheEntry = {
    collection,
    artist,
    smartWallet,
    perms: perms.toString(),
    hasAdmin: hasAdminBit(perms),
    checkedAt,
  }
  await writeCacheEntry(entry)
  return entry
}

/**
 * Public-facing audit row shape. Strips the `error` string field
 * present on the internal cache entry — those messages can include
 * raw RPC error text, upstream service health hints, or other
 * infra-internal information that's better not leaked through an
 * unauthenticated endpoint. Replaced with a coarse `errored: boolean`
 * so consumers can render a "checking failed" badge without seeing
 * which exact service flaked.
 */
interface PublicAuditResult {
  collection: string
  artist: string | null
  smartWallet: string | null
  perms: string
  hasAdmin: boolean
  checkedAt: number
  errored: boolean
}

function toPublicResult(entry: CollectionPermsCacheEntry): PublicAuditResult {
  return {
    collection: entry.collection,
    artist: entry.artist,
    smartWallet: entry.smartWallet,
    perms: entry.perms,
    hasAdmin: entry.hasAdmin,
    checkedAt: entry.checkedAt,
    errored: !!entry.error,
  }
}

/**
 * GET /api/permissions/audit — public, returns last-known cached results
 * for every tracked collection. Useful for an admin dashboard / status
 * page without forcing a fresh on-chain read every visit. Returns an
 * empty array for collections that have never been audited.
 *
 * Endpoint is intentionally unauthenticated — the data (smart wallet ↔
 * artist EOA pairs, ADMIN status) is derivable from on-chain events
 * already, so direct disclosure isn't a leak. The previous version
 * also surfaced the cache's raw `error` string (RPC errors, internal
 * status messages); those are now redacted to a boolean `errored`
 * field so a public scrape can't pivot internal-infra signals out of
 * the response. Detailed errors stay in the cache for the admin-gated
 * POST handler's response.
 */
export async function GET() {
  const tracked = await getTrackedCollections()
  const platformLower = PLATFORM_COLLECTION.toLowerCase()
  const addresses = tracked.filter(
    (a) => a.toLowerCase() !== platformLower && isAddress(a),
  )
  if (addresses.length === 0) return NextResponse.json({ results: [] })
  const keys = addresses.map(cacheKey)
  let raws: (string | CollectionPermsCacheEntry | null)[] = []
  try {
    raws = await redis.mget<(string | CollectionPermsCacheEntry | null)[]>(...keys)
  } catch {
    return NextResponse.json({ results: [] })
  }
  const results: PublicAuditResult[] = []
  for (let i = 0; i < addresses.length; i++) {
    const raw = raws[i]
    if (!raw) continue
    // Guard JSON.parse per entry: a single corrupt cache entry
    // (Upstash partial write, manual surgery, schema drift) shouldn't
    // 500 the whole response and hide every other collection's status.
    // Log + skip the bad entry instead.
    try {
      const entry =
        typeof raw === 'string' ? (JSON.parse(raw) as CollectionPermsCacheEntry) : raw
      results.push(toPublicResult(entry))
    } catch (err) {
      console.error('[permissions/audit GET] could not parse cache entry', {
        address: addresses[i],
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return NextResponse.json({ results })
}

/**
 * POST /api/permissions/audit — admin-only. Walks every tracked collection,
 * reads on-chain permissions for the artist's smart wallet, persists to
 * the per-collection cache, returns the full summary.
 *
 * Idempotent and safe to re-run — every call overwrites cached entries
 * with fresh reads. Skips PLATFORM_COLLECTION because that's audited
 * separately by the startup healthcheck (lib/healthcheck.ts) against a
 * different operator wallet (OPERATOR_SMART_WALLET, not per-artist).
 *
 * Concurrency capped at 10 in-flight reads — RPC providers throttle on
 * burst, and Upstash's free tier doesn't love thousands of parallel
 * writes either. With ~100 tracked collections this finishes in well
 * under the 60s Vercel function ceiling; we'd need to switch to a
 * background queue if Kismet ever crosses ~1000 collections.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    signature?: string
    timestamp?: number
  }
  const err = await verifyAdminSession(body)
  if (err) return NextResponse.json({ error: err.error }, { status: err.status })

  const tracked = await getTrackedCollections()
  const platformLower = PLATFORM_COLLECTION.toLowerCase()
  const toAudit = tracked.filter(
    (a) => a.toLowerCase() !== platformLower && isAddress(a),
  )

  const client = serverBaseClient()
  const results: CollectionPermsCacheEntry[] = []
  const BATCH = 10
  for (let i = 0; i < toAudit.length; i += BATCH) {
    const chunk = toAudit.slice(i, i + BATCH)
    const chunkResults = await Promise.all(
      chunk.map((addr) => auditOne(client, addr)),
    )
    results.push(...chunkResults)
  }

  const ok = results.filter((r) => r.hasAdmin).length
  const missing = results.filter((r) => !r.hasAdmin && !r.error).length
  const errors = results.filter((r) => r.error).length

  return NextResponse.json({
    checked: results.length,
    ok,
    missing,
    errors,
    results,
  })
}
