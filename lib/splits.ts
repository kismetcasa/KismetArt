import { redis } from './redis'
import { isAddress } from './address'

export interface SplitRecipient {
  address: string
  percentAllocation: number
}

export interface StoredSplits {
  recipients: SplitRecipient[]
}

export interface StoredSplitsResult {
  hasSplits: boolean
  recipients: SplitRecipient[]
}

const splitsKey = (collection: string, tokenId: string) =>
  `kismetart:splits:${collection.toLowerCase()}:${tokenId}`

// Persists the actual split recipients in KV under the same key the
// distribute flow uses for its truthy `hasSplits` gate. Distribute reads
// the value via `redis.get` and only checks for falsiness, so a JSON
// string remains compatible with the legacy `'1'` flag.
export async function setStoredSplits(
  collection: string,
  tokenId: string,
  recipients: SplitRecipient[],
): Promise<void> {
  const payload: StoredSplits = {
    recipients: recipients.map((r) => ({
      address: r.address.toLowerCase(),
      percentAllocation: r.percentAllocation,
    })),
  }
  await redis.set(splitsKey(collection, tokenId), JSON.stringify(payload))
}

// Reads a single token's stored splits. The legacy `'1'` value (written
// by mints predating recipient persistence) maps to `hasSplits: true`
// with an empty recipients list, so the distribute flow's gate keeps
// working for old mints while the UI hides them from the splits panel.
export async function getStoredSplits(
  collection: string,
  tokenId: string,
): Promise<StoredSplitsResult> {
  const raw = await redis.get<unknown>(splitsKey(collection, tokenId))
  return decodeStoredSplits(raw)
}

// Batched reader for the collection page. Fans out to a single `mget`
// so a collection with N moments costs one Upstash round-trip instead
// of N. Returns a tokenId -> result map keyed by the input order.
export async function getStoredSplitsBatch(
  collection: string,
  tokenIds: string[],
): Promise<Record<string, StoredSplitsResult>> {
  const out: Record<string, StoredSplitsResult> = {}
  if (tokenIds.length === 0) return out
  const keys = tokenIds.map((t) => splitsKey(collection, t))
  const raws = (await redis.mget<unknown[]>(...keys)) ?? []
  tokenIds.forEach((tokenId, idx) => {
    out[tokenId] = decodeStoredSplits(raws[idx])
  })
  return out
}

function decodeStoredSplits(raw: unknown): StoredSplitsResult {
  if (raw === null || raw === undefined) {
    return { hasSplits: false, recipients: [] }
  }
  if (typeof raw === 'string') {
    if (raw === '1') return { hasSplits: true, recipients: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSplits>
      return { hasSplits: true, recipients: validateRecipients(parsed?.recipients) }
    } catch {
      return { hasSplits: true, recipients: [] }
    }
  }
  if (typeof raw === 'object') {
    const obj = raw as Partial<StoredSplits>
    return { hasSplits: true, recipients: validateRecipients(obj?.recipients) }
  }
  return { hasSplits: false, recipients: [] }
}

function validateRecipients(input: unknown): SplitRecipient[] {
  if (!Array.isArray(input)) return []
  const out: SplitRecipient[] = []
  for (const e of input) {
    if (!e || typeof e !== 'object') continue
    const obj = e as { address?: unknown; percentAllocation?: unknown }
    if (typeof obj.address !== 'string' || !isAddress(obj.address)) continue
    if (
      typeof obj.percentAllocation !== 'number' ||
      !Number.isFinite(obj.percentAllocation)
    ) {
      continue
    }
    out.push({
      address: obj.address.toLowerCase(),
      percentAllocation: obj.percentAllocation,
    })
  }
  return out
}
