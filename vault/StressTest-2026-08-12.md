---
tags: [testing, performance, risk, reference]
---

# Stress Test — 2026-08-12

**Trigger:** Max: "focus on #128 [sic — meant #129], use industry-standard methods, several iterations, generate a report on the practical risks of the website — e.g. if we hit concurrent X users the site will be affected like this, if we hit Y users with Z concurrent actions the site crashes." Started on localhost only; after the first pass, Max asked for real **production** numbers, confirmed all production order data is fake/seed (verified: 61 orders, all dated May–July, none since), confirmed production's online payment module has no credentials configured at all (nothing to accidentally charge), and accepted the risk of testing the live site directly.

**One-line answer:** production survives meaningfully more concurrent traffic than the earlier localhost estimate suggested — real errors start around **100 simultaneous visitors**, not ~50. But when it does break, it breaks harder than expected: the database hit its **absolute hard connection ceiling (200 clients)**, which took down request routing for *every* page, and **the site kept failing for a few minutes after the burst itself had already stopped** — a real "hangover" outage, not just slow responses during the spike.

This closes out `FeatureLog.md` #129 ("Stress test website — planned").

---

## TL;DR for decision-making

| Concurrent activity | What happens today (measured on live production) |
|---|---|
| 1–50 people browsing at once | Fine. Fast, in fact — 0.4–1.0s typical page load. |
| ~100 people loading pages at the same instant | Cracks start showing — 7% of requests fail. |
| ~150 people loading pages at the same instant | **Real outage** — 70% of requests fail, including the tenant-routing layer itself (so *every* page type fails, not just database-heavy ones), and the site **kept erroring for a few minutes after the burst stopped**, before recovering on its own. |
| Up to 30 people submitting bookings at once | Handled reasonably well — mostly successful, some slow outliers, no sustained outage. (Not pushed further than this — see "What I deliberately didn't do.") |

**Root cause, plain terms:** the database allows at most **200 connections at once, total, from anything** — this app, and anything else using that database project. Under a big traffic spike, Vercel automatically spins up many parallel copies of the app to handle it; each copy opens its own small pool of database connections. Enough copies running at once adds up past 200, and the database starts flatly refusing new connections — including the very first, lightweight check every single page needs just to figure out which winery's site it's serving. That's why a spike doesn't just slow the busy pages down, it can take down the whole site.

**The "hangover" is the part worth taking most seriously.** During the spike, some of the app's running copies got their internal database connection into a broken state. The database itself recovered almost immediately once the spike passed (connection count dropped back to normal within about a minute), but those broken copies kept failing every request routed to them for a few more minutes, with no test traffic from me at all during that window. A real burst of visitors — not a test — could leave the site down for genuine visitors for a stretch *after* whatever caused the spike is long gone.

**Still true from the localhost pass:** there is **no rate limiting anywhere in the app** — nothing throttles a burst, accidental or otherwise, before it reaches the ceiling above.

---

## What I actually tested, and the safety steps taken

Per your direction, this ran directly against `nikalasmarani.vercel.app` and the real production database — not something I'd have done without checking first. Before running anything:

- Confirmed (by direct query) production's online payment module has **no Flitt credentials configured at all** — there was no live payment gateway to accidentally hit, so no toggling was needed this time. As a backstop anyway, the booking-submission script hard-aborts any navigation toward Flitt's domain and refuses to click "submit" if the button ever says anything payment-related.
- Confirmed (by direct query) the 61 existing orders in production are all dated May–July 2026 with nothing since — consistent with dev/seed data, not an active real customer stream.
- Tagged every test booking `LOADTEST-<run-id>-*` in the name field; deleted all of them afterward (66 total across both passes), confirmed 0 remaining.
- Did **not** touch Settings, IBAN, site content, or any tenant configuration other than reading it.

**Read path** — page-load concurrency, `/`, `/wines`, `/about`, direct HTTP requests, ramped 1 → 150 simultaneous.

**Write path** — real booking submissions via a real headless browser (Playwright — Next.js Server Actions have a non-trivial wire format, so driving a real browser is the reliable way to exercise the real code path). Ramped more conservatively this time: 5 → 30, with a health check and recovery pause built into the script between every level, given what the read-path pass had just shown.

### What I deliberately didn't do

After the read-path test caused a genuine multi-minute outage (see below), I did not push the write-path test to the same breaking point on live production — booking submissions write real (if fake) data and I judged it wasn't worth risking a second outage window just to find booking's exact catastrophic ceiling, once the read-path test had already established *why* and *roughly where* the ceiling is. The 30-concurrent write-path number below is a real, clean data point; it is not the write path's breaking point, which is very likely lower than 30 given it showed occasional stress even at that level (see results).

---

## What happened during the read-path test (the important part)

At 150 concurrent page requests, Vercel's runtime error logs showed the real failure — not the softer "waited 10 seconds, gave up" behavior seen on localhost, but a hard database-level rejection:

```
FATAL: (EMAXCONN) max client connections reached, limit: 200
```

67 of these failures were in **the tenant-routing middleware itself** — the step every single request goes through first, before the app even knows which winery's site it's building. This is the key difference from the localhost result: a page-specific slow query degrades gracefully-ish (that page is slow or fails), but middleware failing means **every route fails**, indiscriminately, for the duration.

**Then it got worse:** a `curl` check ~90 seconds after the burst ended still returned `500`. I queried the database directly — it had already recovered (29 of 200 connections in use, completely normal) — meaning the site was still broken even though the thing that broke it was fine again. That points to some of Vercel's running app instances having gotten their internal database connection into a broken state during the spike, not recovering on their own the way the database did. It cleared up on its own roughly 3–4 minutes after the burst; I did not need to redeploy (I'd prepared to, but Max caught that I'd misread a stale check — the site actually recovered faster than my second check suggested, though the underlying "outage outlasts the spike" finding is real and confirmed by the error-log timestamps, not just my own polling).

