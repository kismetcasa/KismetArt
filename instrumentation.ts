/**
 * Next.js instrumentation entry point. Runs once per server cold start,
 * before any request is served. We use it to enforce on-chain invariants
 * at boot — see lib/healthcheck.ts for the rationale (the platform-
 * collection permissions misconfig that we're hardening against here ate
 * ~48 hours of debugging; surfacing it at boot makes a regression
 * impossible to ship silently).
 *
 * Guarded by NEXT_RUNTIME so the Edge runtime (which can't reach our
 * Base RPC client) doesn't try to run it. Errors thrown here become
 * startup failures — Vercel marks the deploy as failed and the previous
 * version stays live, which is the correct behavior when the new env
 * config would produce a non-functional Kismet.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertPlatformCollectionAuthorized } = await import('@/lib/healthcheck')
  await assertPlatformCollectionAuthorized()
}
