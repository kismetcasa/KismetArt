import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { createListing, getListings, getListingForToken } from '@/lib/listings'
import type { SerializedOrderComponents } from '@/lib/seaport'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '18')))
  const collection = searchParams.get('collection') ?? undefined
  const tokenId = searchParams.get('tokenId') ?? undefined

  // Single-token lookup
  if (collection && tokenId) {
    const listing = await getListingForToken(collection, tokenId)
    return NextResponse.json({ listing: listing ?? null })
  }

  const { listings, total } = await getListings({ page, limit, collection })
  return NextResponse.json({
    listings,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      collectionAddress: string
      tokenId: string
      seller: string
      price: string
      sellerProceeds: string
      royaltyReceiver: string
      royaltyAmount: string
      orderComponents: SerializedOrderComponents
      signature: string
      expiresAt: number
      name?: string
      image?: string
      creatorAddress?: string
    }

    const {
      collectionAddress, tokenId, seller, price,
      sellerProceeds, royaltyReceiver, royaltyAmount,
      orderComponents, signature, expiresAt,
    } = body

    if (!isAddress(collectionAddress)) {
      return NextResponse.json({ error: 'Invalid collectionAddress' }, { status: 400 })
    }
    if (!tokenId || !seller || !price || !signature || !orderComponents) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (BigInt(price) <= 0n) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 })
    }
    if (orderComponents.offerer.toLowerCase() !== seller.toLowerCase()) {
      return NextResponse.json({ error: 'Seller must match order offerer' }, { status: 400 })
    }

    const listing = await createListing({
      collectionAddress,
      tokenId,
      seller,
      price,
      sellerProceeds,
      royaltyReceiver,
      royaltyAmount,
      orderComponents,
      signature,
      expiresAt,
      name: body.name,
      image: body.image,
      creatorAddress: body.creatorAddress,
    })

    return NextResponse.json({ listing }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create listing'
    const status = message.includes('already exists') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
