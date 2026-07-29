---
tags: [plan, performance, caching]
---

# Plan: Site Performance

**Status:** Chunk 0 done (uncommitted), Chunks 1–5 awaiting approval
**Started:** 2026-07-29
**Trigger:** Max: "website is very slow, takes long to load — run industry-standard tests and build a report on what's causing it"

---

## The problem, measured

Ran Lighthouse + direct network timing against live production (`nikalasmarani.vercel.app`), 2026-07-29. Two independent causes:

| | Cause | Status |
|---|---|---|
| **A** | 6 wine product photos were camera-resolution originals (2991×2990px, ~2.15MB) shown in a 362×176px thumbnail. 98% wasted bytes. LCP on `/wines` = 15.5s | ✅ Fixed (Chunk 0) |
| **B** | Every public page is `force-dynamic` with zero caching → ~24 separate DB transactions per page load → ~3s before the page starts arriving, on every visit | ⬜ Chunks 1–5 |

### The clinching evidence for B

Local dev server's own per-request breakdown, warm, against the dev DB:

```
HEAD / 200 in 1731ms (next.js: 102ms, proxy.ts: 48ms, application-code: 1581ms)
```

- **next.js: 102ms** — framework overhead is fine
- **proxy.ts: 48ms** — tenant/domain resolution is fine (already cached, see below)
- **application-code: 1581ms** — this is the DB reads. This is the entire problem.

Not cold starts. Not the framework. Not tenant lookup. Purely the cost of re-reading the database on every single request.

### What is NOT the problem (checked, ruled out)

- **Domain → tenant lookup** — already cached in `proxy.ts:30` (`tenantCache`, Map, 5-min TTL). 48ms. Max asked whether tying URL→tenant would help; it's already done.
- **RLS / `withTenantDb`** — the per-transaction `SET LOCAL ROLE` handshake does add 2 extra round trips per query, but this is the tenant-isolation security boundary. **Deliberately not touching it for a perf win.**
- **Page weight / JS bundle** — Lighthouse: 454KB total on Home, 192 DOM elements, CLS 0, cache policy fine. All healthy.

---

## Key technical constraint (discovered 2026-07-29, shapes everything below)

Per `node_modules/next/dist/docs/.../unstable_cache.md`:

> Accessing uncached data sources such as `headers` or `cookies` inside a cache scope is not supported. If you need this data inside a cached function use `headers` outside of the cached function and pass the required uncached data in as an argument.

**Why this matters here:** `getTenantId()` (`lib/tenant.ts`) reads `headers()`. Every single one of `getSetting()`, `getContentMap()`, `getContentSection()` calls it internally. So **none of them can be wrapped in a cache as currently written.**

They must first be refactored to accept `tenantId` as an explicit argument. That refactor is Chunk 1, and it is required regardless of which caching mechanism is chosen — so it is never wasted work.

### 🔒 Security-critical detail

**The cache key MUST include `tenantId`.** If it doesn't, Winery A's cached settings/content would be served to Winery B. This is the one place in this plan where a mistake causes a cross-tenant data leak rather than just a stale value. Every cached function takes `tenantId` as its first argument specifically so it lands in the key.

RLS still protects the *database* on every cache miss — but a cache hit never reaches the database at all, so the cache key is the only thing standing between tenants. Must be explicitly verified in Chunk 4.

---

## ⚠️ ROOT CAUSE FOUND 2026-07-29 — the plan below is largely superseded

**The Vercel function runs in `iad1` (Washington DC). Both databases are in `eu-central-1` (Frankfurt).** Every DB round trip crosses the Atlantic.

Evidence:
- `curl -D -` on both prod and staging returns `X-Vercel-Id: fra1::iad1::…` — edge in Frankfurt, **compute in `iad1`**
- No region pinned anywhere: no `vercel.json`, no `regions` in `next.config.ts` → Vercel's US-East default applies
- `DATABASE_URL` on both environments points at `aws-{0,1}-eu-central-1.pooler.supabase.com`

Direct measurement (local machine → dev DB, Georgia → Frankfurt) proving the queries themselves are irrelevant:

