import { NextRequest, NextResponse } from 'next/server'
import { isAddress, isValidTokenId } from '@/lib/address'
import { verifyAdminSession } from '@/lib/curator'
import { hideCollection, unhideCollection } from '@/lib/hiddenCollections'
import { hideMoment, unhideMoment } from '@/lib/hiddenMoments'

interface HideBody {
  type?: 'moment' | 'collection'
  address?: string
  tokenId?: string
  hidden?: boolean
}

/**
 * Admin-gated visibility toggle for any moment or collection. The user-
 * facing /api/moment/hide and /api/collection/hide gate on creator /
 * on-chain admin respectively; this route bypasses both for platform
 * moderation. Writes to the same Redis sets (hiddenMoments / hiddenCollections),
 * so feed filtering picks up the change immediately with no extra wiring.
 * Auth via HttpOnly session cookie set by /api/auth/login.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdminSession()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as HideBody | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { type, address, tokenId, hidden } = body
  if (type !== 'moment' && type !== 'collection') {
    return NextResponse.json({ error: 'type must be "moment" or "collection"' }, { status: 400 })
  }
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  if (typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
  }

  if (type === 'moment') {
    if (!isValidTokenId(tokenId)) {
      return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
    }
    if (hidden) await hideMoment(address, tokenId)
    else await unhideMoment(address, tokenId)
  } else {
    if (hidden) await hideCollection(address)
    else await unhideCollection(address)
  }

  return NextResponse.json({ ok: true, hidden })
}
