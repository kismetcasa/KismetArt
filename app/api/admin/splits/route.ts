import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { isAddress, isValidTokenId } from '@/lib/address'
import { ADMIN_ADDRESS } from '@/lib/config'
import { setStoredSplits, type SplitRecipient } from '@/lib/splits'

const SESSION_TTL = 4 * 60 * 60 * 1000
const MAX_RECIPIENTS = 50

interface BackfillBody {
  signature?: string
  timestamp?: number
  collectionAddress?: string
  tokenId?: string
  recipients?: { address?: unknown; percentAllocation?: unknown }[]
}

/**
 * Admin-gated backfill for legacy moments whose splits were minted before
 * the recipient list was persisted in KV (the old `'1'` flag).
 *
 * The mint flow itself records recipients automatically via
 * `setStoredSplits` in `lib/mint-proxy.ts` — this route only exists for
 * curators to repair pre-existing collections so their splits panel
 * stops linking to dead profile pages (the deployed 0xSplits contract
 * or the operator smart wallet).
 *
 * Auth mirrors `/api/admin/hide`: a 4-hour signed session message from
 * `ADMIN_ADDRESS`. Body is the same shape the mint route accepts (the
 * recipient list of `{ address, percentAllocation }` summing to 100).
 */
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

  const { collectionAddress, tokenId, recipients } = body
  if (!collectionAddress || !isAddress(collectionAddress)) {
    return NextResponse.json({ error: 'Invalid collectionAddress' }, { status: 400 })
  }
  if (!isValidTokenId(tokenId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }
  if (!Array.isArray(recipients) || recipients.length < 2) {
    return NextResponse.json({ error: 'recipients must include at least 2 entries' }, { status: 400 })
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `recipients cannot exceed ${MAX_RECIPIENTS}` },
      { status: 400 },
    )
  }

  const seen = new Set<string>()
  const normalized: SplitRecipient[] = []
  let sum = 0
  for (const e of recipients) {
    if (!e || typeof e !== 'object') {
      return NextResponse.json({ error: 'invalid recipient shape' }, { status: 400 })
    }
    if (typeof e.address !== 'string' || !isAddress(e.address)) {
      return NextResponse.json({ error: 'invalid recipient address' }, { status: 400 })
    }
    if (
      typeof e.percentAllocation !== 'number' ||
      !Number.isFinite(e.percentAllocation) ||
      e.percentAllocation <= 0 ||
      e.percentAllocation > 100
    ) {
      return NextResponse.json({ error: 'percentAllocation must be a number between 0 and 100' }, { status: 400 })
    }
    const lower = e.address.toLowerCase()
    if (seen.has(lower)) {
      return NextResponse.json({ error: `duplicate recipient ${e.address}` }, { status: 400 })
    }
    seen.add(lower)
    sum += e.percentAllocation
    normalized.push({ address: lower, percentAllocation: e.percentAllocation })
  }
  // Loose tolerance on the sum since admins may backfill from off-chain
  // records with rounding noise; on-chain SplitMain enforces strict
  // integer summing at mint time so the displayed numbers always match
  // the deployed contract for new mints.
  if (Math.round(sum) !== 100) {
    return NextResponse.json(
      { error: `recipients must sum to 100% (got ${sum})` },
      { status: 400 },
    )
  }

  await setStoredSplits(collectionAddress, tokenId, normalized)
  return NextResponse.json({ ok: true, recipients: normalized })
}
