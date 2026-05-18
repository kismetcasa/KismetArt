import {
  getFarcasterProfileByAddress,
  getVerifiedAddressesByFid,
} from './farcasterProfile'

/**
 * Expand an Ethereum address into the set of all addresses controlled by
 * the same Farcaster identity.
 *
 *   - Non-FC address          → `[input]`
 *   - FC-verified address     → `[input, ...siblings]` (all verified
 *                                addresses of the same FID, lowercased,
 *                                deduped, input always first)
 *
 * Used by activity feeds (`/api/timeline`'s creator/collector filters)
 * so a user's mints, collects, etc. surface on the profile page of any
 * of their verified wallets — not just the one the activity was signed
 * from. This is the server-side "address union" that makes a Farcaster
 * user feel like a single Kismet identity regardless of which of their
 * wallets they happen to use for a given on-chain action.
 *
 * Both lookups are Redis-cached (see lib/farcasterProfile.ts) so this
 * runs ≈1 cache read for an unfound FC user, ≈2 for an FC user. Cold
 * cache cost is one FC API call each.
 */
export async function expandToFidSiblings(address: string): Promise<string[]> {
  const lower = address.toLowerCase()
  const profile = await getFarcasterProfileByAddress(lower)
  if (!profile) return [lower]

  const siblings = await getVerifiedAddressesByFid(profile.fid)
  // Set preserves uniqueness; spreading [lower, ...siblings] keeps the
  // original address at the front for any caller that cares about
  // ordering (e.g. logs that surface the "queried" address first).
  return Array.from(new Set<string>([lower, ...siblings]))
}
