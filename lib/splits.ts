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
