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

**Since Feature 184 (2026-09-14):** `handleSubmit`'s validation no longer ends in a `createBooking()`
call — once every check (including the company-code one below) passes, it opens a confirm sheet
(`components/BookingConfirmPopupView.tsx`) instead; the actual submit moved to a new
`handleConfirmedSubmit()`. That sheet's own copy (heading, subheading, duration line, both button
variants) is **not** in `FIELDS.form` here — it lives under the Content page's **Messages** tab
(`onsite_confirm_*` keys, `MessagesPanel.tsx`), matching the pattern of the two popups it's modeled
on (`AccessCodePopupView.tsx`/`NewCompanyPopupView.tsx`), not the pattern of the rest of this file.
`BookingFormVisualPanel.tsx` has a static block pointing there rather than a live-editable field —
see `Features/Feature 184 - Booking Confirm Sheet.md` before changing either file's confirm-sheet
section, so the two don't drift into duplicate or conflicting sources of truth for the same copy.

**Since Plan-ContactRoles Chunk 7 (2026-09-22):** the detailed variant has a **fourth**
section — one contact-details block (Name / Phone / Email) per contact role other than
`contact_person`, which keeps the existing First Name / Last Name / Phone / Email fields. It has
**no `FIELDS.form` entry**, and that is this note's own test applied rather than an oversight:
each block's heading is a role's `labelEn`/`labelKa` from the `ContactRole` table, managed at
Settings → Contact Types, so it is other admin data like the `MenuItem`/`MasterclassItem` rows —
not SiteContent. The sub-labels are plain `t()` keys (`form.contact_role_name/_phone/_email`),
matching how the guest sub-labels above them are handled. `BookingFormVisualPanel.tsx` mirrors
it as a static illustrative block, the same way it mirrors a masterclass row.

The blocks are driven by the tenant's **role list** (`orderRolesFor()`, passed as `bookingRoles`
from `app/(site)/page.tsx`), not by which people the selected company happens to have — so the
form's shape stays put as the dropdown changes, and a company with no guides still offers
somewhere to type one. Adding a contact type in the admin panel adds a block here with no code
change; that is the requirement the whole rework exists for.

**Since Feature 180 (2026-09-13):** the company-code check in `handleSubmit` runs *last*,
after every other field validates — on failure it opens the "New Company?" popup (pre-filled
from the form) instead of erroring, and `buildBookingPayload()` is the one place both the
normal submit and the popup's submit build the `createBooking` payload from. If you add a
new required field to the booking form, make sure it's covered by `buildBookingPayload()`
so a booking submitted through the popup carries it too — a field added only to the inline
`createBooking(...)` call in `handleSubmit` would silently go missing on that path.

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
- `saas/lib/emails/newBookingNotification.ts` — internal notification, the winery's own `contact_email`, on every new booking (Feature 179)
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
by event. It resolves the demo tenant **by slug**, because the tenant's id differs per database
(`cmtvgl6e6…` dev, `cmtvi582n…` prod) and an id from an env var is a quiet way to run it against
production and be told there is no data.

**Adding this table to a database:** the migration is additive, but the RLS half was applied to
`DemoEvent` **alone** on production rather than by re-running `setup-rls.ts`. That script DROPs
and re-CREATEs `tenant_isolation` on fourteen live customer tables; between the DROP and the
CREATE the table fails closed, so nothing leaks, but a live request can still error for a reason
unrelated to the change. For one new table, apply the four statements it would produce (GRANT,
ENABLE ROW LEVEL SECURITY, DROP POLICY IF EXISTS, CREATE POLICY) and verify with `pg_policies`.
`setup-rls.ts` remains the source of truth and lists `DemoEvent`, so a future full run matches.

---

## 20. Browser QA on the demo: measure, don't screenshot — and check the tab is actually painting

**What the dependency is:** the demo tour's ring is positioned by `lib/demoAnchor.ts`, which
measures inside `requestAnimationFrame`. A browser tab that is not being painted — the Browser
pane hidden, or the Chrome window behind another — **pauses rAF**. On 2026-09-13 this cost about
an hour: screenshots came back blank in two independent browsers and one call timed out with
*"the renderer may be frozen or unresponsive"*, which read as an infinite render loop in the tour.
It was not. `document.hidden === true` and rAF had fired **once in four seconds**.

**Before concluding anything from a blank screenshot**, run:

```js
let f=0; const t0=performance.now();
(function g(){f++; if(performance.now()-t0<1000) requestAnimationFrame(g)})();
await new Promise(r=>setTimeout(r,1300));
({hidden: document.hidden, framesIn1s: f})
```

