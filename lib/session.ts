import { redis } from './redis'
import { randomUUID } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
export const SESSION_COOKIE = 'kismet_session'

const key = (token: string) => `kismetart:session:${token}`

export async function createSession(address: string): Promise<string> {
  const token = randomUUID()
  await redis.setex(key(token), SESSION_TTL_SECONDS, address.toLowerCase())
  return token
}

export async function verifySession(token: string): Promise<string | null> {
  return redis.get<string>(key(token))
}

export async function revokeSession(token: string): Promise<void> {
  await redis.del(key(token))
}

/**
 * Read the session cookie from a request and return the bound address, or
 * null if missing/expired. This is the single auth check for endpoints that
 * spend platform resources (Arweave credit, sponsored API key) — the
 * httpOnly cookie can't be read by client JS, so XSS can't exfiltrate it.
 */
export async function getSessionAddress(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

/**
 * Set the session cookie on a NextResponse with httpOnly + Secure + SameSite=Lax
 * + Max-Age aligned to SESSION_TTL_SECONDS. Lax (not Strict) so OAuth-style
 * redirect flows still pass through; Strict would also work but breaks bookmarked
 * deep links during a redirect-back.
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
