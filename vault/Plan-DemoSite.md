---
tags: [plan, marketing, demo, vineworks]
---

# Plan — vineworks.ge Marketing Site + demo.vineworks.ge Live Sandbox

Status: 🚧 In progress — phase 1 (demo tenant) started 2026-09-10.

## Progress

**2026-09-10:** Created `saas/scripts/clone-nm-to-demo.ts` (same pattern as `clone-nm-to-staging.ts`) and ran it against the **dev** database. Clones Nikalas Marani's structural data (settings, site content, companies + price tiers, wines + vintages, menu items, masterclass items) into a new tenant — deliberately excludes orders/bookings and auth users, so it starts clean.

- **Tenant ID:** `cmtvgl6e60000vl6w9se65t86` (dev DB)
- **Slug:** `vineworks-demo` / **Display name:** Vineworks Estate
- **Domain:** not yet set — currently `demo.placeholder.local`, a placeholder. Real cutover to `demo.vineworks.ge` needs (a) adding the domain in Vercel (auto-configures, no DNS work — same as the `nikalasmarani.vineworks.ge` migration) and (b) deciding whether this tenant lives in dev or prod DB (see below), both **pending Max's go-ahead** since this is production-facing infra, not a local-only change.

Previewed locally (temporarily pointing `DEFAULT_TENANT_ID` at the new tenant, then reverted) — confirmed the multi-tenant routing/theming pipeline works end to end (browser tab correctly read "Vineworks Estate — Book a Visit"). **However:** the actual page content (logo, hero copy, nav labels, About/Contact text) is still verbatim Nikalas Marani's, since the clone copies real `SiteContent` strings and the real logo file — only the `Tenant.displayName` field changed. **This needs a rebranding pass before it's shown to anyone**: replace the logo, and rewrite the cloned hero/about/contact copy to a fictional "Vineworks Estate" identity instead of Nikalas Marani's real one. Not yet started.

