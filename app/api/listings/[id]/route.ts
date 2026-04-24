import { NextRequest, NextResponse } from 'next/server'
import { getListing, updateListingStatus } from '@/lib/listings'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as { status: string }

  if (body.status !== 'filled' && body.status !== 'cancelled') {
    return NextResponse.json({ error: 'status must be filled or cancelled' }, { status: 400 })
  }

  const listing = await getListing(id)
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  if (listing.status !== 'active') {
    return NextResponse.json({ error: 'Listing is already inactive' }, { status: 409 })
  }

  await updateListingStatus(id, body.status as 'filled' | 'cancelled')
  return NextResponse.json({ ok: true })
}
