import { redis } from './redis'

// Fixed-window rate limiter. Fails open if Redis is unavailable.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSecs: number
): Promise<boolean> {
  try {
    const k = `kismetart:rl:${key}`
    const count = await redis.incr(k)
    if (count === 1) await redis.expire(k, windowSecs)
    return count <= limit
  } catch {
    return true
  }
}
