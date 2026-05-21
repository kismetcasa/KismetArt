import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from '@/lib/address'
import { getGateConfig } from '@/lib/gate'
import { getValidBalance } from '@/lib/pass-validity'
import { checkRateLimit, getClientIp } from '@/lib/ratelimit'
import { errorResponse } from '@/lib/apiResponse'

/**
 * Public read of an address's Pass-collection validity. UI surfaces use
 * this to show a "Valid Pass" badge on the holder's profile cards and on
 * marketplace listing cards (so buyers can see whether a seller's Pass
 * carries validity before purchasing).
 *
 * Returns the configured `passCollection` so callers can match it against
 * a moment's collection address to decide whether the validity check is
 * even applicable (non-Pass moments have no validity to display).
 *
 * Data exposure: every value here is derivable from on-chain Transfer
 * history plus our flagged-tx Redis keys (which any indexer with our
 * source code could reconstruct). Surfacing it directly is a UX win, not
 * a new information leak. Rate-limited to prevent enumeration probing.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`pass-validity:${ip}`, 60, 60)
  if (!allowed) return errorResponse(429, 'Too many requests')

  const address = req.nextUrl.searchParams.get('address')?.toLowerCase()
  if (!address || !isAddress(address)) {
    return errorResponse(400, 'Invalid address')
  }

  const config = await getGateConfig()
  if (!config.passCollection) {
    // Gate not configured — validity is meaningless. Return the shape so
    // the client doesn't need to special-case absence, just sees zero.
    return NextResponse.json({
      passCollection: null,
      validBalance: 0,
    })
  }

  const validBalance = await getValidBalance(config.passCollection, address)
  return NextResponse.json({
    passCollection: config.passCollection,
    validBalance,
  })
}
