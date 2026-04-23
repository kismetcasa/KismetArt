import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://www.inprocess.world/api'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const collectionAddress = searchParams.get('collectionAddress')
  const tokenId = searchParams.get('tokenId')
  const chainId = searchParams.get('chainId') ?? '8453'

  if (!collectionAddress || !tokenId) {
    return NextResponse.json({ error: 'collectionAddress and tokenId are required' }, { status: 400 })
  }

  const url = new URL(`${INPROCESS_API}/moment`)
  url.searchParams.set('collectionAddress', collectionAddress)
  url.searchParams.set('tokenId', tokenId)
  url.searchParams.set('chain_id', chainId)

  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
