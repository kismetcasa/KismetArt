import { NextRequest, NextResponse } from 'next/server'
import { isAddress, isValidTokenId } from '@/lib/address'
import { getStoredSplitsBatch } from '@/lib/splits'

// Cap to keep a single Upstash mget bounded. A collection page only
// shows a paginated slice of moments at a time, well below this.
const MAX_TOKEN_IDS = 200

// Batch lookup of stored split recipients across one collection's moments.
// The CollectionView component fans the moments it loads through this
// route in a single fetch so we render the splits panel from real
// recipient wallets (with profiles) instead of the on-chain admin list
// (which contains the deployed 0xSplits contract and the operator smart
// wallet — neither of which corresponds to a user profile).
//
// Response: { moments: { [tokenId]: { hasSplits, recipients } } }
//   - omitted entries (no value in KV) get `{ hasSplits: false, recipients: [] }`
//   - legacy `'1'` flag entries get `{ hasSplits: true, recipients: [] }`
//   - persisted entries get `{ hasSplits: true, recipients: [{ address, percentAllocation }, ...] }`
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('tokenIds')
  if (!raw) return NextResponse.json({ moments: {} })

  const tokenIds = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => isValidTokenId(s)),
    ),
  )
  if (tokenIds.length === 0) return NextResponse.json({ moments: {} })
  if (tokenIds.length > MAX_TOKEN_IDS) {
    return NextResponse.json(
      { error: `tokenIds exceeds max of ${MAX_TOKEN_IDS}` },
      { status: 400 },
    )
  }

  const moments = await getStoredSplitsBatch(address, tokenIds).catch(() => ({}))
  return NextResponse.json({ moments })
}