| Measurement | Time |
|---|---|
| Raw `SELECT 1` (pure round trip) | ~360ms |
| Plain transaction, no RLS handshake | 345ms |
| `withTenantDb` doing only `SELECT 1` | **~680ms** |
| Real `findMany` (36 rows) | ~666ms |
| Real `findMany` + include (companies+prices) | ~819ms |
| 8 transactions in parallel | 1,440ms |
| 8 transactions sequentially | 4,962ms |

**Two conclusions:**
1. **A real query costs barely more than an empty one** — it is ~100% latency, ~0% database work. Optimizing query *count* or *shape* cannot fix this.
2. **The RLS handshake doubles every transaction** (345ms → 680ms), because `set_config` and `SET LOCAL ROLE` are two extra *sequential* round trips. On a high-latency link that is the single most expensive thing `withTenantDb` does.

### What this means for the plan

- **Chunk 1's premise was wrong.** The ~24 queries were already running in parallel via `Promise.all`, so collapsing them to ~8 cut database *load* 3× but left wall-clock unchanged — measured before/after on localhost: 1,581ms → ~1,620ms. The refactor is still correct and still the prerequisite for caching, but it is not the win it was scoped as.
- **The fix is to move the compute to the data**, not to avoid the compute. Pin the function region to `fra1` and every round trip goes from ~90ms to ~1–2ms.
- **Chunks 2–3 (caching) may become unnecessary.** At ~2ms per round trip, 8 transactions × ~4 round trips ≈ 64ms instead of ~3s. Re-measure after the region change before building any caching.

### New Chunk R — pin the Vercel function region to `fra1`

