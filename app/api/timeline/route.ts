import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://inprocess.world/api'
// Locked server-side — clients cannot override which collection is shown.
const PLATFORM_COLLECTION = process.env.NEXT_PUBLIC_PLATFORM_COLLECTION

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page') ?? '1'
  const limit = searchParams.get('limit') ?? '20'

  const url = new URL(`${INPROCESS_API}/timeline`)
  if (PLATFORM_COLLECTION) url.searchParams.set('collection', PLATFORM_COLLECTION)
  url.searchParams.set('page', page)
  url.searchParams.set('limit', limit)
  url.searchParams.set('chain_id', '8453')

  const res = await fetch(url.toString(), { next: { revalidate: 30 } })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
