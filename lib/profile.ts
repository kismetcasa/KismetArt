import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface Profile {
  address: string
  username?: string
  avatarUrl?: string
  updatedAt: number
}

const keyByAddress = (address: string) =>
  `kismetart:profile:${address.toLowerCase()}`
const keyNonce = (address: string) =>
  `kismetart:nonce:${address.toLowerCase()}`
const KEY_PROFILES = 'kismetart:profiles'

export async function getProfile(address: string): Promise<Profile> {
  const raw = await redis.get<string | Profile>(keyByAddress(address))
  const base: Profile = { address: address.toLowerCase(), updatedAt: 0 }
  if (!raw) return base
  const parsed: Profile = typeof raw === 'string' ? JSON.parse(raw) : raw
  return { ...base, ...parsed }
}

export async function upsertProfile(
  address: string,
  data: Partial<Pick<Profile, 'username' | 'avatarUrl'>>
): Promise<Profile> {
  const existing = await getProfile(address)
  const updated: Profile = { ...existing, ...data, address: address.toLowerCase(), updatedAt: Date.now() }
  await Promise.all([
    redis.set(keyByAddress(address), JSON.stringify(updated)),
    redis.sadd(KEY_PROFILES, address.toLowerCase()),
  ])
  return updated
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const addresses = (await redis.smembers(KEY_PROFILES)) as string[]
  if (!addresses.length) return []
  const keys = addresses.map(keyByAddress)
  const raws = await redis.mget<(string | Profile | null)[]>(...keys)
  const q = query.toLowerCase()
  const results: Profile[] = []
  for (const raw of raws) {
    if (!raw) continue
    const profile: Profile = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (
      (profile.username ?? '').toLowerCase().includes(q) ||
      profile.address.toLowerCase().startsWith(q)
    ) {
      results.push(profile)
      if (results.length >= 5) break
    }
  }
  return results
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