Healthy is ~60. One means nothing on screen can be trusted.

**What to do instead.** DOM assertions work perfectly in a hidden tab, and for this component they
are *better evidence* than a picture: comparing the tooltip's `getBoundingClientRect()` with the
ring's is an exact overlap test, where a screenshot is a judgement call. The full seven-step walk,
the keyboard tests and the short-viewport tests were all done that way. `preview_start` with a
`url` re-opens the pane if it has been hidden.

**Second trap, same session:** the Browser pane's console buffer **survives page reloads and a
dev-server restart**. A stale `railKeyDown is not defined` from a half-applied hot reload looked
like a live error through three rounds of chasing it. Chrome's `read_console_messages` accepts
`clear: true` — use it, or read the console in a tab created *after* the change.

**Files involved:** `saas/lib/demoAnchor.ts`, `saas/components/DemoTour.tsx`.

### One loose end, explicitly UNVERIFIED

Chasing the imaginary freeze turned up something that is still true and was never tested, because
testing it needs a browser that is actually painting:

`measure()` in `demoAnchor.ts` calls `setRect({...})` with a **brand-new object on every
measurement**, even when all four numbers are unchanged. `setRect` with a new reference always
re-renders `DemoTour`, whose portal lives in `document.body` — and the MutationObserver a few
lines above is watching `document.body, {childList: true, subtree: true}`. So each measurement
can mutate the very subtree that triggers the next one. The loop is bounded: `maybeStop()`
disconnects the observer once the poll has ticked `SETTLE_ATTEMPTS` times, so in principle it
only churns for the first ~0.5s of each step.

**What is not known** is how many redundant renders that actually costs per step, or whether the
poll's `attempts` counter can be starved by the render churn it is supposed to terminate (the
`setInterval` is the only thing that stops the observer). It was never measured — a hidden tab
pauses `requestAnimationFrame`, which is where the observer does its work, so every reading taken
on 2026-09-13 was worthless for this question.

**How to settle it in five minutes**, with the pane visible: count renders across one step change
by logging in `measure()`, or diff the observer-callback count before and after adding an
identity check. **The fix, if it is real, is one edit** — bail out when nothing moved:

```ts
setRect(prev =>
  prev && prev.top === top && prev.left === left && prev.width === w && prev.height === h
    ? prev
    : { top, left, width: w, height: h })
```

React bails on an identical reference, which breaks the feedback edge at the source. Do not apply
it as a "might as well" without measuring first — this file's own history (§20, and the two
findings in `DemoSite/HANDOFF.md`) is a list of costs from building on an unmeasured hypothesis,
and the freeze this came from was exactly that mistake.

---

## 21. The demo tour crosses two React trees — a ref cannot carry state across it

**What the dependency is:** stepping from the guest site into the back office (tour step 2 → 3)
moves `DemoTour` from the `(site)` layout to `admin/(panel)`. The component **unmounts and a fresh
one mounts**, so every `useRef` resets at exactly that point. `lib/demoTour.ts`'s header already
says this about the tour's *state*, which is why that lives in localStorage; the same applies to
anything smaller.

Found 2026-09-13 by the progress rail's roving tabindex: "focus the rail after this arrow press"
was a ref, so the first arrow press moved focus and the one that crossed did not, stranding a
keyboard user on `<body>` with the tour dialog last in tab order.

**The three channels, cheapest first:**

| Need | Use |
|---|---|
| A transient intent within one page session | a **module-level `let`** — both trees are the same document and the same module instance, so it survives the remount (`railFocusPending` in `DemoTour.tsx`) |
| State that must survive a reload | **localStorage** + a `CustomEvent` so readers re-read (`TOUR_STORAGE_KEY` / `TOUR_STATE_EVENT`) |
| A one-shot handoff between two routes | **localStorage, consumed once** (`TOUR_AUTOSTART_KEY`) |

**Also from the same fix:** do not identify an element with a conditional object ref
(`ref={i === active ? r : undefined}`) inside a list. Detach and attach happen in the same commit
and the order is not yours to rely on — moving *forward* along the rail worked and moving *back*
left the ref null. Query the DOM for the attribute the component itself renders
(`button[aria-current="step"]`) instead; it cannot go stale.

**Files involved:** `saas/components/DemoTour.tsx`, `saas/components/DemoExplore.tsx`,
`saas/lib/demoTour.ts`.

---

## 22. ~~Nine places compute a booking price~~ — DONE 2026-09-19, there is now one

