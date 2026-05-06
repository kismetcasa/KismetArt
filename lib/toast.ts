/**
 * Map an unknown error (wallet rejection, RPC error, fetch error, generic
 * Error) to a single human-readable description string suitable for the
 * `description` field of a sonner toast. Centralized so every callsite
 * surfaces wallet rejections as a clean "Cancelled" instead of leaking
 * "user rejected the request" strings.
 */
export function humanError(err: unknown): string {
  if (err == null) return 'Unknown error'
  const raw = err instanceof Error ? err.message : String(err)
  if (/user rejected|user denied|rejected the request|user cancell?ed/i.test(raw)) {
    return 'Cancelled'
  }
  // Some wallet errors put the rejection text on err.cause.message instead.
  if (err instanceof Error && typeof (err as Error & { cause?: unknown }).cause === 'object') {
    const cause = (err as Error & { cause?: { message?: string } }).cause
    if (cause?.message && /user rejected|user denied|rejected the request|user cancell?ed/i.test(cause.message)) {
      return 'Cancelled'
    }
  }
  return raw
}