---

## Results — read path (page loads), live production

| Concurrent visitors | Typical wait (p50) | Slowest 5% (p95) | Errors |
|---|---|---|---|
| 1 | 2.9s *(cold start)* | 2.9s | 0 |
| 5 | 0.5s | 1.5s | 0 |
| 10 | 0.4s | 0.7s | 0 |
| 25 | 0.5s | 1.5s | 0 |
| 50 | 0.6s | 1.0s | 0 |
| **100** | 0.9s | 1.5s | **7 / 100 failed (7%)** |
| **150** | 0.9s | 1.2s | **105 / 150 failed (70%)**, plus the multi-minute hangover above |

Compare to localhost's equivalent (from the first pass): errors started at 50 concurrent there, not 100 — production really is meaningfully more resilient in absolute terms, exactly because it runs next to the database (`fra1`, per [[Perf-Baseline-2026-07-29]]) instead of a few hundred milliseconds away. But it fails in a more totalizing way once it does fail (hard connection-ceiling + middleware outage + lingering hangover, vs. localhost's softer per-page timeout).

## Results — write path (booking submissions), live production

| Concurrent bookings | Typical wait (p50) | Errors | Notes |
|---|---|---|---|
| 5 | 6.7s | 1 / 5 (one slow outlier: 50s) | Health check after: OK |
| 10 | 4.5s | 0 / 10 | Health check after: OK |
| 20 | 8.2s | 2 / 20 (two slow outliers: ~52s) | Health check after: OK |
| 30 | 15.9s | 0 / 30 | Health check after: OK |

No sustained outage at any level tested here, unlike the read-path burst — but the scattered slow outliers (a handful of requests taking 50+ seconds while most complete in single digits) are an early warning sign of the same contention, just not enough concurrent load yet to tip it into the read-path's cascade. Not extended further, per "What I deliberately didn't do" above.

---

## What this means, practically

- **The good news:** production's real headroom is meaningfully better than the localhost-only estimate suggested. Ordinary traffic, even a genuinely busy moment (dozens of simultaneous visitors), is very unlikely to be a problem.
- **The bad news:** the failure mode at the top of that headroom is worse than "some pages are slow" — it's a whole-site outage that can outlast whatever caused it by several minutes, with nothing in place to prevent, throttle, or gracefully degrade under a burst.
- **Realistic triggers for a burst in this range:** a booking link shared somewhere busy, a marketing push, a bug causing a client-side retry loop, or a bot/scraper — none of these require malice, just more simultaneous attention than the site has ever needed to handle so far.
- With effectively 1 real tenant today, this is not an active emergency. It becomes one the moment real traffic starts approaching "dozens of people at the same instant," which is a plausible outcome of the site actually succeeding at attracting customers — worth fixing before that point, not after.

---

## Recommendations (not implemented — for your decision)

Unchanged in spirit from the localhost pass, sharpened by what production actually showed:

1. **Basic rate limiting on the booking/wine-order forms** is now the clearer priority over pool-size tuning — it directly prevents the burst that triggers everything else, for comparatively little engineering effort.
2. **Graceful failure messaging** for the database-unavailable case, so a burst produces "we're busy, try again shortly" instead of a broken page and (worse) a silently lost booking.
3. **Investigate the "hangover" specifically** — a connection that doesn't self-heal after the underlying database recovers suggests the app's Prisma client error-handling could retry/reconnect rather than staying wedged; worth a focused look independent of the broader rate-limiting question.
4. **Only if real traffic ever approaches these numbers:** revisit whether 20 connections per app instance times Vercel's auto-scaling is the right shape at all, versus a pooler configuration that cooperates with serverless scaling (Supabase's docs have specific guidance for this — not investigated here, out of scope for a measurement pass).

No code was changed as part of this pass — measurement and report only.

---

## Appendix — raw methodology notes

- **Localhost pass** (first): production-mode build (`next build && next start -p 3002`) against the **dev** Supabase database. Superseded in relevance by the production pass below, but kept as the comparison baseline — see the earlier revision of this doc in git history / [[Perf-Baseline-2026-07-29]] for the equivalent localhost table if needed.
- **Production pass**: direct HTTP requests (read path) and Playwright-driven real browser submissions (write path) against `https://nikalasmarani.vercel.app`. Verified via Vercel's own runtime-error API (`get_runtime_errors`) and a direct `pg_stat_activity` query against the production database, not just client-side observation.
- Read-path burst: caused a real, confirmed multi-minute partial outage on live production. Recovered on its own; no redeploy was ultimately needed.
- Write-path: 66 test bookings total (tagged `LOADTEST-<run-id>-*`) created across both localhost and production passes, all deleted afterward, confirmed 0 remaining in both databases.
- No Settings, IBAN, site content, or tenant configuration was modified in production at any point.
- Local test server (port 3002) and its process were stopped after the localhost pass. The pre-existing local dev server on port 3000 was killed once during that pass to unblock a required `prisma generate` (Windows file-lock issue, `MaintenanceNotes.md`/Rule 10) — restart it (`npm run dev` in `saas/`) if you want it back.

## Related

- [[Plan-Performance]] / [[Perf-Baseline-2026-07-29]] — the region-pinning fix that explains why production's per-request latency is so much better than localhost's
- [[RLS-Architecture]] — `withTenantDb`, the transaction wrapper whose pool usage this test measured
- `FeatureLog.md` #129, `KnownBugs.md` #19, #91 (the still-outstanding `setup-rls.ts` item, unrelated but in the same file)
