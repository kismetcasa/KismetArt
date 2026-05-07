import { type Address } from 'viem'
import { isAddress } from '@/lib/address'
import { PLATFORM_COLLECTION } from '@/lib/config'
import { hasAdminBit, readPermissions } from '@/lib/permissions'
import { serverBaseClient } from '@/lib/rpc'

/**
 * Startup invariant for production: if NEXT_PUBLIC_PLATFORM_COLLECTION is
 * set to a contract whose ADMIN was never granted to OPERATOR_SMART_WALLET,
 * every Kismet-Casa mint via /api/moment/create reverts upstream and the
 * user sees a non-actionable "Authorize required" they can't fix (the
 * banner only appears for collection creators, and the operator EOA isn't
 * always the same wallet that's signed in to the UI).
 *
 * We caught this exact misconfig the hard way — it's the bug that ate ~48
 * hours of debugging. Fail at boot instead of at first mint so a regression
 * is impossible to ship without immediate notice.
 *
 * Skipped (no-op) when:
 *   - OPERATOR_SMART_WALLET is unset (dev / fork / local — no enforcement)
 *   - PLATFORM_COLLECTION env is unset or matches the hardcoded fallback
 *     (no operator workflow yet — nothing to enforce)
 *   - The configured operator address fails isAddress validation (treated
 *     as a typo; logged loudly but not fatal — fixing a fatal-on-boot
 *     state requires an env edit + redeploy which is harder under
 *     pressure than fixing a logged error)
 *
 * On failure: throws. instrumentation.ts surfaces this as a startup error
 * which Next.js / Vercel renders prominently. Refusing to boot is correct
 * here — a half-broken Kismet that silently rejects every mint is worse
 * than a Kismet that won't start.
 */
export async function assertPlatformCollectionAuthorized(): Promise<void> {
  const operator = process.env.OPERATOR_SMART_WALLET
  if (!operator) {
    // Intentional opt-out — quiet so dev environments don't get a noisy
    // log every cold start. Production deploys should set this; that's
    // documented in .env.example.
    return
  }
  if (!isAddress(operator)) {
    console.error(
      `[healthcheck] OPERATOR_SMART_WALLET=${operator} is not a valid address — skipping check`,
    )
    return
  }
  if (!PLATFORM_COLLECTION || !isAddress(PLATFORM_COLLECTION)) {
    console.error(
      `[healthcheck] PLATFORM_COLLECTION=${PLATFORM_COLLECTION} is not a valid address — skipping check`,
    )
    return
  }

  const client = serverBaseClient()
  let perms: bigint
  try {
    perms = await readPermissions(
      client,
      PLATFORM_COLLECTION as Address,
      0n,
      operator as Address,
    )
  } catch (err) {
    // RPC failure ≠ permission failure. Log and continue rather than
    // refuse to boot for a transient network issue (paid RPC outage,
    // DNS hiccup). The check will run again on next cold start.
    console.error(
      `[healthcheck] could not read permissions on ${PLATFORM_COLLECTION} — skipping`,
      err instanceof Error ? err.message : String(err),
    )
    return
  }
  if (!hasAdminBit(perms)) {
    throw new Error(
      `STARTUP HEALTHCHECK FAILED: OPERATOR_SMART_WALLET=${operator} ` +
        `does not have ADMIN (bit 2) on PLATFORM_COLLECTION=${PLATFORM_COLLECTION}. ` +
        `permissions(0, ${operator}) = ${perms}. ` +
        `Kismet Casa mints will revert. Either grant ADMIN on chain ` +
        `(addPermission(0, ${operator}, 2) from an admin EOA) or update ` +
        `NEXT_PUBLIC_PLATFORM_COLLECTION to a collection where this wallet ` +
        `is admin. Refusing to start.`,
    )
  }
  console.log(
    `[healthcheck] OK: OPERATOR_SMART_WALLET has ADMIN on PLATFORM_COLLECTION (perms=${perms})`,
  )
}
