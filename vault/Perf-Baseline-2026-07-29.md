---
tags: [performance, baseline, reference]
---

# Performance Baseline — 2026-07-29

**Frozen reference snapshot.** These are the "before" numbers every later performance change is measured against. Do not edit the measurements in this file — add new comparison rows to [[Plan-Performance]] instead.

**Captured:** 2026-07-29, against **live production** `nikalasmarani.vercel.app` (commit `06c81aa`, before any performance work).
**Tools:** Google Lighthouse 12.8.2 (headless Chrome, default mobile emulation + throttling) and `curl` timing.

At capture time: functions ran in `iad1` (Washington DC), databases in `eu-central-1` (Frankfurt), no region pinned, no page or data caching (`force-dynamic` everywhere), wine product photos uncompressed.

---

## Lighthouse — production, before any changes

| Metric | Home `/` | Order Wine `/wines` |
|---|---|---|
| **Performance score** | **81** | **64** |
| First Contentful Paint | 1.0s | 1.0s |
| Largest Contentful Paint | 3.2s | **15.5s** |
| Total Blocking Time | 260ms | 210ms |
| Cumulative Layout Shift | 0 | 0 |
| Speed Index | 7.4s | 7.7s |
| Time to Interactive | 3.2s | 15.5s |
| Accessibility | 92 | 95 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

Home page LCP phase breakdown: TTFB 22% / **Load Delay 74%** / Load Time 3% / Render Delay 0%.
Wines page LCP phase breakdown: TTFB 5% / Load Delay 46% / **Load Time 49%** (the 2MB images).

## `curl` timing — production, before any changes

| Page | Time to first byte | Total (full body) | HTML size |
|---|---|---|---|
| Home (1st) | 3.43s | 6.19s | 57,186 B |
| Home (2nd, warm) | 2.92s | 5.59s | 57,186 B |
| `/wines` | 2.95s | 3.14s | 53,931 B |
| `/about` | 3.03s | 3.98s | 40,633 B |

Note: Vercel's own `server-response-time` audit reported "Root document took 70ms" — that measures edge response, **not** the function's database work, and is misleading here. The `curl` TTFB above is the real user-perceived wait.

## Local dev-server breakdown (warm, dev DB)

The number that located the bottleneck — Next.js logs its own per-request split:

```
HEAD / 200 in 1731ms (next.js: 102ms, proxy.ts: 48ms, application-code: 1581ms)
```

- `next.js` 102ms — framework overhead, fine
- `proxy.ts` 48ms — tenant/domain resolution, fine (already cached, 5-min TTL)
- **`application-code` 1581ms — the database reads. The whole problem.**

## Database latency measurement (local machine → dev DB, Georgia → Frankfurt)

| Measurement | Time |
|---|---|
| Raw `SELECT 1` (pure round trip) | ~360ms |
| Plain transaction, no RLS handshake | 345ms |
| `withTenantDb` doing only `SELECT 1` | ~680ms |
| Real `findMany` (36 setting rows) | 666ms |
| Real `findMany` (64 content rows) | 743ms |
| Real `findMany` + include (companies + prices) | 819ms |
| 8 transactions **in parallel** | 1,440ms |
| 8 transactions **sequentially** | 4,962ms |

**The two conclusions that redirected the whole plan:**
1. A real query costs barely more than an empty one → it is ~100% network latency, ~0% database work. Reducing query count or shape cannot fix this.
2. The RLS handshake doubles every transaction (345ms → 680ms) — `set_config` and `SET LOCAL ROLE` are two extra *sequential* round trips.

## Asset weight before

| | Before |
|---|---|
| `public/images/products/` total (6 PNGs) | **7,744,921 B (7.5MB)** |
| Largest single file (`qisi.png`) | 2,257,607 B, 2991×2990px, displayed at 362×176px |
| Home page total page weight | 454 KB |
| Home DOM elements | 192 |

---

## Changes made after this snapshot

Tracked in [[Plan-Performance]]. In order:

| # | Change | Effect on these numbers |
|---|---|---|
| 0 | Wine photos resized 7.5MB → 1.06MB | `/wines` LCP 15.5s → 5.7s (measured on staging) |
| 1 | Batch settings/content queries (~24 tx → ~8) | **None** — 1,581ms → ~1,620ms. Queries were already parallel; count was never the bottleneck. **Not deployed** — uncommitted. |
| R | Pin function region to `fra1` | **Decisive.** TTFB ~2.93s → ~0.40s (7×). See below. |

