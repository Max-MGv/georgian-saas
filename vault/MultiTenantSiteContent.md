---
tags: [architecture, multi-tenant, site-content, supabase]
generated: 2026-07-22
repo: georgian-saas
branch: master
commit: c4bbaa2
commit_date: 2026-07-21
note: >
  Snapshot accurate as of the commit above. There were uncommitted local
  changes at write-time (Phase 3 Georgian admin-panel translation files) —
  unrelated to this doc's subject, but if something here looks stale,
  check `git log` / `git diff c4bbaa2` on this repo before trusting it.
---

# Multi-Tenant Site Content — Storage & Rendering Flow

Reference doc for how tenant-specific public site content (Home/About/Contact text, backgrounds, uploaded images) is stored and served. Written up after Max asked how the flow works end-to-end + whether the architecture is sound. See `RLS-Architecture.md` for the tenant-isolation mechanism this doc builds on top of.

---

## Where content actually lives

**Not one blob per tenant — row-per-field.**

- **`SiteContent` table** — one row per `(key, locale, tenantId)`. Editing "Home hero subtitle" in English creates/updates one row; the Georgian version of the same field is a *separate* row (`@@unique([key, locale, tenantId])`). A field that's never been edited has no row at all — the page falls back to a hardcoded English default baked into the component (`fallback` prop on `EditableText`).
- **`Setting` table** — same idea (`key` + `tenantId`, `@@unique([key, tenantId])`) for config-shaped values: background image path/x/y/zoom per page, payment details, booking rules, `admin_language`, etc.
- **Supabase Storage** — uploaded images (logos, background photos) are files, not DB rows. Bucket path convention: `backgrounds/{tenantId}/filename.webp`. The DB only ever stores the resulting public URL string, in a `Setting` row.

So a tenant with ~66 editable Site Content fields × 2 languages = up to 132 possible rows, but realistically far fewer — only what's actually been customized away from the English defaults.

---

## When content is generated — every request, not on save

Every public page (`app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx`) has `export const dynamic = 'force-dynamic'`. That means **Next.js re-runs the full server component and re-queries the database on every single page view, for every visitor.** There is no per-tenant build step and no static/ISR caching of the rendered page today.

The only caching that exists is much narrower: `proxy.ts` (middleware) caches **which tenant a domain belongs to + its branding/module flags** (`resolveTenant()`) in an in-memory `Map`, 5-minute TTL. That's identity/branding lookup only — it does *not* cache the actual Site Content rows or the rendered page.

When an admin saves a field via `saveContent()` (`app/actions/siteContent.ts`), it upserts the row then calls `revalidatePath('/', 'layout')`. Since pages are already `force-dynamic`, this call is currently more of a safety net than load-bearing — but it's the exact hook an ISR migration would key off (see "If this ever needs to change" below).

---

## End-to-end flow

```
Browser requests nikalasmarani.vercel.app/about
        │
        ▼
proxy.ts (middleware) reads the Host header
  → resolveTenant(host) looks up Tenant by domain (cached 5 min)
  → stamps request headers: x-tenant-id, x-tenant-brand, module flags, etc.
        │
        ▼
page.tsx (server component) reads x-tenant-id via getTenantId()
  → calls getContentSection('about', locale)   [app/actions/siteContent.ts]
        │
        ▼
withTenantDb(tenantId, ...)                     [lib/db.ts]
  → opens a Postgres transaction
  → SET app.tenant_id = '<this tenant>'          (session var)
  → SET LOCAL ROLE app_user                      (downgrades from superuser)
  → runs the Prisma query inside that transaction
        │
        ▼
Postgres RLS policy on SiteContent enforces:
  "tenantId" = current_setting('app.tenant_id', true)
  → only this tenant's rows are visible to the query at all
        │
        ▼
Rows merged with hardcoded English fallbacks for any unedited field
        │
        ▼
Page renders fresh HTML, sent to browser.
Nothing is cached for the next visitor — the whole cycle repeats.
```

Supabase is doing three distinct jobs in this flow, worth keeping mentally separate:
1. **Postgres** — the `SiteContent`/`Setting` tables + RLS enforcement (the actual multi-tenant data + isolation)
2. **Auth** — admin login sessions (`supabase.auth.getUser()` in `proxy.ts`)
3. **Storage** — uploaded images, isolated by `{tenantId}/` folder prefix in the bucket path