**What the dependency is:** `createBooking.ts` (new booking), `updateOrderEnhanced()` (editing
an existing order's guest counts), and `assignOrderCompany()` (Feature 180 — linking a
no-company order to a real company after the fact) each independently re-derive a company's
price from its `Price[]` tiers via `findTier()` + `comboRatePerPerson()`. All three branch the
same way: if the order has split tasting/lunch counts (`tastingGuestCount + lunchGuestCount >
0`), price each split count against the matched tier separately; otherwise price the flat
`guestCount` against the tier using the single `visitType`-selected rate.

**Why it bites:** there's no shared helper — the branch is copy-pasted three times. A change to
the pricing formula (e.g. a new fee type, a rounding rule) made in one of these and not the
other two will silently drift, and nothing will fail loudly — each order just gets priced
differently depending on which code path last touched it.

**Files involved:** `saas/app/actions/createBooking.ts`, `saas/app/actions/orders.ts`
(`updateOrderEnhanced`, `assignOrderCompany`), `saas/lib/pricingUtils.ts` (`findTier`,
`comboRatePerPerson`, the two functions that are already shared).

---

### Update 2026-09-19 — it is five sites, not three, and they have already drifted

Counted while fixing bugs #47/#48. Two more copies exist that this note did not name:

4. **`saas/lib/pricing.ts`** — `recalcOrderTotal`'s fallback branch, for orders with no
   rate snapshot. It re-derives the same formula from live `Price` rows.
5. **`saas/components/BookingForm.tsx`** — the client-side price *preview* (`estimatedTotal`
   / `enhancedTotal`). It runs in the browser off the same tier data and must agree with
   what `createBooking.ts` will store, or the guest is quoted one number and charged another.

**The drift this note warned about has now happened, twice:**

- **#48** — `BookingForm.tsx`'s COMPANY branch priced `TASTING_LUNCH` at
  `matchedTier.pricePerPerson` while `createBooking.ts` charged `comboRatePerPerson(tier)`.
  The quote silently under-stated the stored total by the lunch add-on × guests.
- **#47** — `assignOrderCompany` computed its total correctly but wrote no rate snapshots,
  so site 4's fallback branch took over on the next recalc and re-priced the booking at
  current tiers. Exactly the failure mode chunk 4 was built to eliminate.

Both are fixed, but **by hand, in the copies** — the structural problem is untouched. The
outstanding work is to extract one helper into `pricingUtils.ts` and call it from all five.
Note that doing so requires a decision, not just a refactor: sites 1–4 are server-side and
authoritative, site 5 is a browser preview that cannot see snapshots, so the shared helper
has to take rates as arguments rather than read them.

---

---

### Update 2026-09-19 (second pass) — nine sites, and the obstacle was imaginary

An independent review counted the real number. **Five server sites** write `Order.totalPrice`
(`createBooking`, `updateOrderEnhanced`, `createOrderAdmin`, `assignOrderCompany`,
`recalcOrderTotal`), **three client sites** display a total (`BookingForm`, `NewOrderForm`,
`OrderDetail`), and `demoSeed` makes nine. Six agree; the three that did not were #50–#52.

**The stated obstacle above — that a shared helper needs a design decision because the browser
preview cannot see snapshots — is wrong.** `lib/pricingUtils.ts` has no `'use server'` and no
server-only imports, and is already imported by eight files spanning both sides. There is no
boundary to cross, and taking rates as arguments is the obvious shape rather than a hard call.

**The framing that replaces this whole section:** the sites do not disagree about pricing, they
disagree about *where rates come from*. Three ask "what is this worth at the agreed rates"
(`createBooking`, `recalcOrderTotal`, `assignOrderCompany`); two ask "what should this be
re-priced to now" (`updateOrderEnhanced`, `createOrderAdmin`). That collapses into which
resolver you call:

```ts
priceBooking(rates: RateSet, guests: Headcount, visitType, lines: LineTotals): number
ratesFromTier(t) / ratesForIndividual(t) / ratesFromSnapshot(order) / ratesFromManual(t, l)
```

The body is `recalcOrderTotal`'s snapshot branch verbatim — that path is already correct, so it
becomes the definition. The one genuine policy asymmetry (individuals do not pay the tier's
registration fee) lives in `ratesForIndividual`, not in the arithmetic.

**Sequencing is the only real constraint.** Extraction changes behaviour at the drifted sites,
so extracting first hides fixes inside a mechanical diff. Write the disagreements as tests,
fix them, then extract. That order was followed for #50–#52:
`saas/scripts/test-pricing-agreement.ts` was written first and failed 6 of 8.

