import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://inprocess.world/api'

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
  url.searchParams.set('chainId', chainId)

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 60 },
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'upstream error', status: res.status }, { status: 502 })
  }
  return NextResponse.json(data, { status: res.status })
}
