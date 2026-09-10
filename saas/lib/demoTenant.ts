/**
 * Identifies the Vineworks Demo tenant so DemoModeBanner (and anything else
 * demo-specific) can gate on it. See [[Plan-DemoSite]].
 *
 * DEMO_TENANT_ID reads from NEXT_PUBLIC_DEMO_TENANT_ID because the same
 * codebase deploys against two different databases (staging preview → dev
 * DB, production → prod DB) — a hardcoded ID can't be correct for both, the
 * same reason DEFAULT_TENANT_ID (proxy.ts) is env-driven rather than a
 * literal. NEXT_PUBLIC_ prefix is required because DemoModeBanner.tsx is a
 * client component and reads this constant directly.
 *
 * Local dev / Vercel Preview (staging): should be the dev-DB demo tenant id.
 * Vercel Production: must be set to the prod-DB demo tenant id once the
 * prod cutover (clone-nm-to-demo.ts + rebrand-demo-tenant*.ts run against
 * prod) creates that row — see the "Still not started" section of
 * Plan-DemoSite.md for whether that's been done yet.
 */
export const DEMO_TENANT_ID = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? 'cmtvgl6e60000vl6w9se65t86'
export const DEMO_ADMIN_EMAIL = 'demo-admin@vineworks.ge'
export const DEMO_ADMIN_PASSWORD = 'VineworksDemo2026!'
