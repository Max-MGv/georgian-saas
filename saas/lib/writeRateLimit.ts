import { headers } from 'next/headers'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'

/**
 * Rate limiting for public write actions — bookings and wine orders
 * ([[KnownBugs]] #19).
 *
 * Every tenant is throttled on these two actions now, not just the demo. The
 * demo tenant (`demo.vineworks.ge`) is a sandbox anyone on the internet can
 * write to, and keeps a tight bucket. A real tenant's booking form is their
 * livelihood, so it gets a much looser bucket sized not to catch a legitimate
 * burst — a coach party booking together, or an office on shared WiFi — while
 * still stopping a bot or a retry loop. See the 2026-08-12 stress test
 * (`vault/StressTest-2026-08-12.md`): a burst of simultaneous visitors can
 * exhaust the DB's connection ceiling, and this is the first, recommended
 * line of defense against that.
 *
 * **Known limitation, stated plainly: this is per-instance, in-memory.** Vercel
 * runs several lambda instances and each keeps its own counter, so a determined
 * attacker spreading requests across instances gets a higher effective limit
 * than the numbers below. It is a speed bump, not a wall. For the demo tenant
 * that's proportionate because the two things actually worth protecting there
 * are handled outright rather than by throttling: outbound email is
 * suppressed for that tenant entirely (lib/emails/sendEmail.ts), and junk
 * rows are wiped nightly by the regeneration cron. A durable, cross-instance
 * limiter would need its own table and migration — a bigger piece of work,
 * deliberately out of scope here; full connection-pool tuning is likewise a
 * separate, deferred effort.
 */

type Window = { count: number; resetAt: number }

const buckets = new Map<string, Window>()

/** Keeps the map from growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key)
  }
}

type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

type RateLimitAction = 'booking' | 'wine-order' | 'bug-report'

/** The demo tenant's tight bucket, unchanged from before this generalized: nobody legitimately makes five bookings a minute on a shared public sandbox. */
const DEMO_RULES: Record<RateLimitAction, RateLimitRule> = {
  booking: { limit: 5, windowMs: 10 * 60 * 1000 },
  'wine-order': { limit: 5, windowMs: 10 * 60 * 1000 },
  'bug-report': { limit: 5, windowMs: 10 * 60 * 1000 },
}

/** Every real tenant's bucket — generous enough that a coach party or a shared office network is never blocked, while still stopping a bot/retry-loop. */
const DEFAULT_RULES: Record<RateLimitAction, RateLimitRule> = {
  booking: { limit: 20, windowMs: 10 * 60 * 1000 },
  'wine-order': { limit: 20, windowMs: 10 * 60 * 1000 },
  // A person reporting a few things in a row is normal; a bot or a retry loop is not. Each
  // submission also writes a ticket, may upload up to 4 MB and sends an email.
  'bug-report': { limit: 8, windowMs: 10 * 60 * 1000 },
}

/**
 * Resolves the caller's IP from the proxy headers Vercel sets. Falls back to a
 * shared bucket when no header is present, which is the safe direction: an
 * unidentifiable caller is throttled alongside every other unidentifiable
 * caller rather than being waved through.
 */
async function callerKey(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  return ip
}

/**
 * Returns `{ limited: true }` when the caller has exceeded the rule for this
 * tenant and action. Picks the rule internally — demo tenant gets `DEMO_RULES`,
 * every other tenant gets the looser `DEFAULT_RULES` — so a call site can't
 * accidentally pick the wrong one.
 */
export async function checkWriteRateLimit(
  tenantId: string | null | undefined,
  action: RateLimitAction,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const rule = tenantId === DEMO_TENANT_ID ? DEMO_RULES[action] : DEFAULT_RULES[action]

  const now = Date.now()
  sweep(now)

  // Tenant-scoped: two different wineries' visitors sharing an IP (an office
  // NAT, a coach company booking with several tenants) must not share a
  // bucket now that every tenant is actively limited here.
  const key = `${tenantId ?? 'unknown'}:${action}:${await callerKey()}`
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    return { limited: false, retryAfterSeconds: 0 }
  }

  existing.count++
  if (existing.count > rule.limit) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }
  return { limited: false, retryAfterSeconds: 0 }
}

/** Test seam — lets a test start from a clean slate. */
export function __resetWriteRateLimits() {
  buckets.clear()
}