**Prepared 2026-07-29, not yet deployed.** `saas/vercel.json` (NEW):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"]
}
```

**File location matters:** it must be `saas/vercel.json`, not repo-root. This repo has `saas/` + `dashboard/` + `vault/` with no root `package.json`, so Vercel's Root Directory is `saas` — and `vercel.json` is read relative to the Root Directory. At the repo root it would be silently ignored.

**Plan availability — checked:** Vercel's docs document `regions` as ordinary project configuration with no plan gate for a *single* region. The only region feature explicitly marked Enterprise-only is `functionFailoverRegions` (not used here). Multi-region is the Pro/Enterprise feature; pinning one region is not. Caveat: no explicit "region limits by plan" page was found, so this is inferred from the absence of a stated restriction rather than a positive confirmation — the deploy itself will settle it.

**Verification after deploy:** `curl -s -D - -o /dev/null <url> | grep -i x-vercel-id` should change from `fra1::iad1::…` to `fra1::fra1::…`. Then re-measure TTFB.

Also better for the actual users: the client and their customers are in Georgia, far closer to Frankfurt than to Washington DC.

**Blast radius:** applies to Preview *and* Production deployments, so staging exercises the real change. Fully reversible — delete the file. No data, schema, or application-code involvement.

---

## The fork: which caching mechanism *(only relevant if Chunk R doesn't solve it)*

Next.js 16.2.6. Two options, and they are not close.

### Option A — `use cache` (the blessed Next 16 path)
Requires `cacheComponents: true` in `next.config.ts`.

- ✅ Non-deprecated, the direction Next is going
- ❌ **App-wide behavior change.** Partial Prerendering becomes the default. Every route that touches `cookies()`/`headers()` without a `<Suspense>` boundary throws a build error (`Uncached data was accessed outside of <Suspense>`)
- ❌ This app reads cookies/headers *everywhere* — every public page (`site_locale` cookie), every page (`x-tenant-id` header), the entire admin panel (auth). That's a migration across 25+ files
- ❌ Huge blast radius for what is meant to be a performance fix on a live client site

### Option B — `unstable_cache` + `revalidateTag` (the previous model) ← **RECOMMENDED**

- ✅ No config change, no PPR, no forced Suspense refactor anywhere
- ✅ Scoped precisely to the 2–3 functions we want cached
- ✅ Fully reversible — delete the wrapper, behavior returns to today's
- ✅ On Vercel this cache is shared across serverless instances (unlike the per-instance `proxy.ts` Map), so the benefit is real in production
- ⚠️ Marked in the Next 16 docs as "replaced by `use cache`" — still functional, but on a deprecation path
- ⚠️ Means a future migration to Option A eventually

**Recommendation: Option B.** Rule 0 says production is a live site with real customer bookings. A contained, reversible change beats a framework-wide migration for a speed fix. Chunk 1's refactor is needed for both options, so choosing B now costs nothing if we migrate to A later.

---

## Chunks

Dependencies are strict — each chunk needs the one before it.

| # | Chunk | Depends on | Status | Ships independently? |
|---|---|---|---|---|
| 0 | Resize wine product photos | — | ✅ Done, uncommitted | Yes |
| 1 | Refactor data functions to take `tenantId`/`locale` as arguments | — | ⬜ Awaiting approval | Yes (no behavior change) |
| 2 | Cache the Settings reads | 1 | ⬜ | Yes |
| 3 | Cache the Site Content reads | 1 | ⬜ | Yes |
| 4 | Verify: perf gain + tenant isolation + staleness | 2, 3 | ⬜ | — |
| 5 | *(Optional)* Cache the remaining Home-page queries | 4 | ⬜ | Yes |

---

### Chunk 0 — Wine photos ✅ DONE

Resized all 6 files in `saas/public/images/products/` to 750px max dimension (covers 2× retina at the largest real display context) with max PNG compression via `sharp`, alpha preserved. Same filenames, same paths → zero code or DB changes needed.

**Result: 7.5MB → 1.06MB (86% smaller).** Biggest: `qisi.png` 2205KB → 172KB.

Verified: visually compared original vs. resized (no discernible quality loss); confirmed serving correctly through the local dev server at 750×750.

**Status: uncommitted on `staging`.** 6 modified files.

---

### Chunk 1 — Refactor data functions to accept explicit arguments

**No caching yet. No behavior change. Pure plumbing.** This is the prerequisite that makes caching possible at all (see the constraint above).

- `getSetting(key)` → add `getSettingCached(tenantId, key)` style variants that take `tenantId` explicitly instead of calling `getTenantId()` internally
- Same for `getContentMap(section, locale)` / `getContentSection(section, locale)`
- Callers read `getTenantId()` themselves (they're server components, they can) and pass it down
- **The existing `getSetting()` signature stays** — 102 call sites across 25 files, most of which we are deliberately not touching

**Why it ships alone:** identical behavior, so it can go to staging and be confirmed harmless before any caching is layered on.

**Verify:** `tsc --noEmit` clean; public site + admin behave identically; timing unchanged (~1.5s — no improvement expected yet, that's the point).

---

### Chunk 2 — Cache the Settings reads

Wrap the Chunk 1 functions in `unstable_cache`, keyed on `tenantId` + key, tagged `settings-${tenantId}`. Add `revalidateTag('settings-' + tenantId)` to `updateSetting()`.

**Scope decision needed from Max — see Approval Gate 2.** Recommended: cache only the *public site* read paths. Deliberately leave uncached:
- `createBooking.ts` / `orders.ts` — these read settings to compute **prices**. A stale price is a real-money bug, not a cosmetic one. Not worth the risk for a path that runs once per booking, not once per pageview.
- The admin Settings page itself — admin should always see ground truth.

**Verify:** change a setting in admin → confirm it appears on the public site immediately (not after 5 minutes).

---

### Chunk 3 — Cache the Site Content reads

Same pattern for `getContentMap`/`getContentSection`, keyed on `tenantId` + section + locale, tagged `content-${tenantId}`. Add `revalidateTag` to `saveContent()` and `deleteContent()`.

Both already call `revalidatePath('/', 'layout')` — the invalidation hook already exists and is already wired to every edit. This chunk adds the tag alongside it.

**Expected: this is the bigger win of the two** — site content is fetched per section per locale on every page.

**Verify:** edit text in the Site Content editor → appears on the live page immediately, both EN and KA.

---

### Chunk 4 — Verification

1. **Perf:** re-run Lighthouse on Home + `/wines`, compare against the 2026-07-29 baseline in this doc. Re-run the `curl` TTFB test.
2. **🔒 Tenant isolation:** load the staging tenant and a second tenant, confirm neither sees the other's cached settings/content. **This is the one that matters most.**
3. **Staleness:** edit a setting and a content field, confirm both appear immediately on the public site.
4. **Locale:** confirm EN and KA cache separately and don't bleed into each other.

---

### Chunk 5 — *(Optional)* Remaining Home-page queries

The other per-request queries on Home: companies (with price tiers), menu items, masterclass items, blocked dates. Lower-churn data, same caching pattern. Only worth doing if Chunks 2–3 don't get the number low enough.

---

## Tradeoffs, stated plainly

| Tradeoff | Assessment |
|---|---|
| **Staleness risk** | The main new risk class. If a cache key or invalidation is wrong, an admin edits something and doesn't see it change. Mitigated by tag-based invalidation on every save + explicit staleness testing in Chunk 4. |
| **🔒 Cross-tenant leak risk** | Low but severe if wrong. Entirely controlled by including `tenantId` in every cache key. Explicitly verified in Chunk 4. |
| **Deprecated API** | `unstable_cache` is superseded by `use cache` in Next 16. Accepting a future migration in exchange for avoiding an app-wide one today. |
| **Partial fix** | Chunks 2–3 remove the settings + content queries. The rest (companies, menu, masterclass, blocked dates) stay per-request unless Chunk 5 runs. Expect the ~3s to drop substantially, not to zero. |
| **More moving parts** | A cache is a second place where truth lives. Genuinely more complex than today's "always read fresh." That simplicity is what we're trading away for speed. |
| **Not touching `withTenantDb`** | Leaving a real perf win (2 redundant round trips per query, app-wide) on the table on purpose, because it's the security boundary. Right call, but worth naming as a deliberate cost. |

---

## Approval gates

**All decided 2026-07-29 — Max approved every recommendation as proposed.**

| # | Decision | Outcome |
|---|---|---|
| 1 | Option B (`unstable_cache`) over Option A (`cacheComponents` migration)? | ✅ **Option B.** Contained and reversible vs. app-wide migration on a live client site. |
| 2 | Scope: cache public-site reads only; leave booking/pricing and admin Settings uncached? | ✅ **Public pages only.** A stale price is a real-money bug; that path runs once per booking, not once per pageview. |
| 3 | Ship Chunk 0 (wine photos) now on its own, or bundle? | ✅ **Shipped separately** — `31f4d62` on `staging`, 2026-07-29. |
| 4 | Chunk-by-chunk with a checkpoint after each? | ✅ **Chunk-by-chunk**, Chunk 1 to staging first since it's behavior-neutral. |

---

## Progress log

| Date | Chunk | What happened |
|---|---|---|
| 2026-07-29 | — | Lighthouse + curl audit against live prod. Two causes found. Report delivered as artifact + raw Lighthouse HTML. |
| 2026-07-29 | 0 | Wine photos resized, 7.5MB → 1.06MB. Verified locally. Uncommitted on `staging`. |
| 2026-07-29 | — | Read Next 16.2.6 caching docs. Found the `headers()`-inside-cache constraint. Confirmed `cacheComponents` not enabled; `unstable_cache` available but deprecation-flagged. Plan written. |
| 2026-07-29 | 0 | **Shipped to `staging`** as `31f4d62` (images only — the in-flight `MigrationNotes`/`MyToDo` edits from the payment-migration session were deliberately left uncommitted, not swept in). Awaiting Max's staging check before merging to `master`. |
| 2026-07-29 | — | All 4 approval gates decided (see above). Chunk 1 cleared to start. |
| 2026-07-29 | 0 | **Shipped to production.** Max confirmed the staging check ("photos look nice and crisp"). Fast-forward merge `staging`→`master` (`31f4d62`, images only — verified no schema/migration/env changes), pushed, switched back to `staging`. Verified live on `nikalasmarani.vercel.app`: all 6 images at new sizes, **7,744,921 → 1,108,015 bytes (86% smaller)**, `/wines` 200 OK. |
| 2026-07-29 | 1 | Built: `lib/settings.ts` (defaults + sync resolvers), `getAllSettings(tenantId)`, `getAllContent(tenantId, locale)`, and rewired `(site)/layout.tsx` + `(site)/page.tsx`. Home page went ~24 transactions → ~8. `tsc` clean. **But wall-clock did NOT improve** (1,581ms → ~1,620ms) — which is what triggered the root-cause investigation above. Code is sound and kept (3× less DB load, prerequisite for caching), but it is not a fix on its own. **Uncommitted.** |
| 2026-07-29 | R | **Root cause identified** — compute in `iad1`, database in `eu-central-1`. See the section at the top of this doc. |
| 2026-07-29 | R | **Shipped to `staging` (`d1e97a4`) and measured — decisive.** Region confirmed flipped (`fra1::iad1` → `fra1::fra1`). Home TTFB **2.93s → 0.40s (7×)**, total **5.8s → 0.5s (10×)**. Lighthouse Home **81 → 96**, `/wines` **64 → 84**, `/wines` LCP **15.5s → 3.1s**. Production measured in the same minute as a control (still `iad1`, still ~2.93s), so attribution is clean. Full table in [[Perf-Baseline-2026-07-29]]. **Not yet on `master`** — awaiting Max. |
| 2026-07-29 | 2–3 | **Dropped.** Caching was scoped to remove a ~3s DB wait that no longer exists. Revisit only if traffic grows enough that DB *load* (not latency) becomes the constraint. |
| 2026-07-29 | 1 | **Verified and kept.** A/B tested properly: captured rendered output with the refactor, `git stash`ed it, captured the original, diffed. All 6 page/locale combinations (home EN/KA/no-cookie, about EN/KA, contact KA) **byte-identical** in visible text. Caught a gap in my own first pass — the text normalizer strips `<script>`, which is exactly where client-component props are serialized — so re-ran against the raw RSC payload: prices (50/100₾), guest minimums, `locale`, `showCompanyPrice`, `enhancedEnabled`, `hideCompanyDropdown` and the companies/menu/masterclass/blockedDates/formContent keys all identical. `enhancedEnabled: true` on this tenant, so the enhanced company-booking path was genuinely exercised. `tsc` 0 source errors. **Not directly tested:** admin edit mode (needs an authed session) — covered transitively since it reads the same content map proven equivalent above, and the `isAdmin` line is unchanged. Kept on the strength of the DB-load argument, not latency. |
| 2026-07-29 | 0 | **Staging deploy verified.** All 6 images serve at the new sizes (byte-identical to local). Lighthouse on staging `/wines`: **LCP 15.5s → 5.7s (−63%)**, Time to Interactive 15.5s → 6.0s, perf score 64 → 67. Score moved only modestly because the remaining bottleneck is now Finding B (the ~3s DB wait), which Chunks 1–3 address. ⚠️ Caveat: staging runs the dev DB / Staging Winery tenant, so this is not a perfectly like-for-like comparison against the prod baseline — the image-driven LCP improvement is the trustworthy part, TTFB less so. Awaiting Max's own staging check before `master`. |

---

## Comments / open questions

- **Baseline to beat** (live prod, 2026-07-29): Home TTFB 2.92–3.43s, full load 5.59–6.19s, Lighthouse perf 81. `/wines` TTFB 2.95s, Lighthouse perf 64, LCP 15.5s. About TTFB 3.03s.
- Chunk 0 alone should already have moved `/wines` substantially — worth re-measuring after it deploys, *before* starting Chunk 1, to see how much of the `/wines` problem was purely the images.
- If Chunks 2–3 don't get Home under ~1s TTFB, the remaining cost is the non-settings queries → Chunk 5, or reconsider Option A.
- Related prior art: `MultiTenantSiteContent.md` "If this ever needs to change" section already sketched the tag-based caching path. This plan is that idea, with the Next 16 constraint filled in.

---

## Related

- [[Perf-Baseline-2026-07-29]] — **frozen "before" measurements**; every comparison in this plan is against that snapshot
- [[MultiTenantSiteContent]] — why `force-dynamic` was chosen originally, and the upgrade path
- [[RLS-Architecture]] — the tenant-isolation mechanism this plan must not compromise
- `FeatureLog.md` #144
