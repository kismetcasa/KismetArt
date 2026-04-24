import { NextRequest, NextResponse } from 'next/server'
import { getTrackedCollections, addTrackedCollection } from '@/lib/kv'

export async function GET() {
  const collections = await getTrackedCollections()
  return NextResponse.json({ collections })
}

export async function POST(req: NextRequest) {
  const { address } = await req.json()
  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'address required' }, { status: 400 })
  }
  await addTrackedCollection(address)
  return NextResponse.json({ ok: true })
}
