import { getTrackedCollections } from './kv'
import { INPROCESS_API, resolveUri, type Moment } from './inprocess'

export interface MomentSearchResult {
  id: string
  address: string
  tokenId: string
  name: string
  image?: string
  creatorAddress?: string
}

async function fetchCollectionMoments(collection: string): Promise<Moment[]> {
  try {
    const url = new URL(`${INPROCESS_API}/timeline`)
    url.searchParams.set('collection', collection)
    url.searchParams.set('limit', '50')
    url.searchParams.set('chain_id', '8453')
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    })
    const data = await res.json()
    return Array.isArray(data.moments) ? data.moments : []
  } catch {
    return []
  }
}

export async function searchMoments(query: string): Promise<MomentSearchResult[]> {
  const collections = await getTrackedCollections()
  const all = await Promise.all(collections.map(fetchCollectionMoments))
  const q = query.toLowerCase()
  const seen = new Set<string>()
  const results: MomentSearchResult[] = []
  for (const moment of all.flat()) {
    if (results.length >= 5) break
    const key = `${moment.address}:${moment.token_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = (moment.metadata?.name ?? '').toLowerCase()
    const desc = (moment.metadata?.description ?? '').toLowerCase()
    const creator = (moment.creator?.address ?? '').toLowerCase()
    const creatorName = (moment.creator?.username ?? '').toLowerCase()
    if (name.includes(q) || desc.includes(q) || creator.startsWith(q) || creatorName.includes(q)) {
      results.push({
        id: moment.id ?? key,
        address: moment.address,
        tokenId: moment.token_id,
        name: moment.metadata?.name ?? `#${moment.token_id}`,
        image: moment.metadata?.image ? resolveUri(moment.metadata.image) : undefined,
        creatorAddress: moment.creator?.address,
      })
    }
  }
  return results
}
