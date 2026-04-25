import { NextRequest, NextResponse } from 'next/server'
import { getTrackedCollections } from '@/lib/kv'
import { INPROCESS_API } from '@/lib/inprocess'

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
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const creator = searchParams.get('creator')?.toLowerCase() ?? undefined

  const collections = await getTrackedCollections()

  // Fetch from all collections in parallel, grab enough to cover this page
  const fetchLimit = page * limit
  const results = await Promise.all(collections.map((c) => fetchCollection(c, fetchLimit)))

  // Merge, deduplicate by id, sort newest first
  const seen = new Set<string>()
  const merged = results
    .flat()
    .filter((m: unknown) => {
      const moment = m as { id?: string }
      const key = moment.id ?? JSON.stringify(m)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter((m: unknown) => {
      if (!creator) return true
      const moment = m as { creator?: { address?: string } }
      return moment.creator?.address?.toLowerCase() === creator
    })
    .sort((a: unknown, b: unknown) => {
      const ma = a as { created_at: string }
      const mb = b as { created_at: string }
      return new Date(mb.created_at).getTime() - new Date(ma.created_at).getTime()
    })

  const start = (page - 1) * limit
  const moments = merged.slice(start, start + limit)
  const total_pages = Math.max(1, Math.ceil(merged.length / limit))

  return NextResponse.json({
    status: 'success',
    moments,
    pagination: { page, limit, total_pages },
  })
}
