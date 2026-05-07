import { isAddress } from '@/lib/address'
import { INPROCESS_API } from '@/lib/inprocess'

/**
 * Resolves an artist's inprocess smart wallet address from their EOA.
 *
 * Inprocess's `/api/smartwallet` documented response shape is
 * `{ address: "0x..." }` but historically the API has returned a few
 * variants (`smartWallet`, `smart_wallet`, `smartAccount`, raw address
 * string). Centralizing the defensive parsing here ensures the local
 * proxy (`/api/inprocess/smart-wallet`) and the server-side audit
 * endpoint (`/api/permissions/audit`) can never drift on which shapes
 * they accept — that drift was producing false-negative "smartwallet
 * lookup failed" rows in audit results when the upstream returned a
 * non-canonical shape.
 *
 * Returns the lowercased address on success, or null on any failure
 * (invalid input, network error, non-200 upstream, unparseable
 * response). Callers decide how to surface the failure (the local
 * proxy returns a 502; the audit endpoint records an "error" row).
 */
export async function resolveSmartWallet(
  artistWallet: string,
  options: { revalidate?: number } = {},
): Promise<string | null> {
  if (!isAddress(artistWallet)) return null
  const revalidate = options.revalidate ?? 3600

  let res: Response
  try {
    const url = new URL(`${INPROCESS_API}/smartwallet`)
    url.searchParams.set('artist_wallet', artistWallet)
    res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate },
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Some upstream paths return a bare address string; treat that as
    // the address itself rather than a parse failure.
    parsed = text.trim()
  }

  const candidate =
    typeof parsed === 'string'
      ? parsed
      : parsed && typeof parsed === 'object'
        ? ((parsed as Record<string, unknown>).address
            ?? (parsed as Record<string, unknown>).smartWallet
            ?? (parsed as Record<string, unknown>).smart_wallet
            ?? (parsed as Record<string, unknown>).smartAccount)
        : undefined

  if (typeof candidate !== 'string' || !isAddress(candidate)) return null

  // Lowercase for stable comparison/storage; viem accepts any casing.
  return candidate.toLowerCase()
}
