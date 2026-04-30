import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTrackedCollections, addTrackedCollection } from '@/lib/kv'
import { checkRateLimit } from '@/lib/ratelimit'

export async function GET() {
  const collections = await getTrackedCollections()
  return NextResponse.json({ collections })
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const allowed = await checkRateLimit(`collections:${ip}`, 5, 60)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json() as {
    address: string
    name?: string
    image?: string
    description?: string
  }
  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  }
  await addTrackedCollection(body.address, {
    name: body.name ?? body.address,
    image: body.image,
    description: body.description,
  })
  return NextResponse.json({ ok: true })
}
