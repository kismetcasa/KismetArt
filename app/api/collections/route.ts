import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, isAddress, type Address } from 'viem'
import { base } from 'viem/chains'
import { INPROCESS_API } from '@/lib/inprocess'
import { getTrackedCollections, addTrackedCollection, getCollectionsByArtist } from '@/lib/kv'
import { checkRateLimit, getClientIp } from '@/lib/ratelimit'
import { getSessionAddress } from '@/lib/session'

// Zora 1155 PERMISSION_BIT_ADMIN = 2 (= 2^1). Anyone with this bit can mutate
// the contract. We require the caller to have it before letting them register
// the collection in our tracked list — otherwise anyone could pollute artist
// pages with arbitrary contract addresses.
const PERMISSION_BIT_ADMIN = 2n

const COLLECTION_PERMISSIONS_ABI = [
  {
    name: 'permissions',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artist = searchParams.get('artist')

  if (artist) {
    if (!isAddress(artist)) {
      return NextResponse.json({ error: 'Invalid artist address' }, { status: 400 })
    }
    const url = new URL(`${INPROCESS_API}/collections`)
    url.searchParams.set('artist', artist)
    url.searchParams.set('limit', '100')
    try {
      const [res, tracked, kvOwned] = await Promise.all([
        fetch(url.toString(), {
          headers: { Accept: 'application/json' },
          next: { revalidate: 120 },
        }),
        getTrackedCollections(),
        getCollectionsByArtist(artist),
      ])
      const text = await res.text()
      const data = JSON.parse(text)
      const trackedSet = new Set(tracked.map((a: string) => a.toLowerCase()))
      const inprocessAddrs = new Set<string>()
      if (Array.isArray(data.collections)) {
        data.collections = data.collections.filter(
          (c: { contractAddress?: string }) => {
            if (!c.contractAddress) return false
            const lower = c.contractAddress.toLowerCase()
            inprocessAddrs.add(lower)
            return trackedSet.has(lower)
          }
        )
      } else {
        data.collections = []
      }
      // Merge KV-tracked collections that the indexer hasn't picked up yet.
      // Shape matches what ProfileView consumes: contractAddress + metadata fields.
      for (const meta of kvOwned) {
        if (inprocessAddrs.has(meta.address.toLowerCase())) continue
        data.collections.push({
          contractAddress: meta.address,
          name: meta.name,
          metadata: {
            name: meta.name,
            image: meta.image,
            description: meta.description,
          },
        })
      }
      return NextResponse.json(data, { status: res.status })
    } catch {
      // Even if inprocess is down, return what we have locally so fresh
      // collections aren't completely invisible.
      const kvOwned = await getCollectionsByArtist(artist)
      return NextResponse.json({
        collections: kvOwned.map((meta) => ({
          contractAddress: meta.address,
          name: meta.name,
          metadata: {
            name: meta.name,
            image: meta.image,
            description: meta.description,
          },
        })),
      })
    }
  }

  const collections = await getTrackedCollections()
  return NextResponse.json({ collections })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`collections:${ip}`, 5, 60)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Authenticated caller — Kismet Art session cookie required.
  const sessionAddress = await getSessionAddress(req)
  if (!sessionAddress) {
    return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })
  }

  let body: {
    address: string
    name?: string
    image?: string
    description?: string
    artist?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  }
  // Caller must claim themselves as the artist — prevents one user from
  // populating another's profile page.
  if (!body.artist || body.artist.toLowerCase() !== sessionAddress) {
    return NextResponse.json({ error: 'artist must match session address' }, { status: 403 })
  }

  // Caller must have ADMIN bit on the collection on-chain. This is the same
  // check Zora uses when gating addPermission/setSale; we read it directly
  // rather than trusting an off-chain claim. tokenId 0 is the collection-wide
  // permission row.
  try {
    const client = createPublicClient({ chain: base, transport: http() })
    const perms = (await client.readContract({
      address: body.address as Address,
      abi: COLLECTION_PERMISSIONS_ABI,
      functionName: 'permissions',
      args: [0n, sessionAddress as Address],
    })) as bigint
    const isAdmin = (perms & PERMISSION_BIT_ADMIN) === PERMISSION_BIT_ADMIN
    if (!isAdmin) {
      return NextResponse.json({ error: 'Caller is not admin of this collection' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Could not verify collection admin on-chain' }, { status: 502 })
  }

  await addTrackedCollection(body.address, {
    name: body.name ?? body.address,
    image: body.image,
    description: body.description,
    artist: sessionAddress,
  })
  return NextResponse.json({ ok: true })
}
