import { NextRequest, NextResponse } from 'next/server'
import { INPROCESS_API } from '@/lib/inprocess'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function POST(req: NextRequest) {
  const apiKey = process.env.INPROCESS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'INPROCESS_API_KEY not configured' }, { status: 500 })
  }

  const body = await req.json()

  const res = await fetch(`${INPROCESS_API}/moment/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  // Fire-and-forget: increment trending score and record collector
  if (res.ok) {
    const col = (body as { moment?: { collectionAddress?: string } }).moment?.collectionAddress?.toLowerCase()
    const tok = (body as { moment?: { tokenId?: string } }).moment?.tokenId
    const account = (body as { account?: string }).account?.toLowerCase()
    if (col && tok) {
      redis.zincrby('kismetart:trending', 1, `${col}:${tok}`).catch(() => {})
      if (account) {
        redis.zadd(`kismetart:collected:${account}`, { score: Date.now(), member: `${col}:${tok}` }).catch(() => {})
      }
    }
  }

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'upstream error', detail: text.slice(0, 200) }, { status: 502 })
  }
  return NextResponse.json(data, { status: res.status })
}