**Do not** replace the client preview with a server round trip. A form has to show a number
before it submits; the problem was drift, not the existence of a second copy.

---

---

### RESOLVED 2026-09-19 — `priceBooking()` landed; this section is history

All nine sites now call `priceBooking()` from `lib/pricingUtils.ts`. There is one arithmetic
function and four rate resolvers:

```ts
priceBooking(rates: RateSet, guests: Headcount, visitType, lines: LineTotals): number
ratesForParty(prices, guestCount, { chargeRegistration? })   // picks the tier itself
ratesFromTier(tier) / ratesFromSnapshot(order) / ratesFromManual(t, l)
```

Rewired: `createBooking`, `updateOrderEnhanced`, `createOrderAdmin`, `assignOrderCompany`,
`recalcOrderTotal`, `BookingForm`, `NewOrderForm`, `OrderDetail`, `demoSeed`.

**Two rules now live in exactly one line each, instead of nine:**

1. **The tier is chosen by party size** — `ratesForParty` does the `findTier` lookup, so no
   call site picks a head count any more. Changed from `tastingGuests + lunchGuests` on Max's
   call: *"if we have guest count then the pricing tier should only be derived from guest
   count — that is exactly what pricing tier is for."* A party of 8 with a guide and a driver
   now prices as 8, not 6, and re-splitting a party between the two buckets no longer moves it
   between bands.
2. **The split decides what each guest pays**, nothing else. `priceBooking` branches on whether
   the buckets are set; `visitType` only applies to an unsplit party.

**Watch for:** a new pricing path that calls `findTier` directly instead of `ratesForParty`.
That is the one way the tier rule can drift again, and it is now greppable — `findTier` should
appear only inside `pricingUtils.ts` and in the two display fallbacks.

Covered by `saas/scripts/test-pricing-agreement.ts` (21 cases), which pins the tier rule with
a worked example: the same party of 8 costs ₾620 under the old rule and ₾540 under the new one.

---

## 23. Every automatic email is split HTML-template vs. send-wrapper — edit the right half

**What the dependency is:** since Feature 181, each file in `saas/lib/emails/` (`bookingConfirmation.ts`, `wineOrderReceipt.ts`, `invoiceEmail.ts`, `newBookingNotification.ts`) plus `app/actions/notifyNewCompany.ts` no longer contains any HTML. The markup lives in a sibling file under `saas/lib/emails/templates/` (`bookingConfirmationTemplate.ts` etc.), exporting a pure `render*Email(data): { subject, html }` — no `resend` import, no DB call, no `'use server'`. The original file just calls that render function, then `sendTenantEmail()`.

**Why it's split this way:** `app/admin/(panel)/content/MessagesPanel.tsx` (the "Messages" tab on the Content page — folded in from a standalone `/admin/messages` page on 2026-09-14) imports the render functions directly into a `'use client'` component and calls them in the browser on every keystroke, so a tenant admin's live preview needs zero network round trip. That only works because the template files have no server-only imports — importing `bookingConfirmation.ts` itself (which pulls in `resend` via `sendEmail.ts`) into client code would bundle a chunk nothing there needs and could not run anyway.

