import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface Profile {
  address: string
  avatarUrl?: string
  updatedAt: number
}

const keyByAddress = (address: string) =>
  `kismetart:profile:${address.toLowerCase()}`
const keyNonce = (address: string) =>
  `kismetart:nonce:${address.toLowerCase()}`

export async function getProfile(address: string): Promise<Profile> {
  const raw = await redis.get<string | Profile>(keyByAddress(address))
  const base: Profile = { address: address.toLowerCase(), updatedAt: 0 }
  if (!raw) return base
  const parsed: Profile = typeof raw === 'string' ? JSON.parse(raw) : raw
  return { ...base, ...parsed }
}

export async function upsertProfile(
  address: string,
  data: Partial<Pick<Profile, 'avatarUrl'>>
): Promise<Profile> {
  const existing = await getProfile(address)
  const updated: Profile = { ...existing, ...data, address: address.toLowerCase(), updatedAt: Date.now() }
  await redis.set(keyByAddress(address), JSON.stringify(updated))
  return updated
}

// Nonce for wallet signature verification — expires in 5 minutes
export async function createNonce(address: string): Promise<string> {
  const nonce = randomUUID()
  await redis.setex(keyNonce(address), 300, nonce)
  return nonce
}

export async function consumeNonce(address: string, nonce: string): Promise<boolean> {
  const stored = await redis.get<string>(keyNonce(address))
  if (!stored || stored !== nonce) return false
  await redis.del(keyNonce(address))
  return true
}
