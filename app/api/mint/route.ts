import { NextRequest, NextResponse } from 'next/server'
import { INPROCESS_API } from '@/lib/inprocess'
import { trackWallet } from '@/lib/profile'
import { checkRateLimit } from '@/lib/ratelimit'
import { redis } from '@/lib/redis'

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const allowed = await checkRateLimit(`mint:${ip}`, 10, 60)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json()
  if (body?.account) void trackWallet(body.account)

  if (body?.maxSupply !== undefined) {
    const ms = Number(body.maxSupply)
    if (!Number.isInteger(ms) || ms < 1) {
      return NextResponse.json({ error: 'maxSupply must be a positive integer' }, { status: 400 })
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = process.env.INPROCESS_API_KEY
  if (apiKey) headers['x-api-key'] = apiKey

  const res = await fetch(`${INPROCESS_API}/moment/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'upstream error', status: res.status, detail: text.slice(0, 200) }, { status: 502 })
  }

  // Record that this token was minted with splits so the detail page can show distribute
  if (res.ok && Array.isArray(body?.splits) && body.splits.length >= 2) {
    const r = data as { contractAddress?: string; tokenId?: string }
    if (r.contractAddress && r.tokenId) {
      void redis.set(
        `kismetart:splits:${r.contractAddress.toLowerCase()}:${r.tokenId}`,
        '1'
      ).catch(() => {})
    }
  }

  return NextResponse.json(data, { status: res.status })
}
