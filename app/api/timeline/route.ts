import { NextRequest, NextResponse } from 'next/server'
import { getTrackedCollections } from '@/lib/kv'
import { INPROCESS_API } from '@/lib/inprocess'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

async function fetchCollection(collection: string, limit: number): Promise<unknown[]> {
  const url = new URL(`${INPROCESS_API}/timeline`)
  url.searchParams.set('collection', collection)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('chain_id', '8453')
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, next: { revalidate: 30 } })
    const text = await res.text()
    const data = JSON.parse(text)
    return Array.isArray(data.moments) ? data.moments : []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1') || 1
  const limit = parseInt(searchParams.get('limit') ?? '20') || 20
  const creator = searchParams.get('creator')?.toLowerCase() ?? undefined
  const sort = searchParams.get('sort') // 'trending' | null
  // Comma-separated addresses to prioritise in the feed (following mode)
  const followingParam = searchParams.get('following')
  const followingSet = followingParam
    ? new Set(followingParam.split(',').map((a) => a.toLowerCase()).filter(Boolean))
    : null

  const collections = await getTrackedCollections()

  // Trending needs a larger sample so we can sort across all known mints
  const fetchLimit = sort === 'trending' ? Math.max(page * limit, 100) : page * limit
  const results = await Promise.all(collections.map((c) => fetchCollection(c, fetchLimit)))

  // Merge and deduplicate
  const seen = new Set<string>()
  let merged = results.flat().filter((m: unknown) => {
    const moment = m as { id?: string }
    const key = moment.id ?? JSON.stringify(m)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Creator filter (Featured / Profile feeds)
  if (creator) {
    merged = merged.filter((m: unknown) => {
      const moment = m as { creator?: { address?: string } }
      return moment.creator?.address?.toLowerCase() === creator
    })
  }

  if (sort === 'trending') {
    // Fetch all trending scores from Redis in one call (flat alternating member/score array)
    const raw = (await redis.zrange('kismetart:trending', 0, -1, {
      rev: true,
      withScores: true,
    })) as (string | number)[]

    const scoreMap = new Map<string, number>()
    for (let i = 0; i + 1 < raw.length; i += 2) {
      scoreMap.set(String(raw[i]), Number(raw[i + 1]))
    }

    merged = merged.sort((a: unknown, b: unknown) => {
      const ma = a as { address?: string; token_id?: string; created_at: string }
      const mb = b as { address?: string; token_id?: string; created_at: string }
      const scoreA = scoreMap.get(`${ma.address?.toLowerCase()}:${ma.token_id}`) ?? 0
      const scoreB = scoreMap.get(`${mb.address?.toLowerCase()}:${mb.token_id}`) ?? 0
      if (scoreB !== scoreA) return scoreB - scoreA
      return new Date(mb.created_at).getTime() - new Date(ma.created_at).getTime()
    })
  } else {
    // Default: newest first
    merged = merged.sort((a: unknown, b: unknown) => {
      const ma = a as { created_at: string }
      const mb = b as { created_at: string }
      return new Date(mb.created_at).getTime() - new Date(ma.created_at).getTime()
    })
  }

  // Following priority: bubble followed creators to the top, preserve internal order
  if (followingSet && followingSet.size > 0) {
    const followed = merged.filter((m: unknown) => {
      const moment = m as { creator?: { address?: string } }
      return followingSet.has(moment.creator?.address?.toLowerCase() ?? '')
    })
    const rest = merged.filter((m: unknown) => {
      const moment = m as { creator?: { address?: string } }
      return !followingSet.has(moment.creator?.address?.toLowerCase() ?? '')
    })
    merged = [...followed, ...rest]
  }

  const start = (page - 1) * limit
  const moments = merged.slice(start, start + limit)
  const total_pages = Math.max(1, Math.ceil(merged.length / limit))

  return NextResponse.json({
    status: 'success',
    moments,
    pagination: { page, limit, total_pages },
  })
}
