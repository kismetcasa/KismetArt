import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'
import type { SerializedOrderComponents } from './seaport'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface Listing {
  id: string
  collectionAddress: string
  tokenId: string
  seller: string
  price: string           // total buyer pays, in wei as string
  sellerProceeds: string  // seller receives after royalty, in wei as string
  royaltyReceiver: string
  royaltyAmount: string   // in wei as string
  orderComponents: SerializedOrderComponents
  signature: string
  createdAt: number       // ms
  expiresAt: number       // ms
  status: 'active' | 'filled' | 'cancelled'
  // Display metadata (denormalized for fast rendering)
  name?: string
  image?: string
  creatorAddress?: string
}

const KEY_ALL = 'kismetart:listings'
const keyById = (id: string) => `kismetart:listing:${id}`
const keyByToken = (collection: string, tokenId: string) =>
  `kismetart:listings:token:${collection.toLowerCase()}:${tokenId}`
const keyBySeller = (seller: string) =>
  `kismetart:listings:seller:${seller.toLowerCase()}`

export async function createListing(
  data: Omit<Listing, 'id' | 'createdAt' | 'status'>
): Promise<Listing> {
  // Prevent duplicate active listing for same token from same seller
  const existing = await getListingForToken(data.collectionAddress, data.tokenId)
  if (existing && existing.seller.toLowerCase() === data.seller.toLowerCase()) {
    throw new Error('Active listing already exists for this token')
  }

  const listing: Listing = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
    status: 'active',
  }

  await Promise.all([
    redis.zadd(KEY_ALL, { score: listing.createdAt, member: listing.id }),
    redis.set(keyById(listing.id), JSON.stringify(listing)),
    redis.set(keyByToken(listing.collectionAddress, listing.tokenId), listing.id),
    redis.sadd(keyBySeller(listing.seller), listing.id),
  ])

  return listing
}

export async function getListing(id: string): Promise<Listing | null> {
  const raw = await redis.get<string | Listing>(keyById(id))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function getListingForToken(
  collectionAddress: string,
  tokenId: string
): Promise<Listing | null> {
  const id = await redis.get<string>(keyByToken(collectionAddress.toLowerCase(), tokenId))
  if (!id) return null
  const listing = await getListing(typeof id === 'string' ? id : String(id))
  if (!listing || listing.status !== 'active') return null
  return listing
}

export async function getListings({
  page = 1,
  limit = 18,
  collection,
}: {
  page?: number
  limit?: number
  collection?: string
} = {}): Promise<{ listings: Listing[]; total: number }> {
  // All IDs newest-first
  const ids = (await redis.zrange(KEY_ALL, 0, -1, { rev: true })) as string[]

  const all = await Promise.all(ids.map((id) => getListing(id)))
  const now = Date.now()
  const active = all.filter(
    (l): l is Listing =>
      l !== null &&
      l.status === 'active' &&
      l.expiresAt > now &&
      (!collection || l.collectionAddress.toLowerCase() === collection.toLowerCase())
  )

  const total = active.length
  const start = (page - 1) * limit
  return { listings: active.slice(start, start + limit), total }
}

export async function updateListingStatus(
  id: string,
  status: 'filled' | 'cancelled'
): Promise<void> {
  const listing = await getListing(id)
  if (!listing) return
  const updated: Listing = { ...listing, status }
  await Promise.all([
    redis.set(keyById(id), JSON.stringify(updated)),
    // Remove from token index so the slot is free for a new listing
    redis.del(keyByToken(listing.collectionAddress, listing.tokenId)),
  ])
}
