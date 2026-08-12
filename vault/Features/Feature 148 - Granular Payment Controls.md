---
tags: [feature, feature-148, plan, payment]
---

# Feature 148 — Granular Payment Controls

**Status: built, 2026-08-11.** Implemented on `staging` per this design, uncommitted (per this session's pattern — waiting on Max's review before commit). Migration `20260811113100_add_granular_payment_controls` applied to the **dev** database only. Backfill script ran and was deleted per the throwaway-script convention (§5 below has the exact result for the two real tenants). Everything below is the original design; it shipped essentially as written. Deltas from the original design, and what was verified, are noted inline where relevant — see the bottom of this note for a build-time summary.

This note is the design for a follow-on to [[Plan-OnlinePayment]] (#145).

## What it does

Today, once a tenant has `modulesOnlinePayment` on and Flitt credentials set, payment is taken for *every* order the same way — there is no way to say "take payment from individuals but not companies" or "trust this one company to skip payment while everyone else pays online." This feature adds that granularity, in two layers:

1. **Section-level toggles**, set by the tenant admin on `/admin/settings` next to the existing Flitt credentials: independent on/off switches for **Individuals**, **Companies**, and **Wine Orders**. A tenant can take card payment from individual walk-in bookings but leave companies on invoice, for example.
2. **Per-company override**, set by the tenant admin on the existing Companies edit panel (`/admin/companies`): a specific company can be marked to always skip payment ("trusted — reservation only") or always require it, regardless of what the Companies section toggle says for everyone else.

Nothing here changes who can turn the *module* on in the first place — that stays super-admin-only, exactly as it is today.

## Key design decisions

### 1. Precedence order — most specific wins, safety rules never overridden

```
1. modulesOnlinePayment off               → never take payment   (hard block)
2. Flitt credentials missing               → never take payment   (hard block)
3. totalPrice null or ≤ 0                  → never take payment   (hard block, unrelated config error)
4. price hidden from customer (companies   → never take payment   (hard block — anti-chargeback,
   only, via showCompanyPrice — unchanged                          §7.4 of Plan-OnlinePayment, NOT
   from today, see decision #5 below)                              touched by this feature)
5. Company.skipPayment === true            → skip payment (trusted)
   Company.skipPayment === false           → require payment  ↴  (still bounded by 1–4 above —
   Company.skipPayment === null            → fall through to #6      an override can't force payment
                                                                       through a hard block)
6. Tenant's section toggle for this order's
   section (Individuals / Companies /
   Wine Orders)                            → the default when no company override applies
```

Rule of thumb: **module-off and credentials-missing always win. A company override beats the section default. The section default is what applies when nobody said otherwise.** This mirrors the "most specific wins" pattern already used for pricing (`Price` tier lookup falls back tenant→company→default) so it isn't a new mental model for this codebase.

### 2. Where the per-company override lives: tenant-admin, on the existing Companies page — not super-admin

The brief float­ed super-admin as a possibility ("have from super-admin to give them the option... maybe some companies are trusted"), but re-reading `saas/app/admin/(panel)/companies/CompaniesClient.tsx` settles this: **Companies is entirely tenant-admin territory today.** There is no super-admin companies page at all — modules (`isBookingCompany`/`isWineOrderCompany`), pricing (`wineDiscountPercent`, `Price` tiers), and the access code all live in the tenant admin's own edit panel, with no cross-panel dependency. `wineDiscountPercent` is the closest existing precedent — a plain per-company override of a tenant-wide default (the "no discount" default), set entirely by the tenant admin, no super-admin involvement.

Putting the payment override in super-admin instead would mean a tenant admin managing "is this company trusted" for every other company property except this one — an awkward split with no real security benefit (the tenant admin already fully controls whether the module and credentials are on for the whole tenant; a company-level nuance is strictly less powerful than that). **Recommendation: tenant-admin only, in the existing Companies edit panel**, right where `wineDiscountPercent` already lives. Tradeoff called out for the record: this does mean a tenant admin could set a company to "always require payment" even for a customer relationship the winery owner would rather bill by invoice — same trust level the admin already has over every other company setting, so not a new exposure.

### 3. Three-state override, not a boolean

`Company.skipPayment` is a **nullable boolean**, not a two-value flag:

- `null` (default) — no company-specific rule; follow the Companies section toggle.
- `true` — always skip payment for this company (the "trusted" case from the brief).
- `false` — always require payment for this company, even if the Companies section default is off.

Two states (`isTrusted: boolean`) would only cover the "some companies skip, most pay" direction. The symmetric case — most companies skip by default, but one specific account should always pay online — is equally realistic (e.g. a company that used to pay by invoice late) and costs nothing extra to support once the field is nullable rather than a plain boolean. No new Prisma enum needed — `Boolean?` is consistent with this schema's existing style for optional per-row values (`wineDiscountPercent Float?`, `accessCode String?`).

### 4. Schema changes

```prisma
model Tenant {
  // ...existing fields...

  // Granular payment controls (#148). Independent per-section switches for
  // whether a tenant takes online payment at all in that section — separate
  // from modulesOnlinePayment (can the tenant take payment at all) and from
  // showCompanyPrice (a privacy setting, unrelated to payment intent — see
  // decision #5). All three default true so a tenant flipping modulesOnlinePayment
  // on for the first time gets today's "payment everywhere it's structurally
  // possible" behavior with no extra steps.
  paymentEnabledIndividuals Boolean @default(true)
  paymentEnabledCompanies   Boolean @default(true)
  paymentEnabledWineOrders  Boolean @default(true)
}

model Company {
  // ...existing fields...

  // Per-company override of the tenant's Companies section toggle (#148).
  // null = follow paymentEnabledCompanies; true = always skip (trusted,
  // reservation-only); false = always require (bounded by the hard blocks
  // in shouldTakePayment — cannot force payment through a missing price or
  // a module that's off). Applies to this company's bookings and wine
  // orders alike — see edge case notes below on why it isn't split per-module.
  skipPayment Boolean?
}
```

**`paymentEnabledCompanies` default is `true` at the Prisma level (for new tenants going forward) but existing tenants need a one-time backfill, not the blanket default** — see decision #5.

### 5. Backward compatibility — and the one deliberate behavior change

**Individuals and Wine Orders: zero behavior change, by construction.** Today, once module+credentials are on, individual bookings and wine orders *always* take payment (when price > 0) — there's no existing condition gating them further. Defaulting `paymentEnabledIndividuals` and `paymentEnabledWineOrders` to `true` for every tenant, new and existing, reproduces exactly what already happens. Nothing to migrate.

**Companies is where care is needed.** Today's actual behavior (from `createBooking.ts` line ~189) is:

```
priceShown = bookingType === 'INDIVIDUAL' || showCompanyPrice === 'true'
```

`showCompanyPrice` (`show_company_price_after_booking`) is a **privacy setting** — whether the company sees its negotiated rate on the booking form — that has been silently doing double duty as the *only* thing that decides whether a company booking ever takes payment. That's the asymmetry flagged in the background research: wine orders always pass `priceShown: true` regardless of company, so they always take payment when eligible; bookings only take payment for companies as an accidental side effect of a setting that was never meant to control payment.

**This feature resolves that, on purpose, not as a side effect.** `paymentEnabledCompanies` becomes the single, explicit, intentional control for "does this tenant want to take card payment from companies at all" — independent of whether the price is shown to them. The hard privacy/anti-chargeback rule stays exactly as-is (step 4 in the precedence table: you can never charge for a price the customer wasn't shown), but it's no longer also acting as the payment on/off switch for the whole Companies section.

**To ship this with zero behavior change on day one**, the migration is two steps, matching this codebase's existing pattern for additive-then-backfilled tenant config (Feature 128, Legal Pages — new tenants seed automatically, existing tenants get a one-time backfill script):

1. Schema migration adds `paymentEnabledCompanies` with a Prisma-level `@default(true)` — this is what new tenants get.
2. A one-time backfill script (`saas/scripts/backfill-payment-section-defaults.ts`, deleted after running, same throwaway-script convention already used in this project) sets, for every **existing** tenant: `paymentEnabledCompanies = (getSetting('show_company_price_after_booking') === 'true')`. This reproduces each tenant's actual live behavior bit-for-bit at the moment of cutover — Nikalas Marani and Staging Winery see no change the day this ships, whatever their current `show_company_price_after_booking` value happens to be.

**The heads-up for Max:** after this ships, flipping `show_company_price_after_booking` on `/admin/settings` will **only** control price visibility again — it will no longer, as a side effect, also turn company payment-taking on or off. If Max has been relying on "turn off show-company-price" as a de facto way to stop charging companies, that stops working once this is built; the new **Companies** toggle next to the Flitt credentials is what controls that going forward. This is exactly the coupling the feature is designed to remove, so it's presented as an intentional improvement, not a bug — but it's a real behavior change worth mentioning before it ships, since it changes what one existing setting does.

## Edge cases

- **Company override during a hard block.** `skipPayment: false` ("always require") cannot force payment through module-off, missing credentials, a zero/null price, or a hidden company price — those remain absolute. The override only resolves the choice between "section default" and "company-specific," never bypasses the safety rules from Plan-OnlinePayment §7.
- **The "Individuals" pseudo-company is out of scope for the override.** `Company.isIndividual = true` rows exist today purely as a pricing-tier container (`createBooking.ts` looks one up by `{ tenantId, isIndividual: true }` to find the walk-in price tiers) — individual bookings never set `Order.companyId`, so there is no company row to attach an override to for that flow. The Individuals *section* toggle is the only lever for that case; a per-row override on the Individuals company would be inert. Worth a one-line mention in the Settings UI copy so it isn't a confusing dead end if someone looks for it there.
- **One override field covers both modules a company can participate in**, not split into `skipPaymentForBookings` / `skipPaymentForWineOrders`. "Trusted" reads as a property of the business relationship in the brief's own phrasing ("some companies are trusted, some are not"), not something wineries are likely to want asymmetric per-module on day one. Flagged here as the one place this design intentionally under-builds relative to what's theoretically possible — split it later if a real tenant asks for asymmetric trust.
- **A company with no override and its section toggle later flipped off** keeps working correctly with no data change needed — `skipPayment` stays `null`, so it just starts following the new section value. No migration required when a tenant changes their mind about a section.
- **Cross-tenant safety**: `skipPayment` lives on `Company`, which is already `tenantId`-scoped and RLS-protected — no new isolation surface, unlike `Payment` was when it was introduced in #145.

## Files that would need to change

| File | Change |
|---|---|
| `saas/prisma/schema.prisma` | `Tenant.paymentEnabledIndividuals/Companies/WineOrders` (all `Boolean @default(true)`); `Company.skipPayment Boolean?` |
| `saas/scripts/backfill-payment-section-defaults.ts` | **new, one-time** — sets `paymentEnabledCompanies` per existing tenant from `show_company_price_after_booking`, then gets deleted per this project's throwaway-script convention (see [[Plan-OnlinePayment]] §2) |
| `saas/lib/payments/shouldTakePayment.ts` | Extend `shouldTakePayment()` input with `section: 'INDIVIDUAL' \| 'COMPANY' \| 'WINE_ORDER'` and `companyId?: string \| null`; implement the precedence table above. `isPaymentConfigured()` likely needs the same `section`/`companyId` awareness so button labels ("Book" vs "Book & Pay") stay accurate per section |
| `saas/app/actions/createBooking.ts` | Pass `section` (`'INDIVIDUAL'` or `'COMPANY'`) and `companyId` into `shouldTakePayment()`; `priceShown` computation is unchanged (decision #5) |
| `saas/app/actions/submitWineOrder.ts` | Pass `section: 'WINE_ORDER'` and `companyId` into `shouldTakePayment()` |
| `saas/app/admin/(panel)/settings/SettingsClient.tsx` | Three new toggles inside the existing "Card payments" section (~line 622–738), below the credentials fields — Individuals / Companies / Wine Orders |
| `saas/app/actions/settings.ts` (or wherever `updatePaymentCredentials` lives) | New action to persist the three `Tenant` toggles, following the same "no secret ever returned to the browser" review discipline already applied to this section |
| `saas/app/admin/(panel)/companies/CompaniesClient.tsx` | New small "Payment" control in the edit panel (~line 244, same spot/pattern as the existing conditional Wine Discount section) — a 3-way control (Default / Always skip / Always require) for `skipPayment` |
| `saas/app/actions/companies.ts` (wherever `updateCompany` lives) | Accept and persist `skipPayment` |
| `saas/lib/adminT.ts` | New EN/KA keys for the three Settings toggles and the Companies override control (admin-only UI — no `scripts/seed-ka.ts` entry needed, that file is for the public-site `lib/t.ts` dictionary, not `adminT.ts`) |
| `saas/app/super-admin/tenants/TenantFormClient.tsx` | **Reviewed, not changed.** The module on/off + credential-presence gate stays super-admin; the three section toggles are operational payment config, which this codebase already treats as tenant-admin territory (that's where the Flitt merchant ID/secret fields live today). Keeping the new toggles in Settings next to those, rather than in TenantFormClient, avoids splitting one feature's config across two panels. |

## What to test

- Module-off regression: every new toggle must be irrelevant when `modulesOnlinePayment` is off — same as today.
- Backfill correctness: run the backfill script against a copy of real tenant data (or dev DB with `show_company_price_after_booking` set both ways) and confirm `paymentEnabledCompanies` lands correctly for each case, matching pre-migration `priceShown` behavior exactly.
- Each section toggle independently: Individuals on/Companies off/Wine Orders on (and other combinations) — confirm each section's checkout trigger appears or doesn't, independently of the others.
- Company override in both directions: a company with `skipPayment: true` inside a tenant with Companies section **on** must still get reservation-only; a company with `skipPayment: false` inside a tenant with Companies section **off** must still get sent to checkout (as long as price is shown and > 0).
- Override cannot beat a hard block: `skipPayment: false` company, price hidden (`showCompanyPrice` off) → still reservation-only. `skipPayment: false` company, credentials missing → still reservation-only.
- `skipPayment: null` (untouched company) behaves identically to today for that section.
- Individuals section toggle has no effect on company bookings and vice versa — section toggles are independent, not one shared flag.
- RLS: `Company.skipPayment` read/write only within the correct tenant (inherits existing `Company` RLS, but worth a direct check since it's new column exposure via a new admin control).

## Build-time notes (2026-08-11)

Implemented essentially as designed. Notable points from the build:

- **Backfill result for the two real tenants.** Dev only has one real-data tenant — **Staging Winery** (`name`), displayed as **"Nikalas Marani (Staging)"** (`displayName`) — these are the same tenant, not two separate ones; "Nikalas Marani" and "Staging Winery" in casual references both point at `cmrxb85wo0000vlc0d964nzf8`. Its `show_company_price_after_booking` was `'false'` (explicit Setting row) at backfill time, so it landed on `paymentEnabledCompanies = false`, reproducing its live behavior exactly (company bookings were already blocked by the price-hidden hard rule, so this is a no-op in practice for it too). The dev DB's other tenant, `Test Onboarding Wizard`, had no Setting row (default `'true'`) and landed on `paymentEnabledCompanies = true`. Production (Nikalas Marani proper) was **not touched** — this is a dev-only migration and backfill per the task's explicit scope.
- **`isPaymentConfigured()` callers not updated to pass `section`/`companyId` — resolved 2026-08-11, later the same day.** Originally flagged as a follow-up (all three call sites left unchanged, safe-by-construction fallback). Max asked to close it, with the explicit condition that it not change actual behavior anywhere. Resolution, after Max reviewed all three call sites himself first:
  - **`PaymentSetupBanner.tsx` — confirmed correctly out of scope, left unchanged.** It answers "is Flitt technically configured at all" (a tenant-wide setup-completeness question), not "is payment on for section X" — there's no single section for a whole-tenant banner. Added a one-line comment pointing here so it isn't "fixed" again by a future session that hasn't seen this reasoning.
  - **`app/(site)/wines/page.tsx` + `WineCatalogueClient.tsx` — real gap, fixed.** Every visitor to `/wines` is in the `WINE_ORDER` section — no ambiguity. `Company.skipPayment` added to the companies query's `select`, threaded through to the client so the button label can reflect a company's own override once selected (not just the section default).
  - **`app/(site)/page.tsx` + `components/BookingForm.tsx` — real gap, fixed.** The label is now computed reactively client-side in `BookingForm.tsx`, based on `bookingType` and the selected company's `skipPayment`, mirroring `shouldTakePayment()`'s own precedence.
  - **One correction made to the original follow-up brief during implementation:** the brief's suggested shape (`isPaymentConfigured(tenantId, {section:'INDIVIDUAL'})` / `{section:'COMPANY'}` as the only two values passed down) has a subtle gap — those two calls each collapse "module/credentials missing" and "section merely off" into the same `false`, so a company with `skipPayment: false` ("always require") could flip the label to "pay" even when the module is actually off, since the client-side override logic couldn't tell the two `false` cases apart. Fixed by fetching a third, separate signal — `isPaymentConfigured(tenantId)` with **no** section (module+credentials only, the exact original unscoped call, unchanged) — and gating the whole label computation on it *before* considering any company override, exactly matching where `shouldTakePayment()` checks its own hard blocks. Confirmed via a direct spot-check script covering this exact edge case (module off + company set to "always require") before and after the fix; the "before" shape would have shown a wrong label there, the shipped shape doesn't. Same pattern applied to `WineCatalogueClient.tsx` (`paymentConfigured` prop, checked first, before the company override).
  - **Also changed as a byproduct:** `WineCatalogueClient.tsx`'s `contactEmail` field's `required` attribute and placeholder now follow the same company-aware label flag (`paymentLabelActive`) instead of the old section-only `onlinePaymentEnabled`. This is client-side form validation UX only — `submitWineOrder.ts`'s own server-side backstop (`if (gate.takePayment && !contactEmail) return error`) was not touched and remains the actual requirement.
  - **Verification, without touching `shouldTakePayment()`:** a throwaway script re-implemented both components' exact label expressions (copy-checked against the source) and ran them against 5 constructed cases — including the specific module-off + always-require edge case — cross-checked against `shouldTakePayment()` called for real (`next/headers` mocked) and `isPaymentConfigured()` called for real. All 5 matched; the label never said "pay" in a case where the real gate would not. `grep` confirmed `showCompanyPrice`/`show_company_price_after_booking` does not appear in any new logic across all touched files (the pre-existing, unrelated usages in `(site)/page.tsx` and `BookingForm.tsx` — the price-visibility feature this setting has always controlled — are untouched). A light, non-interactive `playwright-cli` load of `/` and `/wines` confirmed both pages render with no console errors and the homepage's default INDIVIDUAL booking button correctly shows "Book & Pay". `npx tsc --noEmit` clean throughout.
- **Verified with a direct precedence spot-check script** (not the full Playwright suite — the dev Supabase project had seen connection-pool contention earlier the same session, see `playwright/KNOWN-ISSUES.md`). The script called `shouldTakePayment()` directly (with `next/headers` mocked, since it only works inside a real request scope) against 8 constructed cases covering every row of the precedence table above — module-off, price-hidden, override-beats-section-off, override-beats-section-on, null-falls-through both ways, INDIVIDUAL default, and totalPrice=0. All 8 matched the table exactly. UI persistence (Settings toggles, Companies 3-way control) was verified live via `playwright-cli` against the running dev server, not the Claude Code browser tool — the latter's click dispatch didn't reach React's event handlers in this environment (confirmed via an unrelated, pre-existing toggle, so not a bug in this feature's code). All test data (Setting value, Tenant toggles, `Company.skipPayment`) was reverted to its original state afterward.
