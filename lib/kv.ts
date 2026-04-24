import { Redis } from '@upstash/redis'
import { PLATFORM_COLLECTION } from './config'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const KEY = 'kismetart:collections'

export async function getTrackedCollections(): Promise<string[]> {
  try {
    const stored = (await redis.smembers(KEY)) as string[]
    const all = new Set([PLATFORM_COLLECTION, ...stored])
    return Array.from(all)
  } catch {
    return [PLATFORM_COLLECTION]
  }
}

export async function addTrackedCollection(address: string): Promise<void> {
  try {
    await redis.sadd(KEY, address)
  } catch {
    // Redis not configured — silently skip
  }
}
