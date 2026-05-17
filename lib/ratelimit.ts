import { type NextRequest } from 'next/server'
import { redis } from './redis'

export function getClientIp(req: NextRequest): string {
  // `cf-connecting-ip` is set by Cloudflare to the real client's IP and is
  // overwritten on every request, so it can't be spoofed by a client sending
  // a forged X-Forwarded-For. Prefer it when present (Cloudflare in front);
  // fall back to the proxy-chain XFF leftmost otherwise.
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

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
