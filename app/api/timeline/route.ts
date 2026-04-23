import { NextRequest, NextResponse } from 'next/server'
import { PLATFORM_COLLECTION } from '@/lib/config'

const INPROCESS_API = 'https://api.inprocess.world/api'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page') ?? '1'
  const limit = searchParams.get('limit') ?? '20'

  const url = new URL(`${INPROCESS_API}/timeline`)
  if (PLATFORM_COLLECTION) url.searchParams.set('collection', PLATFORM_COLLECTION)
  url.searchParams.set('page', page)
  url.searchParams.set('limit', limit)
  url.searchParams.set('chain_id', '8453')

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 30 },
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
