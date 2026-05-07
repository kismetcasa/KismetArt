import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { INPROCESS_API } from '@/lib/inprocess'

/**
 * Returns the inprocess platform smart wallet address bound to our
 * INPROCESS_API_KEY. Used by `CreateCollectionForm` (to grant ADMIN at
 * deploy via setupActions) and `CollectionView` (to read whether the
 * smart wallet already holds ADMIN, and to write addPermission for the
 * retroactive authorize flow).
 *
 * We proxy server-side so the API key never leaves the host. The
 * upstream value is per-API-key and effectively immutable, so a long
 * Next.js fetch cache (1 hour) is fine — every page render in that
 * window pulls from cache without touching inprocess.
 */
export const revalidate = 3600

export async function GET() {
  const apiKey = process.env.INPROCESS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'INPROCESS_API_KEY not configured' }, { status: 500 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${INPROCESS_API}/smartwallet`, {
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      next: { revalidate: 3600 },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'upstream unreachable',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  const text = await upstream.text()
  if (!upstream.ok) {
    console.error(
      `[inprocess/smart-wallet] upstream ${upstream.status}: ${text.slice(0, 500)}`,
    )
    return NextResponse.json(
      { error: 'upstream error', status: upstream.status, detail: text.slice(0, 200) },
      { status: 502 },
    )
  }

  // Be defensive about response shape — accept the documented field, a
  // few common alternates, and a raw address string. Pick the first
  // valid 0x-prefixed address we find.
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text.trim()
  }
  const candidate =
    typeof parsed === 'string'
      ? parsed
      : parsed && typeof parsed === 'object'
        ? ((parsed as Record<string, unknown>).smartWallet
            ?? (parsed as Record<string, unknown>).smart_wallet
            ?? (parsed as Record<string, unknown>).smartAccount
            ?? (parsed as Record<string, unknown>).address
            ?? (parsed as Record<string, unknown>).account)
        : undefined

  if (typeof candidate !== 'string' || !isAddress(candidate)) {
    console.error(
      `[inprocess/smart-wallet] could not extract address from upstream response: ${text.slice(0, 500)}`,
    )
    return NextResponse.json({ error: 'invalid upstream response' }, { status: 502 })
  }

  // Lowercase for stable comparison/storage; viem accepts any casing.
  return NextResponse.json({ address: candidate.toLowerCase() })
}
