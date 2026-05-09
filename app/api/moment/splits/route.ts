import { NextRequest, NextResponse } from 'next/server'
import { isAddress, isValidTokenId } from '@/lib/address'
import { getStoredSplits } from '@/lib/splits'

// Returns the splits state for a single moment.
//   { hasSplits, recipients }
// `hasSplits` gates the creator-only "distribute" UI in useMomentSplits.
// `recipients` is non-empty only for mints persisted with the recipient
// list (post-recipient-storage) — legacy mints written as the literal
// `'1'` flag still report `hasSplits: true` so the distribute flow keeps
// working, but `recipients` will be empty until backfilled.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const collectionAddress = searchParams.get('collectionAddress')
  const tokenId = searchParams.get('tokenId')

  if (!collectionAddress || !tokenId) {
    return NextResponse.json({ error: 'collectionAddress and tokenId required' }, { status: 400 })
  }
  if (!isAddress(collectionAddress)) {
    return NextResponse.json({ error: 'Invalid collectionAddress' }, { status: 400 })
  }
  if (!isValidTokenId(tokenId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }

  const stored = await getStoredSplits(collectionAddress, tokenId).catch(() => ({
    hasSplits: false,
    recipients: [],
  }))
  return NextResponse.json(stored)
}
