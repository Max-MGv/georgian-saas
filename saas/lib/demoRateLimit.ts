import { headers } from 'next/headers'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'

/**
 * Rate limiting for public write actions on the demo tenant
 * (Plan-DemoRedesign, "abuse guardrails"; [[KnownBugs]] #19).
 *
 * `demo.vineworks.ge` is a sandbox anyone on the internet can write to, and the
 * link is about to be shared. Without a ceiling, one bored visitor with a loop
 * can fill the bookings table, and every booking used to trigger a real email.
 *
 * **Scope: the demo tenant only.** This deliberately does not touch real
 * wineries. A real tenant's booking form is their livelihood — throttling it on
 * a shared-IP office network or a coach party booking together would cost them
 * money, and that decision needs its own thought rather than being smuggled in
 * with a demo fix. #19 stays open for the app at large.
 *
 * **Known limitation, stated plainly: this is per-instance, in-memory.** Vercel
 * runs several lambda instances and each keeps its own counter, so a determined
 * attacker spreading requests across instances gets a higher effective limit
 * than the numbers below. It is a speed bump, not a wall. That is proportionate
 * here, because the two things actually worth protecting are handled outright
 * rather than by throttling: outbound email is suppressed for this tenant
 * entirely (lib/emails/sendEmail.ts), and junk rows are wiped nightly by the
 * regeneration cron. A durable limiter would need its own table and migration —
 * worth doing when #19 is addressed properly for real tenants.
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

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

/** A booking is a considered act; nobody legitimately makes five a minute. */
export const DEMO_BOOKING_LIMIT: RateLimitRule = { limit: 5, windowMs: 10 * 60 * 1000 }
/** Wine orders are the same shape of action. */
export const DEMO_WINE_ORDER_LIMIT: RateLimitRule = { limit: 5, windowMs: 10 * 60 * 1000 }

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
 * Returns `{ limited: true }` when the caller has exceeded the rule.
 *
 * A no-op for every tenant but the demo — callers pass their own tenantId and
 * get `{ limited: false }` straight back if it isn't the demo's.
 */
export async function checkDemoRateLimit(
  tenantId: string | null | undefined,
  action: string,
  rule: RateLimitRule,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  if (tenantId !== DEMO_TENANT_ID) return { limited: false, retryAfterSeconds: 0 }

  const now = Date.now()
  sweep(now)

  const key = `${action}:${await callerKey()}`
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
export function __resetDemoRateLimits() {
  buckets.clear()
}
