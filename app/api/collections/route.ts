import { NextRequest, NextResponse } from 'next/server'
import { getTrackedCollections, addTrackedCollection } from '@/lib/kv'

export async function GET() {
  const collections = await getTrackedCollections()
  return NextResponse.json({ collections })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    address: string
    name?: string
    image?: string
    description?: string
  }
  if (!body.address || typeof body.address !== 'string') {
    return NextResponse.json({ error: 'address required' }, { status: 400 })
  }
  await addTrackedCollection(body.address, {
    name: body.name ?? body.address,
    image: body.image,
    description: body.description,
  })
  return NextResponse.json({ ok: true })
}
