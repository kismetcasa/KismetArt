'use client'

import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

/**
 * Ensures the wallet has a valid Kismet Art session, prompting one wallet
 * signature if not. Auth state lives in an httpOnly `kismet_session` cookie
 * set by `POST /api/session`; the client never sees the token, so an XSS
 * can't exfiltrate it. Server-controlled TTL via cookie Max-Age — no
 * client-side clock to drift.
 *
 * `validForAddress` is a per-tab cache of the address the cookie is bound
 * to (we already know it from the sign-in flow); it lets us skip the
 * `GET /api/session` round-trip on repeat calls within the same render
 * tree. If a different wallet connects, the cache invalidates and we
 * re-validate against the server.
 */
let validForAddress: string | null = null

export function useUploadSession() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const ensureSession = useCallback(async (): Promise<void> => {
    if (!address) throw new Error('Wallet not connected')
    const lower = address.toLowerCase()

    if (validForAddress === lower) return

    // Validate the existing cookie (if any) on the server. Single round-trip;
    // returns 401 if no cookie or expired.
    const probe = await fetch('/api/session', { method: 'GET', credentials: 'same-origin' })
    if (probe.ok) {
      const data = (await probe.json().catch(() => ({}))) as { address?: string }
      if (data.address?.toLowerCase() === lower) {
        validForAddress = lower
        return
      }
      // Cookie belongs to a different address — drop it and re-auth.
      await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    }

    // No valid session — run the sign-in flow.
    const nonceRes = await fetch(`/api/profile/${address}/nonce`)
    if (!nonceRes.ok) throw new Error('Could not fetch nonce')
    const { nonce } = (await nonceRes.json().catch(() => ({}))) as { nonce?: string }
    if (!nonce) throw new Error('Could not fetch nonce')

    const message = `Sign in to Kismet Art\nAddress: ${lower}\nNonce: ${nonce}`
    const signature = await signMessageAsync({ message })

    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signature, nonce }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; address?: string; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Session creation failed')

    validForAddress = lower
  }, [address, signMessageAsync])

  return { ensureSession }
}
