import { NextResponse } from 'next/server'
import { redis, FEATURED_COLLECTIONS_KEY } from '@/lib/redis'
import { INPROCESS_API, type Moment } from '@/lib/inprocess'

const COLLECTION_PREVIEW_LIMIT = 20 // tokens fetched per featured collection
const ROW_DISPLAY_LIMIT = 8 // moments shown in horizontal scroll

interface HydratedFeaturedCollection {
  contractAddress: string
  name?: string
  metadata?: { name?: string; image?: string; description?: string }
  default_admin?: { address?: string; username?: string }
  moments: Moment[]
  candidateTokenIds: string[]
  featuredAt: number
}

export async function GET() {
  const raw = (await redis.zrange(FEATURED_COLLECTIONS_KEY, 0, -1, {
    rev: true,
    withScores: true,
  })) as (string | number)[]

  const refs: { address: string; featuredAt: number }[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    refs.push({ address: String(raw[i]), featuredAt: Number(raw[i + 1]) })
  }

  if (refs.length === 0) {
    return NextResponse.json({ collections: [] })
  }

  const collections = await Promise.all(
    refs.map(async (ref): Promise<HydratedFeaturedCollection | null> => {
      try {
        const [collRes, tlRes] = await Promise.all([
          fetch(`${INPROCESS_API}/collection/${ref.address}`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 60 },
          }),
          fetch(
            `${INPROCESS_API}/timeline?collection=${ref.address}&limit=${COLLECTION_PREVIEW_LIMIT}&chain_id=8453`,
            {
              headers: { Accept: 'application/json' },
              next: { revalidate: 60 },
            },
          ),
        ])

        const collection = collRes.ok ? await collRes.json() : {}
        const tlData = tlRes.ok ? await tlRes.json() : { moments: [] }
        const previewMoments: Moment[] = Array.isArray(tlData.moments) ? tlData.moments : []

        return {
          contractAddress: ref.address,
          name: collection.name,
          metadata: collection.metadata,
          default_admin: collection.default_admin,
          moments: previewMoments.slice(0, ROW_DISPLAY_LIMIT),
          candidateTokenIds: previewMoments.map((m) => m.token_id),
          featuredAt: ref.featuredAt,
        }
      } catch {
        return null
      }
    }),
  )

  return NextResponse.json({
    collections: collections.filter(Boolean) as HydratedFeaturedCollection[],
  })
}
