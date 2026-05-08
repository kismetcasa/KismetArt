import { redis } from './redis'
import { PLATFORM_COLLECTION } from './config'
import { INPROCESS_API } from './inprocess'

const KEY = 'kismetart:collections'
// Subset of KEY containing only collections the user explicitly created via
// the Create Collection form. Auto-deployed wrapper collections (created by
// the protocol on first-mint when no collection is selected) live in KEY
// for moment fan-out, but NOT in USER_KEY — so they surface as individual
// mints rather than as collections in their own right.
const USER_KEY = 'kismetart:user-collections'

export interface CollectionMeta {
  address: string
  name: string
  image?: string
  description?: string
  artist?: string // lowercased deployer address
}

/** How a collection was registered. Drives whether it appears in
 *  collection-shaped surfaces (Collections feed, profile collections list,
 *  moment-detail collection chip) or is treated as a standalone wrapper. */
export type CollectionSource = 'create-form' | 'auto-deploy'

const keyCollectionMeta = (address: string) =>
  `kismetart:collection-meta:${address.toLowerCase()}`

export async function getTrackedCollections(): Promise<string[]> {
  try {
    const stored = (await redis.smembers(KEY)) as string[]
    const all = new Set([PLATFORM_COLLECTION, ...stored])
    return Array.from(all)
  } catch {
    return [PLATFORM_COLLECTION]
  }
}

/**
 * Filter the tracked set by discovery scope. `standalone` keeps the shared
 * platform contract (where one-off mints live) PLUS auto-deployed wrapper
 * collections — both are functionally individual mints. `collections` keeps
 * only collections explicitly registered via the Create Collection form.
 * `all` is the unfiltered list, used by surfaces that mix both kinds (the
 * roster tab, profile feeds, the airdrop picker).
 */
export type CollectionScope = 'standalone' | 'collections' | 'all'

export async function getTrackedCollectionsByScope(
  scope: CollectionScope = 'all',
): Promise<string[]> {
  if (scope === 'all') return getTrackedCollections()
  if (scope === 'collections') return getUserCollections()
  // standalone: tracked minus user-collections (= PLATFORM_COLLECTION +
  // every auto-deployed wrapper). Computing the difference here avoids
  // double-storing PLATFORM_COLLECTION in USER_KEY just to filter it back
  // out, and keeps a single source of truth for the user-collections set.
  const [all, userCreated] = await Promise.all([
    getTrackedCollections(),
    getUserCollections(),
  ])
  const userSet = new Set(userCreated.map((a) => a.toLowerCase()))
  return all.filter((a) => !userSet.has(a.toLowerCase()))
}

/** Collections explicitly created via the Create Collection form. Empty
 *  on Redis errors so a transient outage doesn't accidentally erase the
 *  Collections feed (the failure surfaces as an empty feed instead). */
export async function getUserCollections(): Promise<string[]> {
  try {
    return (await redis.smembers(USER_KEY)) as string[]
  } catch {
    return []
  }
}

export async function addTrackedCollection(
  address: string,
  meta?: Omit<CollectionMeta, 'address'>,
  source: CollectionSource = 'create-form',
): Promise<void> {
  try {
    const ops: Promise<unknown>[] = [redis.sadd(KEY, address)]
    // Auto-deployed wrappers are NOT collections in the curatorial sense —
    // they're individual mints whose contract happens to be unique. The
    // protocol creates them on first-mint when no collection is picked.
    // Skip USER_KEY for those so the Collections feed stays clean.
    if (source === 'create-form') {
      ops.push(redis.sadd(USER_KEY, address))
    }
    if (meta?.name) {
      const data: CollectionMeta = { ...meta, address: address.toLowerCase() }
      ops.push(redis.set(keyCollectionMeta(address), JSON.stringify(data)))
    }
    await Promise.all(ops)
  } catch (err) {
    // Surface in Vercel function logs instead of swallowing — if Upstash
    // is unreachable or misconfigured, a brand-new deploy silently won't
    // show up in any feed and the user gets a misleading green toast.
    console.error('[kv] addTrackedCollection failed', {
      address,
      hasName: !!meta?.name,
      source,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// Used by the collection page as a fallback when inprocess hasn't indexed
// a freshly-deployed collection yet. Returns null if Redis isn't configured
// or no metadata was stored at deploy time.
export async function getCollectionMeta(
  address: string
): Promise<CollectionMeta | null> {
  try {
    const raw = await redis.get<string | CollectionMeta | null>(
      keyCollectionMeta(address)
    )
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

// Used by the artist's profile page as a fallback when inprocess hasn't
// indexed a freshly-deployed collection yet. Walks USER_KEY (only
// explicitly-created collections) so auto-deployed mint wrappers stay out
// of the artist's "Collections" surface — they belong in their Mints feed.
export async function getCollectionsByArtist(
  artist: string
): Promise<CollectionMeta[]> {
  const wanted = artist.toLowerCase()
  const addresses = await getUserCollections()
  if (!addresses.length) return []
  const keys = addresses.map(keyCollectionMeta)
  try {
    const raws = await redis.mget<(string | CollectionMeta | null)[]>(...keys)
    const out: CollectionMeta[] = []
    for (const raw of raws) {
      if (!raw) continue
      const meta: CollectionMeta = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (meta.artist?.toLowerCase() === wanted) out.push(meta)
    }
    return out
  } catch {
    return []
  }
}

// Fetches a collection's image from inprocess as a fallback for KV entries
// that were registered before the cover-image flow shipped (or whose
// image upload happened after the KV write). Bounded 5min cache so a
// single search query doesn't fan out repeated upstream calls.
async function fetchInprocessCollectionImage(address: string): Promise<string | undefined> {
  try {
    const url = new URL(`${INPROCESS_API}/collection`)
    url.searchParams.set('collectionAddress', address)
    url.searchParams.set('chainId', '8453')
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return undefined
    const text = await res.text()
    if (!text) return undefined
    const data = JSON.parse(text) as { metadata?: { image?: string } }
    return typeof data?.metadata?.image === 'string' ? data.metadata.image : undefined
  } catch {
    return undefined
  }
}

export async function searchCollections(query: string): Promise<CollectionMeta[]> {
  // Search ranges over USER_KEY — auto-deployed wrappers (whose name is
  // just the moment title) shouldn't surface as collection search results.
  // Moment search has its own endpoint; this one is strictly for curated
  // collections.
  const addresses = await getUserCollections()
  if (!addresses.length) return []
  const keys = addresses.map(keyCollectionMeta)
  const raws = await redis.mget<(string | CollectionMeta | null)[]>(...keys)
  const q = query.toLowerCase()
  const results: CollectionMeta[] = []
  for (let i = 0; i < addresses.length; i++) {
    const raw = raws[i]
    if (!raw) continue // skip auto-tracked collections without an explicit name
    const address = addresses[i].toLowerCase()
    const meta: CollectionMeta = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (meta.name.toLowerCase().includes(q) || address.startsWith(q)) {
      results.push(meta)
      if (results.length >= 20) break
    }
  }
  // Backfill any matches missing a cover image from inprocess. Scoped to
  // the matched results so latency stays bounded; 5min upstream cache
  // (see fetchInprocessCollectionImage) keeps the cost flat across
  // repeated searches.
  return Promise.all(
    results.map(async (meta) => {
      if (meta.image) return meta
      const image = await fetchInprocessCollectionImage(meta.address)
      return image ? { ...meta, image } : meta
    }),
  )
}
