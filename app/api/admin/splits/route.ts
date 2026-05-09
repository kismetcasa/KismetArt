import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { isAddress, isValidTokenId } from '@/lib/address'
import { ADMIN_ADDRESS } from '@/lib/config'
import { setStoredSplits, validateSplitsArray } from '@/lib/splits'

const SESSION_TTL = 4 * 60 * 60 * 1000

interface BackfillBody {
  signature?: string
  timestamp?: number
  collectionAddress?: string
  tokenId?: string
  recipients?: unknown
}

// Curator-only backfill for legacy moments whose splits were minted
// before recipient persistence shipped (the old `'1'` flag in KV).
// Auth mirrors /api/admin/hide; payload mirrors what the mint route
// accepts. Allocations may be fractional here since admins import
// from off-chain records — Math.round absorbs the drift.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as BackfillBody | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (!ADMIN_ADDRESS) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 403 })
  }
  if (!body.signature || body.timestamp == null) {
    return NextResponse.json({ error: 'signature and timestamp required' }, { status: 400 })
  }
  if (Date.now() - body.timestamp > SESSION_TTL) {
    return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 })
  }

  const message = `Kismet Art admin session\nAddress: ${ADMIN_ADDRESS}\nTimestamp: ${body.timestamp}`
  const verified = await verifyMessage({
    address: ADMIN_ADDRESS as `0x${string}`,
    message,
    signature: body.signature as `0x${string}`,
  }).catch(() => false)
  if (!verified) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
  }

  const { collectionAddress, tokenId } = body
  if (!collectionAddress || !isAddress(collectionAddress)) {
    return NextResponse.json({ error: 'Invalid collectionAddress' }, { status: 400 })
  }
  if (!isValidTokenId(tokenId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }

  const result = validateSplitsArray(body.recipients, { requireIntegerPercents: false })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  await setStoredSplits(collectionAddress, tokenId, result.splits)
  return NextResponse.json({ ok: true, recipients: result.splits })
}
