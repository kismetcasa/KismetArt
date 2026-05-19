import { redis } from './redis'
import { ADMIN_ADDRESS } from './config'

const KEY = 'kismetart:blacklist'

/** Returns true if the address is on the platform-wide blacklist. The admin
 *  address is hardcoded-exempt so an accidental self-blacklist can't lock
 *  the admin out of their own dashboard. Fails open on Redis error so a
 *  transient outage can't accidentally block every user — security is at
 *  the action layer (gate, on-chain ownership), this layer is policy.
 *
 *  Coexists with main's hide system (lib/hiddenCollections, lib/hiddenMoments):
 *  hide is creator-controlled per-content, blacklist is admin-controlled
 *  per-address. Both filters compose where applicable. */
export async function isBlacklisted(address: string | null | undefined): Promise<boolean> {
  if (!address) return false
  const lower = address.toLowerCase()
  if (ADMIN_ADDRESS && lower === ADMIN_ADDRESS) return false
  try {
    const v = await redis.sismember(KEY, lower)
    return !!v
  } catch {
    return false
  }
}

/** Batch check — returns the subset of `addresses` that are blacklisted.
 *  Useful for filtering arrays of moments / listings without N round-trips. */
export async function getBlacklistedSet(
  addresses: (string | null | undefined)[],
): Promise<Set<string>> {
  const lowered = addresses
    .filter((a): a is string => typeof a === 'string' && a.length > 0)
    .map((a) => a.toLowerCase())
  if (lowered.length === 0) return new Set()
  try {
    // Read the whole blacklist once and intersect — avoids one round-trip
    // per address. Blacklist is small (admin-curated); fetching it whole
    // is cheap.
    const all = (await redis.smembers(KEY)) as string[]
    const set = new Set(all)
    return new Set(lowered.filter((a) => set.has(a) && a !== ADMIN_ADDRESS))
  } catch {
    return new Set()
  }
}

export async function addToBlacklist(address: string): Promise<void> {
  const lower = address.toLowerCase()
  if (ADMIN_ADDRESS && lower === ADMIN_ADDRESS) {
    throw new Error('Cannot blacklist the admin address')
  }
  await redis.sadd(KEY, lower)
}

export async function removeFromBlacklist(address: string): Promise<void> {
  await redis.srem(KEY, address.toLowerCase())
}

export async function listBlacklist(): Promise<string[]> {
  try {
    const addrs = (await redis.smembers(KEY)) as string[]
    return Array.isArray(addrs) ? addrs.sort() : []
  } catch {
    return []
  }
}