None of the three involve a "build/generate the site" step. It's all read live, per request, per tenant, straight from the DB.

---

## Is this a sound approach? (assessment as of 2026-07-22)

Two separate design decisions are bundled here, and they land differently:

### Shared DB + Postgres RLS for tenant isolation — standard, no real concerns

This is one of the three textbook multi-tenancy patterns (vs. separate-DB-per-tenant, or separate-schema-per-tenant). Shared-tables + RLS is what Supabase itself is built around and recommends, and using *actual* Postgres RLS (not just app-level `WHERE tenantId = X` filtering, which is what a lot of indie SaaS projects settle for) is more rigorous than average. The fail-secure design — `current_setting(..., true)` returns no rows if the session var is ever unset, rather than erroring open — is a deliberate, correct choice. Full mechanism: `RLS-Architecture.md`.

**Would be the wrong call if:** a tenant needed independent backup/restore (harder when rows are interleaved across shared tables vs. a separate DB you can restore standalone), true noisy-neighbor performance isolation, or a compliance requirement demanding physically separate storage. None of that applies to a multi-winery booking platform.

### `force-dynamic` (DB hit on every single page view, zero page caching) — reasonable for now, known tradeoff

Not how most production content sites run at scale — most use ISR or tag-based data caching so a live DB round-trip only happens when content actually changes, not on every visitor. Doing it this way is slower and more DB-load-intensive than necessary for content a winery owner edits maybe once a month.

**Why it's the reasonable choice today:** true per-*domain* (not per-URL-segment) multi-tenancy doesn't fit cleanly into Next's static-generation model — building that correctly is real effort, so starting with straightforward per-request rendering while traffic is low is sane, not premature-optimization-avoidance-gone-wrong.

**The upgrade path, when it's worth doing:** `saveContent()` already calls `revalidatePath()` on every edit — that's literally the trigger ISR wants. Dropping `force-dynamic` and letting pages cache until an edit revalidates them would keep the "edits show up immediately" behavior *and* add free caching + lower DB load for every request in between. Not urgent at current (winery website) traffic levels — but it's the first lever to pull if a tenant ever gets a real traffic spike, or Supabase connection load becomes a concern.

> **⚠️ Update 2026-07-29 — this was planned, then deliberately NOT built.** When the site was reported as slow, `force-dynamic` was the prime suspect and a full `unstable_cache` plan was written and approved. Measurement then showed the real cause was elsewhere entirely: the Vercel functions ran in `iad1` while the databases live in `eu-central-1`, so the cost was ~90ms of Atlantic latency per round trip, not the absence of caching. Pinning the region took Home TTFB from ~2.93s to ~0.40s and the caching work was dropped as solving a problem that no longer existed.
>
> What this means for the paragraph above: **it remains true as a *load* argument, but not as a *latency* one.** `force-dynamic` is a fine default at this traffic level. If caching is ever revisited, two findings from that investigation are worth reusing: Next 16 forbids `headers()`/`cookies()` inside a cache scope (which is why `getAllSettings()`/`getAllContent()` take `tenantId` as an explicit argument today), and any cache key **must** include `tenantId` or a cache hit will serve one tenant's content to another. Full record: [[Plan-Performance]].

---

## If this ever needs to change

- **Adding ISR**: replace `export const dynamic = 'force-dynamic'` with either a `revalidate` interval or (better, since edits are the only thing that should invalidate) tag-based caching — `fetch`/`unstable_cache` with a tag per tenant+section, revalidated via `revalidateTag()` inside `saveContent()`/`deleteContent()` instead of (or alongside) the current `revalidatePath()`.
- **Scaling concern to watch**: the in-memory tenant-branding cache in `proxy.ts` is per-serverless-instance on Vercel — different concurrent instances don't share it, so a tenant/domain change can be visible on some instances before others for up to 5 minutes. Fine for branding; would matter more if something security-sensitive were ever cached there.
- **Adding a new tenant-scoped table**: follow the checklist in `RLS-Architecture.md`, not this doc.
