import { kv } from '@vercel/kv'
import { PLATFORM_COLLECTION } from './config'

const KEY = 'kismetart:collections'

export async function getTrackedCollections(): Promise<string[]> {
  try {
    const stored = await kv.smembers<string>(KEY)
    const all = new Set([PLATFORM_COLLECTION, ...stored])
    return Array.from(all)
  } catch {
    return [PLATFORM_COLLECTION]
  }
}

export async function addTrackedCollection(address: string): Promise<void> {
  try {
    await kv.sadd(KEY, address)
  } catch {
    // KV not configured — silently skip
  }
}
