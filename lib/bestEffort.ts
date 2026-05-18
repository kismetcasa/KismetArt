/**
 * .catch handler that logs the rejection with a scope tag and optional
 * context. Use on best-effort writes (KV bookkeeping after a successful
 * mint, listing sweep, notification fanout) — NOT on reads where the
 * falsy fallback is the valid answer.
 */
export function bestEffort(scope: string, context?: Record<string, unknown>) {
  return (err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[${scope}] best-effort failed: ${detail}`, context ?? {})
  }
}
