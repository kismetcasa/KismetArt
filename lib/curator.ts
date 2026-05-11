import { cookies } from 'next/headers'
import { redis } from './redis'
import { ADMIN_ADDRESS, CURATOR_ADDRESSES } from './config'

const SESSION_COOKIE = 'kismetart-admin'

interface SessionResult {
  signer: string
}
interface SessionError {
  error: string
  status: number
}

/**
 * Read and validate the admin session cookie. Replaces the prior body-
 * param signature scheme — admin/curator requests now carry an HttpOnly
 * cookie set by /api/auth/login (which itself verifies an EIP-4361 SIWE
 * message). The token is opaque, server-issued, and stored in Redis with
 * the same 4h TTL the old session signature had, so the visible UX
 * (one wallet prompt per work session) is preserved.
 *
 * Hardens against the prior model in three ways:
 *  - Single-use nonce in the signed SIWE message prevents replay
 *  - Domain-bound signature prevents CSRF on the login endpoint
 *  - HttpOnly cookie isn't reachable from page JS (XSS-resistant)
 *
 * Returns { signer } on success or { error, status } on any failure so
 * call-sites can short-circuit with a single check.
 */
export async function verifyPrivilegedSession(): Promise<SessionResult | SessionError> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return { error: 'Not authenticated', status: 401 }

  const signer = await redis.get<string>(`kismetart:auth-session:${token}`).catch(() => null)
  if (!signer) return { error: 'Session expired — please sign in again', status: 401 }

  const allowed = signer === ADMIN_ADDRESS || CURATOR_ADDRESSES.includes(signer)
  if (!allowed) return { error: 'Not authorized', status: 403 }

  return { signer }
}

/**
 * Stricter variant — admin-only, no curator allowlist. Used by routes
 * that perform platform-wide moderation (hide/unhide, splits backfill).
 */
export async function verifyAdminSession(): Promise<SessionResult | SessionError> {
  if (!ADMIN_ADDRESS) return { error: 'Admin not configured', status: 403 }
  const result = await verifyPrivilegedSession()
  if ('error' in result) return result
  if (result.signer !== ADMIN_ADDRESS) return { error: 'Not authorized', status: 403 }
  return result
}
