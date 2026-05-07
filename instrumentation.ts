/**
 * Next.js instrumentation entry point. Runs once per server cold start,
 * before any request is served. We surface on-chain permission invariants
 * here — see lib/healthcheck.ts for the rationale (the platform-
 * collection permissions misconfig we're hardening against ate ~48
 * hours of debugging; surfacing it at boot prevents a silent regression
 * from shipping unnoticed).
 *
 * Guarded by NEXT_RUNTIME so the Edge runtime (which can't reach our
 * Base RPC client) doesn't try to run it.
 *
 * Critical: we DO NOT throw on a failed healthcheck at runtime. Vercel's
 * "previous version stays live" guarantee applies at *build* time only;
 * an unhandled throw during cold-start `register()` can leave the
 * runtime in a hard-fail loop and dark the live site. The healthcheck
 * is an observability primitive, not a deploy gate — it prints loudly
 * to stderr (visible in Vercel function logs) so an operator notices
 * within one cold start, but never takes the site down. Move
 * fail-closed enforcement to a build-time CI check or a deploy-pipeline
 * smoke test if you need that semantic.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { assertPlatformCollectionAuthorized } = await import('@/lib/healthcheck')
    await assertPlatformCollectionAuthorized()
  } catch (err) {
    console.error(
      '[instrumentation] platform-collection healthcheck failed — site will continue serving but Kismet Casa mints into PLATFORM_COLLECTION may revert. Check logs and grant ADMIN on chain or update OPERATOR_SMART_WALLET / NEXT_PUBLIC_PLATFORM_COLLECTION env.',
      err instanceof Error ? err.message : String(err),
    )
  }
}