### Chunk R result — measured 2026-07-29 on staging (`d1e97a4`)

Staging carried **only** the photo fix + the region change; the Chunk 1 refactor was *not* in this build, so attribution is clean. Production was measured **in the same minute** as a control, still on `iad1`.

| Page | Production `iad1` (control) | Staging `fra1` | Change |
|---|---|---|---|
| Home — TTFB | 2.97 / 2.93 / 2.92s | **0.40 / 0.57 / 0.40s** | **~7× faster** |
| Home — total | 5.76 / 6.10 / 5.63s | **0.49 / 0.62 / 0.47s** | **~10× faster** |
| `/wines` — TTFB | 2.94 / 2.93 / 2.96s | **0.37 / 0.54 / 0.76s** | ~5× faster |
| `/about` — TTFB | 3.03 / 2.93 / 2.91s | **0.40 / 0.38 / 0.38s** | **~7× faster** |

Lighthouse, staging on `fra1`:

| Metric | Home before | Home after | `/wines` before | `/wines` after |
|---|---|---|---|---|
| **Performance** | 81 | **96** | 64 | **84** |
| First Contentful Paint | 1.0s | 1.2s | 1.0s | 1.0s |
| Largest Contentful Paint | 3.2s | **2.5s** | 15.5s | **3.1s** |
| Speed Index | 7.4s | **2.0s** | 7.7s | **1.9s** |
| Time to Interactive | 3.2s | **2.7s** | 15.5s | **3.1s** |
| Total Blocking Time | 260ms | 140ms | 210ms | 400ms |

`/wines` improvement is the two fixes compounding: smaller images (Chunk 0) *and* the region move.

**Caveat on comparability:** staging runs the dev DB / Staging Winery tenant, production the prod DB / Nikalas Marani. Not perfectly like-for-like on data volume — but both databases are in `eu-central-1`, the control was taken at the same moment, and a 7× gap far exceeds any plausible data-size difference. The result is not in doubt.

### Production after the merge (`d1e97a4` on `master`), measured 2026-07-29

Region confirmed flipped on production: `X-Vercel-Id: fra1::fra1::…`.

**Server response — the honest headline, unambiguous and consistent:**

| Page | Before | After |
|---|---|---|
| Home TTFB | 2.92–3.43s | **0.40–0.61s** |
| `/wines` TTFB | 2.95s | **0.39–0.41s** |
| `/about` TTFB | 2.91–3.03s | **0.42–0.46s** |
| Home total load | 5.6–6.2s | **0.49–0.65s** |

**Lighthouse on production — read with care:**

| | Before | After |
|---|---|---|
| `/wines` performance | 64 | **94** |
| `/wines` LCP | 15.5s | **2.7s** |
| `/wines` Speed Index | 7.7s | **1.6s** |
| Home performance | 81 | 78 / 88 / 84 *(3 runs)* |
| Home Speed Index | 7.4s | **1.4–2.0s** |
| Home LCP | 3.2s | 3.2–3.4s |

⚠️ **Two things not to misread here:**

1. **Home's composite score is noise-dominated.** Three consecutive runs gave 78 / 88 / 84, tracking Total Blocking Time (550 / 250 / 340ms) — main-thread JavaScript, entirely unrelated to server region, and sensitive to whatever else the measuring machine is doing. Do not treat any single Home score as a real before/after. Speed Index (7.4s → ~1.6s) is the stable signal on that page.
2. **Lighthouse's mobile preset applies heavy simulated network throttling**, which compresses how much a server-side improvement can show. That's why Home's LCP barely moved (3.2s → 3.3s) while its real TTFB fell by 2.5s. The `curl` table above is the truthful measure of what actually changed; Lighthouse is the better measure for `/wines`, whose problem was payload size, which throttling amplifies.

**Net:** the region fix is a large, real, consistently-measured server-side win. `/wines` additionally gained from the image work. Home's *rendering* profile is unchanged — the remaining Home LCP is hero-image discovery (`Load Delay` was 74% of LCP in the baseline), a separate front-end concern nobody has asked to fix.

## What "good" would look like

- Home TTFB well under 1s (from ~3s)
- Home Lighthouse performance 90+ (from 81)
- `/wines` LCP under 2.5s (from 15.5s, currently 5.7s)
- Local `application-code` well under 500ms (from 1,581ms)

## Related

- [[Plan-Performance]] — the plan, chunks, decisions, and progress log
- [[MultiTenantSiteContent]] — why `force-dynamic` was chosen, and the caching upgrade path
- `FeatureLog.md` #144
