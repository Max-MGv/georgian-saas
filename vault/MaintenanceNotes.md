---
tags: [maintenance, dependencies]
---

# Maintenance Notes

Structural dependencies and coupled code that must be kept in sync. Read this before any non-trivial change to the booking form, admin site-content editor, or public-site layout.

---

## 1. BookingForm ↔ Admin "Booking Form" visual panel

**What the dependency is:**
`saas/components/BookingForm.tsx` (the public-facing booking form) and the admin Site Content editor's "Booking Form" tab (`saas/app/admin/content/ContentClient.tsx` → `FieldsPanel` with section `'form'`) are visually independent but share the same SiteContent key names.

The admin panel lets the winery edit the labels (e.g. "First Name", "Request Booking", "48-hour cancellation policy"). Those labels are stored in the `SiteContent` table under keys like `form_first_name`, `form_submit`, `form_cancel_policy`, etc. `BookingForm.tsx` reads them at render time via `formContent` prop.

**If you change the form's visual structure** (add a new field, rename a section, add a new label):
- Add the new key + fallback to `FIELDS.form` in `ContentClient.tsx` so it appears in the admin panel
- Make sure `BookingForm.tsx` reads that key via the `fc(key, tKey)` helper (line ~48: `formContent[key] || t(locale, tKey)`) instead of calling `t()` directly
- Seed the new key in `saas/scripts/seed-ka.ts` for the Georgian locale — a key with no `ka` row there makes the content-locale KA toggle a silent no-op for that field (this exact bug was issue #131 part 1: 20 fields existed in `FIELDS.form` for months with zero `ka` rows)

**If you remove a field from the form:**
- Remove its `FIELDS.form` entry in `ContentClient.tsx` to avoid orphaned admin controls
- Remove any DB seed rows for that key if present

**Two variants — Simple vs. Detailed (added for #131 part 2, 2026-07-23):**
`BookingForm.tsx` has an `isEnhanced` branch (real toggle = `enable_enhanced_company_booking` setting + a company booking selected) that adds: split guest counts (Tasting/Lunch/Free-Guide, replacing the single "Number of Guests" field), a Hot Dish Selection block, a Masterclass Add-ons block, and Food Notes (Food Notes is **only** rendered inside `isEnhanced` — never in the simple/individual form). `BookingFormVisualPanel.tsx` mirrors both variants behind a `variant: 'simple' | 'detailed'` prop, toggled independently of the tenant's live setting so admins can preview/edit either one at any time. Only the 3 detailed-variant **section headers** are tenant-editable (`form_guest_counts_header`/`form_hot_dish_header`/`form_masterclass_header`) — deliberately not the guest sub-labels, dropdown option text, or masterclass item rows, since those are tied to or populated by other admin-managed data (`minGuestsTasting`/`minGuestsTastingLunch` settings, `MenuItem`/`MasterclassItem` records at `/admin/menu-items` and `/admin/masterclass`), not SiteContent. If you add a 4th detailed-only section, decide the same "is this a fixed label or backed by other admin data" question before deciding whether it gets a `FIELDS.form` entry.

**Files involved:**
- `saas/components/BookingForm.tsx` — public form, reads labels via the `fc()` helper (falls back to `lib/t.ts` when no SiteContent override exists)
- `saas/app/admin/(panel)/content/ContentClient.tsx` — `FIELDS.form` array defines which keys appear in admin panel; also owns the Simple/Detailed toggle state (`formVariant`) for the Booking Form tab
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — visual replica of the form used in the admin editor, takes a `variant` prop; layout must stay in sync with `BookingForm.tsx`
- `saas/scripts/seed-ka.ts` — Georgian locale seed data; run with `npx tsx scripts/seed-ka.ts` from `saas/` after adding new `form_*` keys

---

---

## 2. Admin route group structure — `(panel)` vs root

**What the structure is:**
`app/admin/` has two distinct zones:
- `app/admin/login/` — standalone login page; inherits the root pass-through `app/admin/layout.tsx`; **no nav bar**
- `app/admin/(panel)/` — all other admin pages (orders, companies, settings, etc.); inherits `app/admin/(panel)/layout.tsx` which renders the full nav bar with logo, nav links, logout

**Why it matters:**
If you add a new admin page that should have the nav bar, it must go inside `app/admin/(panel)/`. If you put it at `app/admin/mynewpage/` it will get a bare page with no nav.

If you add a new auth-related page (e.g. forgot-password, magic-link callback) that should be standalone, put it alongside `login/` at the root admin level.

**The `(panel)` name is invisible to Next.js routing** — `/admin/orders` still resolves to `app/admin/(panel)/orders/page.tsx`. Route group names in parentheses never appear in the URL.

---

## 3. `prisma db push` on Windows — stop dev server first

**What the dependency is:**
On Windows, Node locks `.dll.node` binary files while they are in use. `prisma generate` (which runs automatically at the end of `prisma db push`) writes a temp file then renames it over the existing Prisma client binary. That rename fails with `EPERM` if the dev server is running, because the server has the binary loaded and locked.

**What goes wrong if you forget:**
- Schema is pushed to the DB ✅
- Prisma client is NOT regenerated ❌
- The generated client is left in an inconsistent/partial state
- Dev server crashes on every request trying to use it
- Each crash leaks an open Postgres connection
- After 9 leaked connections the pool is exhausted → `connection pool timeout` errors for every page

**The rule:**
Before running `prisma db push` or `npx prisma generate`:
1. Stop the dev server (Ctrl+C in the terminal running `npm run dev`)
2. Run `prisma db push`
3. Confirm output ends with `✔ Generated Prisma Client`
4. Restart the dev server

This is Windows-only. On Mac/Linux the rename succeeds even with the file open, so this step is not needed there. Does not affect production (Vercel bakes the client at build time, never replaces it at runtime).

---

## 4. Admin panel is always scoped to ONE tenant — never "all tenants," not even for super_admin

**What the dependency is:**
`/admin/*` pages (Orders, Companies, Statistics, Wine Orders, etc.) always show exactly one tenant's data — whichever tenant the current *domain* resolves to. This is true regardless of who's logged in, including `super_admin`.

`proxy.ts` resolves the tenant from the `Host` header on every request and forwards it as `x-tenant-id`. Every admin page reads that single ID and filters its DB queries by it. The `super_admin` role only changes the **access check** — "is this user allowed to view this tenant's admin" — it does not aggregate data across tenants. There is no cross-tenant view anywhere in the app today.

**The localhost trap:**
`localhost` isn't a real tenant domain, so `resolveTenant()` falls back to a fixed `DEFAULT_TENANT_ID` env var instead of a domain lookup. (Since #123, 2026-07-18, this fallback applies **only** to localhost — any other unrecognized domain resolves to no tenant at all and shows the `/welcome` placeholder. Previously `tenantId` fell back to `DEFAULT_TENANT_ID` on every unknown domain while branding/module flags fell back to generic defaults, causing a split-brain state.)
```ts
if (isLocal) {
  const defaultId = process.env.DEFAULT_TENANT_ID
  if (defaultId) tenant = await db.tenant.findUnique({ where: { id: defaultId } })
}
```
`DEFAULT_TENANT_ID` in `.env` was originally set to **Nikalas Marani's** ID; since the #79 dev/staging environment work (2026-07-23), local `.env` points at the **dev** DB and `DEFAULT_TENANT_ID` there is **Staging Winery**'s ID instead (confirmed directly 2026-07-26). So on `localhost:3000`, every admin page currently shows Staging Winery's data — for any logged-in user, super_admin or not. This is easy to mistake for "super_admin sees everything," which it does not. To locally preview a different tenant's admin, you'd need to either change `DEFAULT_TENANT_ID` or give that tenant a real resolvable domain (`winery2.local` currently has no hosts-file entry, so it isn't reachable locally — see `SessionLog.md` 2026-07-17 session 3).

**Files involved:**
- `saas/proxy.ts` — `resolveTenant()`, the `DEFAULT_TENANT_ID` fallback
- Every page under `saas/app/admin/(panel)/` — reads `x-tenant-id` via `getTenantId()`, scopes all queries to it

---

## 5. Wine name (EN/KA) — resolve through `wineDisplayName()`, don't read `wine.name` directly on customer-facing surfaces

**What the dependency is:**
`Wine` has two name fields: `name` (required, English/canonical) and `nameKa` (optional, Georgian override). `saas/lib/wineName.ts` exports `wineDisplayName(wine, locale)`, which returns `nameKa` when the locale is `'ka'` and `nameKa` is non-empty, otherwise falls back to `name`.

**Where resolution happens (once, server-side):** `saas/app/(site)/wines/page.tsx` resolves the name before it ever reaches the client — the flattened wine list handed to `WineCatalogueClient` already has the correct string in its `name` field. From there it flows unchanged into the cart, the order-summary drawer, the `submitWineOrder` payload, and `WineOrderItem.wineNameSnapshot`. **If you add a new customer-facing surface that reads wine names from the DB directly** (a new page, an email template, a CSV export), route it through `wineDisplayName()` too — reading `wine.name` straight from Prisma will silently ignore any Georgian names admins have entered.

**Where it doesn't apply:** the admin panel (`WinesClient.tsx`) always shows/edits the raw `name`/`nameKa` pair directly — there's no resolution there, since the admin needs to see and edit both values, not a resolved single string.

**Files involved:**
- `saas/lib/wineName.ts` — the resolver
- `saas/app/(site)/wines/page.tsx` — the one place resolution happens for the live app
- `saas/app/admin/(panel)/wines/WinesClient.tsx` — admin editor, EN/KA toggle on the Name field
- Full design + what's still English-only on the public wines page: `Plan-BilingualWineName.md`

**If you ever want a real cross-tenant reporting view** (e.g. "total revenue across all clients" on the super-admin Tenants page), that has to be built explicitly — it doesn't fall out of the existing per-tenant admin pages.

---

## 6. Legal page content — `lib/legalContent.ts` is not live-linked to already-seeded tenants

**What the dependency is:**
`saas/lib/legalContent.ts` (`LEGAL_CONTENT_EN`/`LEGAL_CONTENT_KA`) is the source text for the 3 legal documents (Feature #128), but it's only consulted at two moments: as the English code-fallback in `ContentClient.tsx` (shown only when a tenant has no DB row for that key), and when a tenant's rows are first created — either automatically in `createTenant()` for new tenants, or by running `scripts/seed-legal-content.ts` once for existing ones. Once a `SiteContent` row exists for a tenant, that row is what renders — editing `legalContent.ts` afterward does **not** retroactively change it.

**What this means in practice:** if the legal wording needs a correction after tenants already have it seeded (e.g. the native Georgian/legal review flagged in `Plan-LegalPages.md` turns up a needed fix), editing the constants file alone isn't enough — you also need to either re-run the backfill script after clearing the affected rows for each tenant (loses any tenant-specific edits an admin may have made in the meantime), or push the correction through each tenant's admin panel by hand. There is no "push this update to everyone" mechanism, by design — the same reason `EditableText` fallback edits never retroactively touch existing tenant rows for any other content field either.

**Files involved:**
- `saas/lib/legalContent.ts` — the source text
- `saas/app/actions/superAdmin.ts` — `createTenant()`'s seed-on-creation hook
- `saas/scripts/seed-legal-content.ts` — the create-only backfill for existing tenants
- Full feature reference: `Features/Feature 128 - Legal Pages.md`

---

## 7. `EditableLongText` duplicates `EditableText`'s save/cancel/reset logic — not a shared base

**What the dependency is:**
`components/EditableLongText.tsx` (textarea-based, used only by the Legal tab) was built as a parallel implementation of `components/EditableText.tsx` (contentEditable-based, used everywhere else), not a shared abstraction — same Save/Cancel/Reset behavior and the same `saveContent`/`deleteContent` server actions underneath, but two separate component bodies.

**What this means in practice:** a behavior change to `EditableText.tsx` (e.g. the save button's pending state, the reset confirmation flow, or the `adminT` key names it reads) will not automatically apply to `EditableLongText.tsx` — it has to be updated in both places by hand if you want them to stay in sync. Deliberate tradeoff at the time (the two components' actual DOM/interaction needs — contentEditable span vs. textarea — are different enough that a shared base would have been an early abstraction over two use cases, not a proven pattern yet).

---

## 8. `saas/vercel.json` must stay in `saas/`, not the repo root — and it is load-bearing for site speed

**What the dependency is:**
`saas/vercel.json` pins Vercel Function execution to `fra1` (Frankfurt), matching the `eu-central-1` Supabase projects. Without it, Vercel defaults to `iad1` (Washington DC) and **every database round trip crosses the Atlantic** — which is exactly what made the whole site take ~3s to respond before 2026-07-29.

**The trap:** this repo has `saas/` + `dashboard/` + `vault/` and **no root `package.json`**, so Vercel's Root Directory is `saas`. `vercel.json` is read *relative to the Root Directory*. Moved to the repo root, it is **silently ignored** — no error, no warning, the site just gets slow again.

**What this means in practice:**
- Don't relocate, rename, or "tidy" this file into the repo root.
- If page loads ever regress to multiple seconds, check `X-Vercel-Id` before investigating anything else:
  ```bash
  curl -s -D - -o /dev/null https://nikalasmarani.vercel.app/ | grep -i x-vercel-id
  ```
  Expected `fra1::fra1::…`. A second segment of `iad1` means the pin is gone.
- If the Supabase projects are ever moved to another region, this file must move with them.

Background and measurements: [[Plan-Performance]], [[Perf-Baseline-2026-07-29]].

---

## 9. `getAllSettings()` returns payment details — server-only, never hand the map to a client component

**What the dependency is:**
`app/actions/settings.ts` exposes two readers, and they are not interchangeable:
- `getSetting(key)` — one key, resolves the tenant internally. Right choice for the ~100 call sites needing one or two settings.
- `getAllSettings(tenantId)` — the tenant's **entire** settings map in one query. Used by the public pages that need many.

**The risk:** that map includes `payment_iban`, `payment_personal_number`, `payment_bank_code`, and `payment_recipient_name`. Passing it wholesale into a client component would serialize the winery's bank details into the page HTML for every visitor. The old per-key pattern made that mistake nearly impossible; the batch version makes it a one-liner.

**What this means in practice:**
- Read the specific keys you need out of the map and pass **those** as props — the way `(site)/page.tsx` and `(site)/layout.tsx` already do. Never `<Component settings={settings} />`.
- Don't reimplement `getSetting()` on top of `getAllSettings()`. Uncached, that would make every single-key read fetch the whole table — strictly worse than today.
- `getAllContent(tenantId, locale)` follows the same shape (all sections, one query) but carries no secrets.

Both take `tenantId` explicitly rather than calling `getTenantId()` (which reads `headers()`) — that was a prerequisite for wrapping them in a cache. Caching was ultimately **not** built (see [[Plan-Performance]]), but the signature is deliberate and worth keeping if it ever is.

---

## 10. `test-rls.ts` silently skips its cross-tenant tests on a one-tenant database

**What the dependency is:**
`scripts/test-rls.ts` is the 21-test isolation suite referenced throughout [[RLS-Architecture]]. Its section 4, "Cross-tenant isolation", is the part that actually proves RLS works — and it **skips itself** when the database contains fewer than two tenants, printing `⚠️ Cross-tenant tests skipped (only 1 tenant in DB)` and still reporting a clean pass.

The dev database normally holds exactly one tenant (Staging Winery). So the everyday result of running the suite is a green "18 passed, 0 failed" **in which nothing cross-tenant was checked at all**.

**Why it matters:** the RLS checklist's step 7 is "verify with `check-rls.ts`". `check-rls.ts` only confirms a policy *exists* and RLS is *enabled* — it does not exercise it. If a new table's policy were subtly wrong (wrong column, wrong `current_setting` key, missing `WITH CHECK`), both scripts would still come back green on the dev DB. Discovered 2026-07-29 while adding the `Payment` table.

**What to do when adding a tenanted table:** don't rely on the green tick. `scripts/test-payment-rls.ts` is the pattern to copy — it stands up two throwaway tenants, writes a row under each, and asserts both directions (read by direct id returns `null`; cross-tenant `updateMany` affects 0 rows), then deletes them. Roughly 40 lines, and it's the only thing that actually proves the new policy holds.

**Files involved:**
- `saas/scripts/test-rls.ts` — the suite with the conditional skip
- `saas/scripts/check-rls.ts` — existence/enabled check only, not a behavioural test
- `saas/scripts/test-payment-rls.ts` — the two-tenant pattern worth copying

---

## 11. Any new customer-facing (or internal-notification) email must go through `sendTenantEmail()` — never call Resend directly

**What the dependency is:**
`saas/lib/emails/sendEmail.ts` (`sendTenantEmail()`) is the single place that builds the From header (tenant name + the shared `notify.vineworks.ge` sending domain — see [[Plan-EmailInfrastructure]] for why a shared domain, not a per-tenant one) and Reply-To (the tenant's own `contact_email` setting). Every existing email — `bookingConfirmation.ts`, `wineOrderReceipt.ts`, `invoiceEmail.ts`, `notifyNewCompany.ts`, `bugReports.ts` — was migrated onto it 2026-09-10, replacing 5 separate hand-rolled `new Resend(...).emails.send(...)` calls that had drifted (one still had the old sandbox `onboarding@resend.dev` hack live in production).

**What this means in practice:** a new email template should call `sendTenantEmail({ tenantId, tenantName, fromLocalPart, to, replyTo, subject, html })`, not instantiate its own `Resend` client.

**⚠️ Pass `tenantId` (added 2026-09-10).** `sendTenantEmail` suppresses all outbound mail for the demo tenant — `demo.vineworks.ge` is a public sandbox, and without this every booking a stranger makes emails whatever address they typed and burns the shared Resend quota. The suppression keys on `tenantId`, so **an email that omits it will send for real from the demo**. It is optional in the type only because platform mail deliberately omits it: `bugReports.ts` goes to the super-admin inbox rather than to or from any winery, and those should still arrive from the demo. Omitting `tenantId` is the signal that a message is platform mail, not tenant mail — if you are writing tenant mail, pass it. If the sending domain (`notify.vineworks.ge`) is ever swapped for a different one, that's a one-line change inside `sendEmail.ts` — it only stays a one-line change as long as nothing else calls Resend directly.

**Files involved:**
- `saas/lib/emails/sendEmail.ts` — the shared helper
- `saas/lib/emails/bookingConfirmation.ts`, `wineOrderReceipt.ts`, `invoiceEmail.ts` — customer-facing, all take `wineryEmail` (the tenant's `contact_email`) as Reply-To
- `saas/app/actions/notifyNewCompany.ts`, `bugReports.ts` — internal notifications
- Full build/verification log: [[Plan-EmailInfrastructure]]

---

## 12. Demo tour / Explore panel rings are anchored to `data-tour` attributes scattered across seven screens

**What the dependency is:**
`saas/components/DemoTour.tsx` (each step's `target`) and `saas/components/DemoExplore.tsx`
(each capability's `target`) locate what to highlight with
`document.querySelector('[data-tour="…"]')`. Both resolve it through the shared
`useAnchorRect()` hook in **`saas/lib/demoAnchor.ts`** — that file is the single implementation
of the find-and-measure logic, and the place to change it. Those attributes live on unrelated
pages:

| `data-tour` value | Where it lives |
|---|---|
| `booking-form` | `saas/app/(site)/page.tsx` — the `#book` section |
| `wine-catalogue` | `saas/app/(site)/wines/WineCatalogueClient.tsx` — **on the wine list itself**, and it appears **twice**: once in the grid-view branch, once in the list-view branch. Only one is mounted at a time. (Moved off the page wrapper in Chunk 4 — the wrapper was the full viewport width, so the ring had no visible left or right edge.) |
| `orders-table`, `orders-filters` | `saas/app/admin/(panel)/orders/page.tsx` |
| `stats-cards` | `saas/app/admin/(panel)/statistics/StatisticsV2.tsx` — the three-card grid. Used by the **Explore panel** only. |
| `stats-future-revenue` | `saas/app/admin/(panel)/statistics/StatisticsV2.tsx` — the wrapper around the Future Revenue `Card`. Used by the **tour's step 5**, whose copy names that specific number. |
| `wine-orders-list` | `saas/app/admin/(panel)/wine-orders/page.tsx` |
| `content-editor` | `saas/app/admin/(panel)/content/page.tsx` |
| `company-rates` | `saas/app/admin/(panel)/companies/CompaniesClient.tsx` — the company list. Added in Chunk 4 for the Explore panel's "Per-company price ladders" link. |

**Why it bites:** nothing in the type system connects the two ends. Rename or drop an attribute
while refactoring one of those pages and the tour step still runs — it just silently loses its
ring and dims the whole screen instead. Deliberately a soft failure (a tour that vanishes
because a selector drifted would be worse), which is exactly why it can go unnoticed.

**Since Chunk 4 the failure is no longer silent in development:** `useAnchorRect` logs
`[demo] DemoTour: no element matching [data-tour="…"] on <route>` to the console when an anchor
cannot be resolved. It is dev-only and deduped per (target, route). **If you see that warning,
an anchor has drifted** — do not ignore it, it is the whole early-warning system for this
dependency.

**Two traps this has actually fallen into, both worth knowing before you touch it:**

1. **Measuring too early.** Until Chunk 4, `DemoTour` measured once, 60 ms after the route
   changed. That is a race against the destination painting, and it lost it on every step
   reached by a navigation — six of seven — while working perfectly on the one step that shares
   a route with its predecessor. It also passed on localhost and failed on production, because
   the difference is network latency on the RSC fetch. `useAnchorRect` now polls **and** runs a
   `MutationObserver` with no deadline, so a late anchor still resolves. **Do not replace that
   observer with a longer timeout** — a timeout is a guess about someone else's latency, and
   that guess is the original bug.
2. **Anchoring to something that is not rendered.** An element inside a `display:none` subtree
   measures 0×0. `/admin/orders` renders its bookings twice (a `hidden md:block` table and a
   `md:hidden` card list) and Tailwind picks on the **pane's** width, not the viewer's. The hook
   treats 0×0 as "not ready yet" and keeps looking rather than latching a dead rect, but an
   anchor placed only on the hidden copy will never resolve.

**If you touch one of those pages:** grep `data-tour` before and after, and walk the tour on the
demo tenant with the console open.

---

## 13. Every demo-only component must hide itself inside a `/live` pane

**What the dependency is:**
`saas/app/live/` (the live mirror) embeds the real guest site and the real admin panel as same-origin iframes. Each demo component — `DemoModeBanner`, `DemoFrontDoor`, `DemoTour`, `DemoExplore` — checks `isEmbeddedPane()` (`saas/lib/demoEmbed.ts`) and renders nothing when framed.

**Why it bites:** a new demo component that forgets the check will draw itself *inside both panes* of the mirror, which is the one screen where that chrome is most obviously wrong — a banner within a banner, two Explore pills, the panel over itself.

**Also note:** `isEmbeddedPane()` must be resolved in an effect after mount, never during render. `window` does not exist on the server, and branching on it during the first client render is a hydration mismatch. All four existing components follow that shape — copy it.

---

## 14. `saas/vercel.json` `crons[].path` must match a real route, and the route needs `CRON_SECRET`

**What the dependency is:**
`saas/vercel.json` schedules `/api/cron/reseed-demo`; the handler is `saas/app/api/cron/reseed-demo/route.ts`. The path is a plain string with nothing validating it against the filesystem — a moved or renamed route leaves the cron firing into a 404 every night, silently.

**The secret:** the route refuses to run (503) when `CRON_SECRET` is unset rather than failing open, because its whole job is deleting rows. **Vercel only injects environment variables into *new* deployments**, so adding or rotating `CRON_SECRET` requires a redeploy before it takes effect — an existing build keeps returning 503 until then. That surprise cost a debugging cycle on 2026-09-10.

**Also:** cron jobs on the Hobby plan fire within a ±1-hour window, not at the exact minute, and the dashboard's "Run" button appears to be a no-op there — it produced no request at all when tested. Verify from the runtime logs, not from the button.

---

## 15. The demo chrome's colours live in one module — no demo component may carry its own hex

**What the dependency is:**
`saas/lib/demoTheme.ts` exports the eight "cellar dark" tokens (`DEMO`) plus the values derived
from them (`DEMO_FX` — scrims, shadows, the spotlight ring glow, the text colour for filled
CTAs). `DemoFrontDoor`, `DemoTour`, `DemoExplore`, `DemoModeBanner` and `DemoLoginShortcut`
all read from it, each keeping its own local `C` object as a re-pointed alias so call sites did
not have to change.

**Why it bites:** two hand-written copies of a palette is exactly what [[KnownBugs]] #20/#21 were,
and they had to be cleaned up once already. A new demo surface with its own literal hex will look
right on the day and drift the moment anything changes.

**Two tokens, not one, for the accent.** `accentSolid` (`#8F2229`) backs filled buttons, which
need ivory text to sit on them; `accent` (`#C9565C`) is the spotlight ring, links and arrows,
which need to be the brightest thing on a dimmed screen. The old palette used one colour for both
and neither read well. In `DemoTour` these are `C.accent` and `C.ring`.

**Deliberately not `:root` in `globals.css`.** That file loads for every tenant, and the demo
chrome ships demo-only — putting the tokens there would force a `staging` pass on every cosmetic
demo change. `demoCssVars` is exported for anywhere a stylesheet genuinely needs the real
`--demo-*` custom properties.

**The palette is fixed, not inherited.** It must stay legible over all 16 tenant presets,
including the five dark ones — inheriting `var(--site-*)` would give dark-on-dark. Checked
against **Deep harbor**, the darkest and coolest, which is the worst case for a warm palette.

---

## 16. `/admin/onboarding` has its own layout, and it is the second place demo chrome mounts

**What the dependency is:**
The setup wizard renders **outside** `saas/app/admin/(panel)/layout.tsx`, which is where the demo
chrome normally mounts. `saas/app/admin/onboarding/layout.tsx` exists solely to mount
`DemoModeBanner`, `DemoTour` and `DemoExplore` on that one route
([[DemoSite/Plan-DemoFlowFixes]] Chunk 8, [[KnownBugs]] #28).

**Why it bites two ways:**
- A new demo component added to `(panel)/layout.tsx` and *not* here leaves the onboarding route
  half-dressed again — which is the bug that was just fixed. **Both files, or neither.**
- **Since 2026-09-12 it is three files for chrome and four for analytics.**
  `DemoAnalytics` (§19) also mounts in `app/live/page.tsx`, because `/live` is its own route
  group with no demo chrome and "does anyone reach the mirror" is one of the four questions the
  analytics exist to answer. Chrome: `(site)`, `(panel)`, `onboarding`. Analytics: those three
  **plus** `/live`. Leaving `/live` out loses the single most important page view on the site,
  silently and with nothing to notice.
- The obvious-looking fix, putting the chrome in `app/admin/layout.tsx`, is wrong: that file
  wraps `(panel)` as well, so it would render every demo component **twice** on every other
  admin page.

---

## 17. Three mobile hit areas are invisible to `getBoundingClientRect` — measure the hit, not the box

**What the dependency is:**
Three controls were made thumb-sized in the 2026-09-12 product mobile pass **without changing
their visual size**, because making the visual bigger would have been wrong in each case:

| Control | Visual box | Actual hit area | How it is done |
|---|---|---|---|
| `components/HelpHint.tsx` "?" | 16x16 | ~30x39 | absolutely-positioned `<span aria-hidden>` child, `-inset-y-3 -inset-x-2` |
| `SettingsClient.tsx` `Toggle` | 44x24 | 44x39 | same pattern, `inset-x-0 -inset-y-2` |
| `OrdersTable.tsx` card-list status pill | 87x26 | 87x41 | `py-2 -my-2` on the wrapper `div`, which already owned the `onClick` |

**Why it bites:** an audit script that reads each element's own rect reports the **old** numbers
for all three and looks like a regression that was never fixed — or worse, invites someone to
"fix" it again by enlarging the visual. Verify these with `document.elementFromPoint`, walking
outward from the control's centre until the hit stops resolving inside it.

**The two asymmetries are deliberate, not sloppy:**
- HelpHint grows further vertically than horizontally because it sits inline beside a label and,
  on `/admin/companies`, beside another button ([[KnownBugs]] #15). A symmetric expansion would
  start stealing that button's taps.
- The status pill grows vertically only because the whole booking card is a link to the order —
  widening sideways would turn taps meant for the guest's name into status changes.

**Related: `md:`, never `sm:`.** Every desktop reset in that pass uses `md:` (768px), matching
`lib/useIsNarrow.ts` and the `md:hidden` / `hidden md:block` split on `/admin/orders`. Tailwind's
default `sm:` is 640px, which would hand 640–767px tablets the desktop sizes while the admin
still served them the phone card list. If you add a narrow-only rule here, use `md:`.


---

## 18. The demo has exactly one floating entry control, and only `DemoTour` writes the tour's state

**What the dependency is:**
Since 2026-09-12 the tour's entry point and the capability menu are one control:
`saas/components/DemoExplore.tsx` (was `DemoFeatureRail.tsx`) renders the bottom-right
"Explore this demo" pill and the panel behind it. `saas/components/DemoTour.tsx` renders only
the spotlight — it draws **nothing** when no step is showing. The contract between them lives in
**`saas/lib/demoTour.ts`**: the steps, the localStorage shape, and two window events.

| Direction | Mechanism |
|---|---|
| Explore → Tour | `sendTourCommand({ action: 'begin', index })` / `{ action: 'end' }` on `TOUR_COMMAND_EVENT` |
| Tour → Explore | every `saveTourState()` dispatches `TOUR_STATE_EVENT`; Explore re-reads |

**Why it bites three ways:**

1. **Two writers would diverge.** `DemoTour` is the only thing that writes tour state, because
   "begin" also means *navigate to that step's screen* (`beginAt`) and that decision has to live
   with the component that owns the spotlight. Explore asks; it never sets the key itself.
   If you add a control that changes the tour, dispatch a command — do not write localStorage.
2. **The pill and the spotlight must never both be up.** `tourOffer()` returns `spotlight` when
   the visitor is mid-tour *on the step's own route*, and Explore renders nothing in that state.
   The old code enforced the same rule from the other side (DemoTour returned its pill when off
   route). **Do not reinstate a pill in `DemoTour`** without deleting the matching state here —
   two floating invitations at once is the exact finding this merge closed.
3. **`window` events, not React context**, because the two components are siblings in three
   different layouts and, mid-navigation from guest to admin, live in two React trees at once.
   A provider would have to be added to all three layouts and would still not span that boundary.

**Also:** `DemoExplore` aliases `C.accent` to `DEMO.accent` (the ring colour), where `DemoTour`
aliases the same key to `DEMO.accentSolid`. The two filled CTAs in Explore — the panel's tour
button and the paused pill's Resume — therefore name `C.accentSolid` explicitly. Copying a
filled-button style between the two files without checking that alias gives ivory text on the
light ring colour (§15's two-token rule, from the other end).

**Mobile:** the paused pill's three controls (compass, Resume, ✕) are each a full 40×40 rather
than a 28 px visual with §17's outset hit area — they sit 6 px apart, so two expanded hit areas
would both claim the same gap and a tap there could end the tour instead of resuming it.


---

## 19. Demo analytics: a route handler, never a server action, and the gate is server-side

**What the dependency is:**
`demo.vineworks.ge` records what visitors do, into the `DemoEvent` table. Four files:

| File | Job |
|---|---|
| `saas/lib/demoEventNames.ts` | the fixed vocabulary, imported by both sides |
| `saas/lib/demoAnalytics.ts` | `trackDemo()` — the browser half |
| `saas/app/api/demo-event/route.ts` | the write, and the tenant gate |
| `saas/components/DemoAnalytics.tsx` | page views + the booking listener |

**Why it bites four ways:**

1. **It must never be a server action.** It was one for an afternoon, and the bug it caused is
   the reason this note exists: **Next runs a client's server actions strictly in sequence**, so
   an analytics write — cold module compile, then a transaction to a database in `eu-central-1`
   — sat in front of the visitor's *own* next action. The front door's "I run a winery" sign-in
   stalled behind a page-view counter and the demo looked broken. It is now a plain `fetch` to a
   route handler, sent with `keepalive` so an event fired on a click that navigates still
   arrives. **If you add an event, call `trackDemo()` — do not reach for an action.**
2. **The tenant gate is the route handler's, not the call site's.** Every call site today is a
   demo-only component, but that is a convention, and a convention is not a gate. The handler
   reads `x-tenant-id` (set by `proxy.ts`, which runs on `/api` too) and drops anything that is
   not the demo tenant. The request body cannot name a tenant — verified by posting one that
   tried. **Never add a `tenantId` parameter to that endpoint.**
3. **Shared components stay clean.** `booking_placed` is not recorded by `BookingForm.tsx` —
   that file is every winery's booking form. It is recorded by `DemoAnalytics` listening for the
   `DEMO_BOOKED_EVENT` the form already broadcasts (`lib/demoEvents.ts`). Any future event that
   originates in shared code should reach the analytics the same way: a signal the shared file
   already emits, never a demo conditional inside it.
4. **The vocabulary is closed.** A name not in `DEMO_EVENT_NAMES` is dropped by the handler. Add
   the name there first, or the event silently never lands.

**The table holds no personal data** — no IP, no user agent, no name, no email. `sessionId` is a
random per-tab string from `sessionStorage` that dies with the tab. That is what lets the demo
run without a cookie-consent banner, which on a sales demo would cost more than the analytics
are worth. **Do not add an identifying column to this table** without reopening that decision.

**The nightly reseed does not touch `DemoEvent`** (`lib/demoSeed.ts` deletes six named tables),
so a `booking_placed` event outlives the booking row it describes. That is deliberate: the row
is demo furniture, the event is the measurement.

**Reading it:** `npx tsx scripts/demo-funnel.ts [days]` from `saas/`. Counts are by session, not
by event.