### Decision needed: which database does the live demo tenant belong in?
The current clone lives in **dev**, which was the safe place to build and test it. But `demo.vineworks.ge` (a real public subdomain of the live `vineworks.ge` production domain) needs to be reachable by anyone — and only the **prod** Vercel deployment (`master` branch) serves the production custom domains; the dev DB is only reachable via internal staging preview URLs. So going live for real means re-running the clone script against **prod** (or migrating this dev tenant's data across), the same way Nikalas Marani's own domain cutover was a deliberate prod-DB step, not something done on staging. Flagged here rather than assumed — this is a "confirm before shipping" moment per [[ClaudeInstructions]] rule 0.

**2026-09-10 (cont'd) — rebranding pass:** Built a generic wordmark logo (`saas/public/icons/logo-vineworks-demo.svg`, "VineWorks / Estate & Vineyard") and three follow-up scripts (`rebrand-demo-tenant.ts`, `-2.ts`, `-3.ts`) that scrub Nikalas Marani's real identity out of the cloned rows: logo, Georgian about-page copy, hero subtitle, contact email/Instagram/Facebook/map embed, **and — found only by a final broad grep pass, not the first pass — the real phone number, address, and full banking details (IBAN + bank code)**, which would have been exposed to anyone who got into the demo's admin settings panel even though they never appear on the public site. Worth remembering for any future "clone a real tenant into a public demo" work: a name/brand-string search alone misses phone numbers, banking details, and other non-name PII — do a broader identifier sweep, not just a brand-name one.

Verified in browser: nav logo, hero card, and contact page all now show VineWorks/generic placeholders; vineyard background photography (not branded) was left as-is.

**Not yet touched:** wine bottle product photos (`public/images/products/*.png`) — not checked for visible label branding; About page beyond the 2 Georgian paragraphs already fixed; English about-page copy (was already generic, not NM-specific, so left alone).

**2026-09-10 (cont'd) — role switcher + demo admin:** Decision: leave wine bottle photos as Nikalas Marani's real product shots for now (Max can swap them later via the Wines admin's inline image picker — no code needed) — explicitly deferred, not forgotten.

Built the full role-switcher flow:
- `saas/scripts/create-demo-admin.ts` — created a dedicated Supabase auth user (`demo-admin@vineworks.ge`, dev project) locked to the demo tenant via `app_metadata.tenantId`. Deliberately not treated as a real secret — its whole purpose is to be clicked into by anonymous visitors — but recorded in `credentials.txt` for reference anyway, same convention as every other tenant's admin login.
- `saas/lib/demoTenant.ts` — exports `DEMO_TENANT_ID`/`DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` as the single source of truth other demo-specific code reads from. **Flagged inline**: `DEMO_TENANT_ID` is the dev-DB tenant ID and must be updated to the prod tenant's ID once the prod cutover happens.
- `saas/components/DemoModeBanner.tsx` — sticky top banner, renders nothing unless `tenantId === DEMO_TENANT_ID`. On the public site it's a one-click "Winery Admin View →" button that signs in as the demo admin and redirects to `/admin/orders`; on the admin side it flips to "← Customer View". Wired into both `saas/app/(site)/layout.tsx` and `saas/app/admin/(panel)/layout.tsx` (both already had `tenantId` in scope from `getTenantId()`, so no new data-fetching needed).

**Verified end-to-end in browser**: banner shows correctly on the public homepage → click "Winery Admin View" → auto-signs-in → lands on `/admin/orders` showing the demo tenant's own branded nav (no Nikalas Marani leakage) and "0 bookings" (clean slate, as designed) → banner correctly flips to "← Customer View". This is the exact "book as customer, flip to admin, see it land" moment the plan called the most distinctive part of the demo — the plumbing for it now exists, though the *booking* half of that loop (visitor actually completing a booking, then seeing it appear) hasn't been separately tested yet.

**2026-09-10 (cont'd) — independent QA pass:** Ran a subagent with no prior context through the demo tenant fresh, specifically to test without the building session's own bias. **Critical test PASSED**: booked a visit as a customer on the public site, switched via "Winery Admin View," and the exact booking appeared correctly in `/admin/orders` with all fields matching. Also tested the wine-order flow → `/admin/wine-orders`, also PASSED, but surfaced a real bug along the way (not demo-specific — see below). Role switcher itself (banner text/buttons, "← Customer View" return path) confirmed clean on both sides, no leftover Nikalas Marani branding anywhere.

**Bugs found during testing, logged to [[KnownBugs]]:**
- **Moderate, affects the real product**: the wine order form's "Actual address of bar / restaurant" field is silently `required` even for individual customers, with zero visual indication or error feedback — submit button just does nothing when it's blank. Not fixed yet, not demo-specific.
- **Low, cosmetic data issue**: both "Rkatsiteli" wines (a white grape) are tagged "RED DRY" in the cloned catalogue — since this came from NM's real data, may be a real data-entry mistake on the actual live site too, worth Max checking directly.
- Minor: one console warning about an empty `img src` on the homepage in some state — didn't visibly break anything.

Neither bug blocks the demo (both are edge-case/cosmetic), so proceeding to the prod cutover next rather than fixing them first — flagged for Max to decide when to schedule.

### Still not started
- Guided checklist overlay ("1. Browse wines → 2. Book → 3. Switch to admin → ...")
- Prod cutover: add `demo.vineworks.ge` in Vercel, re-run `clone-nm-to-demo.ts` + `rebrand-demo-tenant*.ts` against prod, update `DEMO_TENANT_ID` in `lib/demoTenant.ts`, set the new tenant's `Tenant.domain`
- Nightly reset + abuse guardrails (rate limiting on public-write actions, suppressed emails) — required before wide/public sharing, not before an internal soft preview
- Onboarding-wizard-as-demo (the distinctive idea flagged in the original plan) — still not started, needs the disposable-tenant-per-visitor question resolved first
- The two bugs above (wine-order address field, Rkatsiteli mislabeling)

---

Sketched 2026-09-10 after competitor research — see chat log for sources.

---

## Goal

Turn `vineworks.ge` into the sales front door for the SaaS product (currently branded internally as the georgian-saas platform, client-facing as "Vineworks"), with `demo.vineworks.ge` as a live, self-serve sandbox tenant that lets a prospect click around the real product — not a video, not a form-gated sales call.

Research backing this (full detail in chat 2026-09-10): the self-serve live-sandbox pattern (Shopify B2B Demo Store, BookingPress, Booknetic, Bookeo's customer/admin toggle) converts better for smaller, less brand-known vendors than the gated "book a call" pattern (FareHarbor, Toast, Checkfront) — we don't have the brand trust to make someone wait for a human before seeing the product.

---

## Why this is cheap for us specifically

The platform is **already multi-tenant** ([[RLS-Architecture]], [[MigrationNotes]]). Standing up a demo tenant is not a special build — it's the exact same "onboard a new client" checklist we already have, run once:

1. Insert a `Tenant` row (`slug: 'demo'`, `domain: 'demo.vineworks.ge'`)
2. Add the domain to Vercel + DNS
3. Seed it with good-looking data (wines, companies, bookings, orders) instead of a real client's data
4. Point a Supabase admin user at it, tenant-locked, for the "Winery Admin" login

No new routing, no new auth model, no new theming system — we'd just be exercising the multi-tenant machinery that already exists, which is itself a good sign the product is ready to be shown off this way.

---

## Site structure

### `vineworks.ge` — marketing/landing (new build)
- Hero + one-line value prop, primary CTA → `demo.vineworks.ge`
- Feature sections (see mapping below), each with a screenshot/GIF and a deep link into the live demo at the relevant screen
- Pricing (even if "contact us" for now)
- Case study slot for Nikalas Marani once they're comfortable being referenced publicly
- Secondary CTA → real "Book a call" / Calendly-style form for prospects who want a guided walkthrough (offer both patterns — self-serve for the curious, human touch for the serious buyer, matching what Bookeo/BookingPress do alongside FareHarbor-style sales assist)

### `demo.vineworks.ge` — live sandbox tenant (uses existing multi-tenant infra)
A real `Tenant` row like any client, seeded to look like an established winery ("Vineworks Estate" or similar), not an empty shell.

**Role switcher** (borrowed from Bookeo's customer/admin toggle) — a persistent banner/pill, not buried in a menu:
- **"View as Customer"** → the public site: wine catalogue, booking form, ordering flow
- **"View as Winery Admin"** → `/admin` for that tenant: CRM/orders, statistics, settings, theming

The powerful moment (per our earlier discussion) is showing the *link* between the two: book a tasting as "Customer," flip to "Admin," see it land live in Orders. This is worth a scripted step in the guided tour, not just left to be discovered.

**Demo Mode banner**: small persistent bar ("You're exploring a live demo — resets nightly") on every page of the sandbox, so visitors don't mistake it for a real business and don't feel bad about clicking around.

---

## Feature-to-existing-feature mapping

Every item on Max's list already exists in the product — this is a showcase problem, not a build problem, except for the tour layer and the demo tenant itself.

| Sales pitch item | Existing feature to point at |
|---|---|
| Wine e-commerce | Wine catalogue + reservation/order flow ([[FeatureLog]] #13, #14, #34) |
| Booking / reservation | Public booking form, calendar, blocked dates, guest-count rules ([[FeatureLog]] #1, and the blocked-dates/min-guest work) |
| Backend CRM (order management) | `/admin/orders`, order detail edit, statistics dashboard, wine-orders status stepper ([[FeatureLog]] #3, #4, #38, wine order stats) |
| Custom theming and branding | Super-admin theme presets, per-tenant logo/favicon, `x-tenant-theme` (see [[MigrationNotes]] cache note) |
| Ability to change site contents easily | `/admin` site-content editor ([[MultiTenantSiteContent]]) |
| Super easy onboarding wizard | `/admin/onboarding` ([[Plan-OnboardingFlow]], #127) — **this one is worth demoing directly, not just describing**: let a visitor actually run the onboarding wizard against a disposable temp tenant, so they experience "how easy it is to set up" first-hand rather than reading a bullet point about it |

That last one is the most distinctive thing in this whole demo, since none of the competitors researched showed onboarding as part of their public demo — it's normally hidden behind the sales call. Showing it live is a genuine differentiator worth leading with.

---

## Guided tour layer

Raw self-serve access to an unfamiliar admin panel is confusing to a cold visitor (this is why FareHarbor/Toast default to a human walkthrough instead). Mitigate with a lightweight scripted path rather than a full tour library:
- A short numbered checklist pinned in the corner: "1. Browse wines → 2. Book a tasting → 3. Switch to Admin → 4. See your booking land → 5. Try the onboarding wizard"
- Each step deep-links to the right screen; no login required to reach the "Admin" side of the demo tenant (auto-authenticated into a locked-down demo admin session)
- Skip building a heavyweight tooltip-tour product (Appcues-style) for v1 — the checklist is enough to structure the same self-exploration pattern Shopify's demo store uses, at a fraction of the effort

---

## Operational concerns (new, not present in normal client onboarding)

- **Nightly reset**: cron or scheduled job that truncates and re-seeds the demo tenant's data (orders, bookings, wine-order statuses) so it doesn't degrade from visitor tinkering or accumulate junk/offensive input. Reuse the existing seed-script pattern ([[FeatureLog]] #8) pointed at the demo tenant ID instead of dev.
- **Rate limiting / abuse**: public-write actions (booking, wine orders, onboarding wizard submissions) need light throttling on the demo tenant specifically, since it's the one tenant with no real business behind it to notice abuse.
- **No real emails sent**: booking/order confirmation emails ([[FeatureLog]] #21) should be suppressed or redirected for the demo tenant so visitors don't get real Resend emails, and so demo traffic doesn't consume the shared Resend quota headroom.
- **Keep the demo tenant out of platform-wide stats/billing counts** if/when a #client-count metric exists anywhere.

---

## Open questions for Max

- Does "Vineworks" replace "georgian-saas" as the product's public name everywhere, or just on the marketing site? (Affects copy, not code, for now.)
- Should the demo tenant's admin side be fully open (anyone can poke at settings/theming), or should visitors get a "reset to defaults" button instead of just waiting for the nightly cron?
- Do we want the onboarding-wizard demo to create a real temporary `Tenant` row per visitor (auto-expired after N hours), or replay it against a single shared sandbox that resets each time someone starts it? The former is more impressive (it's genuinely theirs while they explore) but is more infrastructure than the latter.

---

## Suggested phasing

1. **Demo tenant** — stand up `demo.vineworks.ge` using the existing onboarding checklist, seed good data, add role switcher + demo-mode banner. This alone is postable/shareable even before the marketing site exists.
2. **Guided checklist overlay** on the demo tenant.
3. **vineworks.ge marketing site** — can be built in parallel or after; links out to the now-working demo.
4. **Onboarding-wizard-as-demo** — the most distinctive piece; do it once the rest is solid, since it needs the disposable-tenant-per-visitor decision above resolved first.
5. Nightly reset + abuse guardrails — required before sharing the link publicly/at scale, not required for a soft internal preview.