**What this means in practice:**
- **Changing an email's markup, layout, or copy** → edit the file in `lib/emails/templates/`, never the wrapper. The wrapper has nothing left to change except the `sendTenantEmail()` call (`fromLocalPart`, demo suppression, etc.).
- **Adding a new automatic email** → same split from the start: a pure template file, a thin wrapper. If it should appear on the Messages tab, register it in `MessagesPanel.tsx` with its own sample data.
- **Never add a DB call, `headers()`/`cookies()`, or a `resend` import to a `templates/*.ts` file** — the moment one of these stops being pure, the admin preview breaks (or silently starts making a server request on every keystroke, if you're not careful).
- Three of the five templates (`bookingConfirmationTemplate.ts` ×3 variants, `wineOrderReceiptTemplate.ts`, `invoiceEmailTemplate.ts`) accept a tenant-editable text field (`introText` on the first two, `customMessage` on invoice), persisted in `SiteContent` (section `'messages'`, real per-locale rows — **not** `Setting`, since `Setting` has no `locale` column and the whole point of the 2026-09-14 move was giving these EN/KA support). `introText` is escaped before interpolation via `lib/emails/templates/tokens.ts`'s `renderTokenizedText()`, which also substitutes the one supported token, `{name}`. `invoiceEmailTemplate.ts`'s `customMessage` predates that convention and is deliberately **not** escaped/tokenized — see Feature 181's note — don't "fix" that inconsistency without checking why first.
- **Each email resolves its SEND-time locale differently, because no `Order.locale` column exists anywhere:** `createBooking.ts` reads the guest's own `site_locale` cookie (browser request, cookie available); `settle.ts` runs from a payment webhook with no cookie access, so it falls back to the tenant's `default_locale` Setting instead — the **paid** booking-confirmation path can send in the site's default language even if the guest was browsing in the other one. Invoice Email is sent manually, so the admin picks EN/KA per-send in a toggle in the "Send Invoice by Email" modal (`OrdersTable.tsx`), defaulting to Georgian. If you ever add a real `Order.locale` column to fix the settle.ts gap, all three call sites need revisiting, not just one.
- `settle.ts` fetches content via `getAllContent(tenantId, locale)` (the explicit-tenant sibling of `getContent()`), same reasoning as its existing `getAllSettings(tenantId)` call: the authoritative tenant on a webhook path is the payment's own, not whatever `headers()` would resolve. **Never use `getContent()` in `settle.ts`** for the same reason `getSetting()` was already avoided there.

**Files involved:** `saas/lib/emails/templates/*.ts` (including `tokens.ts` and `dateFormat.ts`), `saas/lib/emails/*.ts`, `saas/app/actions/notifyNewCompany.ts`, `saas/app/actions/createBooking.ts`, `saas/lib/payments/settle.ts`, `saas/app/actions/orders.ts`, `saas/app/admin/(panel)/orders/OrdersTable.tsx`, `saas/app/admin/(panel)/content/MessagesPanel.tsx`. Full design: `Features/Feature 181 - Automatic Messages Page.md`.

**2026-09-14 QA-fix update:** `bookingConfirmationTemplate.ts` gained a `locale` param and label table (it had none at all until then — the whole "Booking Summary" block rendered English regardless of the toggle, [[KnownBugs]] #36). Both it and `invoiceEmailTemplate.ts` now format dates through the new `lib/emails/templates/dateFormat.ts` instead of `toLocaleDateString('ka-GE', ...)` — **do not revert to that call**. It looks correct locally (full ICU) and silently produces an invalid `MM.DD.YYYY` in production, because Vercel's Node runtime doesn't carry full `ka-GE` ICU data and falls back to an en-US-shaped field order without erroring ([[KnownBugs]] #37). `dateFormat.ts` builds both the long form (fixed Georgian weekday/month name tables) and the short form (`getDate()`/`getMonth()`/`getFullYear()`) explicitly for exactly this reason — any future date added to an email template should go through it, not a fresh `toLocaleDateString` call, regardless of which locale looks right on your machine.

---

## 24. A `'use server'` file may only export async functions — not even a type re-export survives

**What the dependency is:** `app/actions/notifyNewCompany.ts` had `export type { NotifyNewCompanyData }` sitting next to its one real export, `notifyNewCompany()`. In this Next.js version, that one extra line crashed **every server action reachable from the page that imports it** — `ReferenceError: NotifyNewCompanyData is not defined` at module evaluation of the whole actions bundle, not a scoped error. Type-only exports are supposed to be erased entirely at compile time (they don't exist at runtime), but the `'use server'` transform doesn't erase this one — it leaves a dangling reference to an identifier the compiled bundle never defines.

**Why it bit hard:** `(site)/page.tsx` (the home/booking page) imports `notifyNewCompany`, so this took down the *unrelated* `createBooking` action too — both public booking submission and the "New Company?" registration request crashed with the identical error digest, because they're both server actions bundled into the same broken chunk ([[KnownBugs]] #33). Nothing in `createBooking.ts` itself was wrong; its own top-level `try/catch` couldn't help because the crash happened before any of its code ran, at module load.

**The rule going forward:** a file with `'use server'` at the top exports async functions and nothing else — no types, no constants, no re-exports of any kind, even ones that look inert. If a caller needs a type from a server action's parameter, import it from wherever that type is actually defined (here, `lib/emails/templates/notifyNewCompanyTemplate.ts`, which has no `'use server'` and re-exports cleanly), not through the action file. Grep `^export type \{` across `app/actions/` before adding a new one — this was the only instance when found, and finding a second one later should be treated as the same bug, not a coincidence.

**Files involved:** `saas/app/actions/notifyNewCompany.ts`, `saas/lib/emails/templates/notifyNewCompanyTemplate.ts`.

---

## 25. `sharp` (or any native-binary dependency) needs `outputFileTracingIncludes` — Next's automatic file tracing doesn't reliably find it through the server-actions layer

**What the dependency is:** `app/actions/uploadImage.ts` imports `sharp` at module scope to resize/convert uploaded images. `sharp`'s actual native binary doesn't live inside the `sharp` package — it's in separate per-platform packages (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`, etc.), and Next's build-time file tracing (`@vercel/nft`) wasn't reliably including that directory in the deployed function bundle for routes that only reach `uploadImage.ts` transitively through the server-actions layer — `/admin/wines`, `/admin/content`, `/admin/onboarding` all crashed with `Error: Could not load the "sharp" module using the linux-x64 runtime: ERR_DLOPEN_FAILED: libvips-cpp.so... cannot open shared object file` ([[KnownBugs]] #34). `sharp` is already in Next's own default `serverExternalPackages` list, so the missing piece wasn't "tell Next not to bundle it" — it was "trace its binary files at all."

**The fix, and why the repro looked misleading:** `next.config.ts` now has:
```ts
outputFileTracingIncludes: {
  '/*': ['node_modules/sharp/**/*', 'node_modules/@img/**/*'],
},
```
(the documented remedy — see `node_modules/next/dist/docs/.../output.md`, "Common include patterns for native/runtime assets"). The original bug report's repro steps ("edit a message, then click the New company request variant") were a red herring — the crash had nothing to do with the Messages tab's UI logic; it was just a matter of which page's actions bundle happened to load. **Worth remembering generally:** when a crash's repro looks oddly specific to one UI action but the stack trace points at module evaluation or an unrelated import, check whether the *page*, not the *action*, is the actual common factor — the Vercel runtime-error log's grouping by route (not by UI step) is what actually surfaced this.

**What this means for any future native dependency:** if you add another native-binary package (anything with per-platform npm packages, prebuilt `.node`/`.so` files), assume it needs an entry in `outputFileTracingIncludes` too, and verify by checking the relevant route's `.next/server/app/.../page.js.nft.json` after a real `next build` — don't trust that "it works in `next dev`" means the production trace is complete, since dev doesn't go through the same tracing step at all.

**Files involved:** `saas/next.config.ts`, `saas/app/actions/uploadImage.ts`.

---

## 26. Guide/rep codes share one per-tenant pool with `Company.accessCode`, and the resolution logic exists in two places

> **⚠️ Being replaced — 2026-09-19.** [[Plan-ContactRoles]] collapses the four overlapping
> resolvers (`verifyBookingCode`, `findBookingCodeByCode`, `verifyCompanyCode`,
> `findCompanyByCode`) into one, which is the permanent fix for the divergence described below,
> and adds the DB-level unique index this note says does not exist. Until that lands,
> everything below still holds. **Two live defects found while planning it:** deleting a guide
> silently nulls `Order.guideId` on every past order ([[KnownBugs]] #56), and every company's
> access code is served in the public homepage's HTML ([[KnownBugs]] #57). This entry gets
> rewritten, not appended to, in that plan's Chunk 14.


**What the dependency is:** since Plan-CompanyGuidesAndReps, a person's code (`CompanyGuide.code` / `CompanyRepresentative.code`) and a company's own `accessCode` all have to be unique across the same tenant — a guide's code and another company's `accessCode` must never collide, because both the wine-order flow's `findCompanyByCode` and the booking flow's `findBookingCodeByCode` do a **code-alone, tenant-wide** lookup with no company chosen first. Uniqueness is enforced only at the application level: `generateUniqueTenantCode()`/`codeExistsInTenant()` (`app/actions/companies.ts`) check all three sources (`Company`, `CompanyGuide`, `CompanyRepresentative`) before accepting a code, in every action that generates or manually sets one (`createCompany`, `regenerateAccessCode`, `setAccessCode`, and their guide/rep equivalents in `companyGuides.ts`). There is no DB-level constraint spanning the three tables — a direct `prisma.companyGuide.create()` or raw SQL insert that skips these helpers can silently create a colliding code.

**The second half of the coupling:** the booking form has *two* code-resolution entry points that must stay in sync — `verifyBookingCode()` (dropdown flow: company already chosen, code just confirms the person) and `findBookingCodeByCode()` (direct-code-entry / `hideCompanyDropdown` flow: no company chosen, code alone is searched tenant-wide). A change to the resolution rule needs making in **both**, the same shape as §22's three pricing call sites.

> **They genuinely diverged, and nobody noticed for five days.** Until 2026-09-19 `verifyBookingCode()` fell back to `Company.accessCode` **only when the company had zero guides**, while `findBookingCodeByCode()` accepted a company code unconditionally — so the same code was rejected on the dropdown path and accepted on direct entry. Both functions' comments claimed they mirrored each other. **Feature 201** resolved it: both now accept the company code and return `guideChoices` so the guest picks which guide they are. If you touch one of these, diff it against the other before you finish.

**⚠️ Giving a company guides used to retire its access code.** That was the documented rule, and it had a hidden cost: adding one guide silently killed a code already circulating with a partner agency, while `/admin/companies` kept displaying it as live. Feature 201 removed the hazard. **A live consequence still in the tree:** `lib/demoSeed.ts` seeds guides on only *one* booking company, because under the old rule seeding them everywhere retired every company code and broke four Playwright specs at once. Once Feature 201 is on staging and master, that restriction can be lifted — see the warning on `BookingCompanySpec.guides`.

**A gap this left, not fixed:** `BookingForm.tsx` decides whether to show the code popup from `accessCode` alone (`if (!company.accessCode) { applyProfile(...); return }`), and never learns whether the company has guides. So a company with **guides but no shared code** shows no popup at all and its guide codes are unreachable on the dropdown path. Rare — `createCompany()` auto-generates a code — but reachable if an admin clears one. Fixing it means passing guide presence into the form's `companies` prop.

**What this means in practice:** if you add a third way to look up a code (e.g., extending this to wine orders per Chunk 6, still unbuilt as of this note), route the code-uniqueness check through `generateUniqueTenantCode()`/`codeExistsInTenant()` rather than inventing a new check, and mirror whatever fallback order the other two resolvers use rather than picking a different one.

**Files involved:** `saas/app/actions/companies.ts` (`generateUniqueTenantCode`, `codeExistsInTenant`, `verifyBookingCode`, `findBookingCodeByCode`, `findCompanyByCode`), `saas/app/actions/companyGuides.ts`, `saas/components/BookingForm.tsx`, `saas/components/GuidePickerPopupView.tsx`, `saas/lib/demoSeed.ts` (seeded codes/guides), `saas/scripts/backfill-test-fixtures.ts`. Full design: `Plan-CompanyGuidesAndReps.md`, `Features/Feature 185 - Company Guides and Representatives.md`, `Features/Feature 201 - Guide Picker After Company Code.md`. Covered by `saas/tests/tier2-core-flows/guide-picker.spec.ts`.

---

## 27. `Tenant` has RLS *enabled* at the DB level but zero policies — reading it through `withTenantDb` silently returns `null`, not an error

**What the dependency is:** Supabase enables row-level security on every table by default when a project is created, including `"Tenant"` itself — confirmed live via `SELECT relrowsecurity FROM pg_class WHERE relname = 'Tenant'` (`true`). `scripts/setup-rls.ts` grants `app_user` plain `SELECT` on `"Tenant"` (needed for `proxy.ts`'s tenant lookup) but deliberately never runs `CREATE POLICY` for it — `Tenant` isn't tenant-scoped data, there's no `tenantId` column to write a policy against, and the comment in that script even says so ("proxy uses superuser anyway"). The result: Postgres RLS with zero policies defaults to **denying every row** to any non-owner role. `app_user`'s `GRANT SELECT` lets the query execute, but it comes back empty — `tx.tenant.findUnique(...)` inside `withTenantDb` (which does `SET LOCAL ROLE app_user`) returns `null` for a row that demonstrably exists.

**Why it bites, and why it's dangerous specifically:** it fails *silently*, not loudly. No thrown error, no RLS violation message — just `null`, which every caller's `?? false` / `?? null` fallback swallows without complaint. `isPaymentConfigured()` (`lib/payments/shouldTakePayment.ts`) and `proxy.ts`'s `resolveTenant()` both already avoid this by querying `Tenant` through the plain unrestricted `db` client, never `withTenantDb` — but neither file says why, so it reads as an arbitrary inconsistency until you hit the bug yourself. Confirmed live 2026-09-16 while wiring `Order.enableCompanyNationalityBreakdown` into `app/(site)/page.tsx`: the flag was `true` in the DB (verified by direct query) but rendered as `false` on the public site until the fetch was switched from `withTenantDb` to plain `db.tenant.findUnique()`.

**What this means in practice:** any new code that reads a field off the `Tenant` row itself (not a tenant-scoped child table) must use the plain `db` client, never `withTenantDb`. If you ever need per-request tenant-role RLS enforcement, `Tenant` would need real policies added first — don't assume `withTenantDb` "just works" for it because it works for everything else.

**Files involved:** `saas/lib/payments/shouldTakePayment.ts` (`isPaymentConfigured`), `saas/proxy.ts` (`resolveTenant`), `saas/app/(site)/page.tsx` (the `enableCompanyNationalityBreakdown` fetch), `saas/scripts/setup-rls.ts`. See `Plan-CompanyNationality.md` Chunk 5.

---

## 28. Every order query must exclude abandoned orders — and nothing enforces it

**What the dependency is:** since Feature 191 an order that was sent to the card
gateway and never paid carries a non-null `abandonedAt`. It is **not an order**:
the winery must never see it in a list, a board column, a filter, a count, a
calendar day or a CSV export. It lives on `/admin/abandoned` and nowhere else.

The exclusion is a `where` fragment, `NOT_ABANDONED` in
`saas/lib/orderFilters.ts`, and **every** `Order` / `WineOrder` query that feeds
an admin surface has to spread it in.

**Why it bites:** forgetting it does not error and does not look wrong. An
abandoned order sits at `stage: 'NEW'` — legitimately, it never progressed — so
it renders as a perfectly ordinary new booking that the winery thinks it has work
to do on. They accumulate forever and are never auto-expired (a late gateway
callback must still be able to land, Plan-OnlinePayment §7.2), so the pile grows.

**This has already happened once**, in the shape it will happen again:
`exportOrdersCsv` was missing the equivalent exclusion that
`/admin/orders/page.tsx` had, so a CSV silently carried rows the screen it was
exported from did not show. Both queries were individually valid. Nothing caught
it for a release.

**The rule:** a new query against `Order` or `WineOrder` for an admin screen
spreads `...NOT_ABANDONED`. The inverse, `ONLY_ABANDONED`, exists for the one
screen that wants them. Neither is enforced by a type — they are plain object
spreads — so this note is the enforcement.

**Related, same file:** `paymentFilterWhere()` is the only place the three
payment filters are expressed, shared by the screen and the export so they cannot
disagree about what a word means. The three **partition** the orders exactly
(nothing in two buckets, nothing in none), because they drive a picker that shows
a count beside each option — and the previous release reported
`All statuses (31)` against 21 bookings because two entries overlapped. If you
add a fourth, keep the partition. `scripts/test-order-status.ts` section I
asserts it.

**Files involved:** `saas/lib/orderFilters.ts`,
`saas/app/admin/(panel)/orders/page.tsx`,
`saas/app/admin/(panel)/wine-orders/page.tsx`,
`saas/app/actions/orders.ts` (`exportOrdersCsv`),
`saas/app/actions/superAdmin.ts`, `saas/app/admin/(panel)/statistics/page.tsx`,
`saas/app/admin/(panel)/abandoned/page.tsx`.

---

## 29. `stage` is denormalised against the milestone timestamps, and three CHECKs hold them together

**What the dependency is:** Feature 191 stores an order's position twice — once
as `stage` (a `BookingStage` / `WineOrderStage` enum) and once as the timestamp
for that stage (`confirmedAt`, `completedAt` / `deliveredAt`). That is deliberate:
the board groups by `stage` and every filter and count reads it, which a derived
value could not serve efficiently.

Three database constraints keep the two honest, and **you will meet them as a
failed write, not as a type error**:

| Constraint | What it refuses |
|---|---|
| `Order_stage_has_timestamp` | `stage = 'CONFIRMED'` with `confirmedAt` NULL, or `'COMPLETED'` with `completedAt` NULL |
| `WineOrder_stage_has_timestamp` | the same for `'CONFIRMED'` / `'DELIVERED'` |
| `*_abandoned_is_unpaid` | `abandonedAt` and `paidAt` both set |

Only the **current** stage's own timestamp is required, on purpose: an admin
entering a walk-in order as already complete never passed through Confirmed, and
inventing a date there would be a lie.

**What this means in practice:** never write `stage` directly. Go through
`bookingStagePatch` / `wineOrderStagePatch` in `saas/lib/statusWrite.ts`, which
own the three rules that keep the constraints satisfied — an existing date is
never re-stamped, moving backwards clears what you moved back past, and
cancelling touches no dates at all. Seed scripts and optimistic client updates
call the *same* functions rather than restating the rules; two copies of "which
columns does this change move" is exactly the drift an optimistic update hides
until someone reloads.

**Files involved:** `saas/lib/statusWrite.ts`, `saas/lib/statusFlow.ts`,
`saas/prisma/migrations/20260917120000_status_stages_and_dates/migration.sql`,
`saas/app/actions/orders.ts`, `saas/app/actions/wineOrders.ts`,
`saas/lib/payments/settle.ts`, `saas/lib/demoSeed.ts`. Design:
`Features/Feature 191 - Order Status Two Axis Split.md`.
