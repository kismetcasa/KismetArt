import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from '@/lib/address'
import { getQuotaStatus } from '@/lib/airdrop-quota'
import { checkRateLimit, getClientIp } from '@/lib/ratelimit'
import { errorResponse } from '@/lib/apiResponse'

/**
 * Pre-flight quota probe for the airdrop UI. Returns current limits +
 * how much the artist has used today / this week + how much remains.
 * Read-only; safe to poll on every recipient-list change.
 *
 * Soft-enforcement: this probe is for UX so the submit button can be
 * disabled before the wallet popup. The actual ledger debit happens
 * atomically in /api/airdrop/notify via consumeQuota — both paths go
 * through the same Lua script in lib/airdrop-quota.ts so the numbers
 * cannot drift.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`airdrop-quota:${ip}`, 60, 60)
  if (!allowed) return errorResponse(429, 'Too many requests')

  const artist = req.nextUrl.searchParams.get('artist')?.toLowerCase()
  if (!artist || !isAddress(artist)) {
    return errorResponse(400, 'Invalid artist')
  }

  const status = await getQuotaStatus(artist)
  return NextResponse.json(status)
}
