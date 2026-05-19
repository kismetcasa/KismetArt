import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from '@/lib/address'
import { getGateConfig, hasGateAccess } from '@/lib/gate'
import { PLATFORM_COLLECTION } from '@/lib/config'
import { checkRateLimit, getClientIp } from '@/lib/ratelimit'
import { errorResponse } from '@/lib/apiResponse'

// Public read of gate state for a given address. Lets the UI render an
// informed "Pass required" empty state and decide where to redirect the
// user without round-tripping a mutating call. Composes only data that's
// already public (gate config + on-chain ERC-1155 balances + the validity
// ledger), so no new exposure beyond what's discoverable via Basescan.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`gate:${ip}`, 60, 60)
  if (!allowed) return errorResponse(429, 'Too many requests')

  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') ?? undefined
  const targetParam = searchParams.get('target') ?? undefined
  const target = targetParam ?? PLATFORM_COLLECTION

  if (address && !isAddress(address)) {
    return errorResponse(400, 'Invalid address')
  }
  if (!isAddress(target)) {
    return errorResponse(400, 'Invalid target collection')
  }

  const config = await getGateConfig()
  const hasAccess = address ? await hasGateAccess(target, address) : !config.enabled
  return NextResponse.json({
    enabled: config.enabled,
    passCollection: config.passCollection,
    paused: config.paused,
    target: target.toLowerCase(),
    hasAccess,
  })
}
