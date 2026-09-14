---
tags: [plan, companies, hierarchy]
---

# Plan — Company Guides & Representatives (third hierarchy level)

> **This is the live task tracker.** Update checkboxes and each chunk's Status line as work
> happens. **Chunks are sequential — do not start chunk N+1 until chunk N's Status is ✅**,
> unless a chunk's own notes say otherwise. If a session ends mid-chunk, note the resume point
> at the top of that chunk.

**Where this came from:** a conversation on 2026-09-14 to add a level below Company. Today
`Company` has exactly one `accessCode` and one set of contact fields (`contactName`,
`contactPhone`, `contactEmail`) doing double duty for both "who to invoice" and "who to call
during the dinner." Max wants those split into two real per-company lists — **Company Guides**
and **Back Office Representatives** — each entry with its own unique code. Confirmed in that
conversation:

- Same mechanism as today's company access code — entering a person's code both authenticates
  the booking/wine-order flow **and identifies that specific person**, not just the company.
- **Guides** → phone number to contact during the actual dinner/booking.
- **Representatives** → who invoices get sent to.
- Managed from the Edit Company screen: add/remove guides and reps, each gets its own code.

Full dependency map from that conversation (session transcript, 2026-09-14) — everywhere the
current single `accessCode` + contact fields are read or written:

`saas/app/actions/companies.ts` (code generation/verification), `saas/components/BookingForm.tsx`
+ `AccessCodePopupView.tsx` + `lib/accessCodePopupLabels.ts` (booking-side code popup + autofill),
`saas/app/(site)/wines/WineCatalogueClient.tsx` + `wines/page.tsx` (wine-order-side code popup +
autofill), `saas/app/admin/(panel)/companies/CompaniesClient.tsx` + `page.tsx` (admin edit panel),
`saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` (prints contact name/phone — this is the
sheet used *during* the dinner, i.e. where the guide's phone needs to end up),
`saas/app/admin/onboarding/steps/CompaniesStep.tsx` + `actions/onboarding.ts` (company creation
during tenant setup), `saas/lib/emails/templates/notifyNewCompanyTemplate.ts` (internal new-company
email), `saas/lib/demoSeed.ts` (demo data fabrication), plus tests that assert on `accessCode`
directly (`booking-enhanced.spec.ts`, `payment-label-precedence.spec.ts`, `tests/helpers/payments.ts`).

Prior design doc for the existing single-code system, useful for pattern/precedent:
[[Plan-CompanyAccessCodes]]. Pricing-tier-as-child-table precedent (the `Price` model) is the
closest existing shape for a new child table under `Company`.

---

## Context & dependencies (read before Chunk 1)

Everything below is what the 2026-09-14 conversation established by reading the actual code —
not assumptions. It exists so Chunk 1's decisions get made against the real shape of the system,
not a guess at it.

### Current data model

```prisma
model Company {
  id                  String      @id @default(cuid())
  name                String
  identificationCode  String?
  contactName         String?
  contactPhone        String?
  contactEmail        String?
  address             String?
  accessCode          String?
  isIndividual        Boolean     @default(false)
  isBookingCompany    Boolean     @default(true)
  isWineOrderCompany  Boolean     @default(false)
  wineDiscountPercent Float?
  skipPayment         Boolean?
  tenantId            String?
  orders              Order[]
  wineOrders          WineOrder[]
  prices              Price[]
}

model Price {
  id                         String  @id @default(cuid())
  companyId                  String
  company                    Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  minGuests                  Int
  maxGuests                  Int
  pricePerPerson             Float
  tastingLunchPricePerPerson Float   @default(0)
  registrationPrice          Float   @default(0)
  isDisplayPrice             Boolean @default(false)
}
```

`Order` carries `companyId String?` (nullable — an order need not belong to any company) plus
`requestedCompanyName String?`, set only when a booking comes through the "New Company?" flow
(Feature 180) before the winery has turned it into a real `Company` row. There is currently
**no** column anywhere on `Order` that identifies an individual person within a company — the
company relation is the finest-grained thing an order points at today.

`Price` is the closest existing precedent for "a list of child rows hanging off one company,
editable inline in the admin panel" — both the DB shape (`companyId` FK, `onDelete: Cascade`,
no own `tenantId`) and the RLS policy shape (JOIN to `Company` rather than a direct
`tenantId` column, per [[RLS-Architecture]]'s table) are the pattern `CompanyGuide` /
`CompanyRepresentative` should copy rather than invent something new.

### How the current single code actually works (the asymmetry that matters)

There are **two different lookup shapes** already in production, not one:

- **Booking form** (`BookingForm.tsx`): the visitor picks the company **by name** from a
  dropdown first, then types a code. That code is checked with
  `verifyCompanyCode(companyId, code)` — the company is already known; the code just proves the
  person belongs to it.
- **Wine order form** (`WineCatalogueClient.tsx`): there is no company-name dropdown — the
  visitor just types a code, and `findCompanyByCode(code, module)` searches **across every
  company in the tenant** for a match (scoped by `isBookingCompany`/`isWineOrderCompany` and
  excluding `isIndividual`).

This matters directly for the "one shared code namespace or two" question in Chunk 1: if guide
and rep codes need to be looked up **without knowing the company first** (to preserve the wine
order form's current UX), codes must be unique per **tenant**, not just per company. If the
booking form is the only place person-codes get typed, per-company uniqueness would be enough
there — but would break the wine-order path's code-alone lookup unless that path also learns the
company first. This is a real fork, not a style choice.

Two more pieces of existing behavior worth carrying into the decision:

- **[[MaintenanceNotes]] #1, Feature 180:** the booking form's code check runs **last**, after
  every other field validates. On failure it doesn't error — it opens `NewCompanyPopupView`
  pre-filled from the form. `buildBookingPayload()` is the single place both the normal submit
  and that popup's submit build the final `createBooking` payload. Any new field this feature
  adds to the booking form (e.g. "which guide matched") has to flow through that function, or a
  booking submitted through the popup silently drops it — this already happened once before
  (that's why the note exists).
- **`generateCode()`** (`companies.ts`) is an 8-char uppercase alphanumeric generator, and codes
  are stored/compared uppercased, case-insensitively. Whatever the new tables do should keep
  reusing this generator rather than inventing a second format.

### Full dependency list, with what each one actually does today

| File | Current role | What changes if codes move to guides/reps |
|---|---|---|
| `saas/app/actions/companies.ts` | `generateCode`, `createCompany` (auto-generates a code), `updateCompany`, `regenerateAccessCode`, `setAccessCode`, `verifyCompanyCode`, `findCompanyByCode`, `deleteCompany` | Needs parallel CRUD + verification for two new entity types; `verifyCompanyCode`/`findCompanyByCode` either get replaced or grow a "which entity matched" return shape |
| `saas/components/BookingForm.tsx` | Code popup gate, `applyProfile()` autofill from `Company.contactName/Phone/Email` | Autofill source becomes the matched guide/rep, not the company |
| `saas/components/AccessCodePopupView.tsx` + `lib/accessCodePopupLabels.ts` | Popup copy/labels for "enter your company code" | Copy may need to speak in terms of a person, not just a company, once one code = one guide/rep |
| `saas/app/(site)/wines/WineCatalogueClient.tsx` + `wines/page.tsx` | Code-alone company lookup + autofill for wine orders | Same resolution change as the booking form, if in scope (open question) |
| `saas/app/admin/(panel)/companies/CompaniesClient.tsx` + `page.tsx` | Edit Company slide-over: contact fields, access-code display/regenerate/set, Price-tier rows | Gains two new addable/removable sub-lists, modeled on the existing Price-tier rows UI |
| `saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` | Prints `contactName`/`contactPhone` — this is the sheet used **during the dinner itself** | Should print the **guide's** name/phone instead, once an order can identify which guide was used |
| `saas/app/admin/onboarding/steps/CompaniesStep.tsx` + `actions/onboarding.ts` | Company creation during tenant setup | Decide whether the wizard prompts for a first guide/rep, or defers to the Companies page |
| `saas/lib/emails/templates/notifyNewCompanyTemplate.ts` | Internal "new company requested" email includes contact info | Review whether it should mention guides/reps or stay company-level |
| `saas/lib/emails/invoiceEmail.ts` + `OrdersTable.tsx`'s "Send Invoice by Email" modal | Recipient email is currently typed manually in the modal, not pulled from `Company.contactEmail` | A **Representative**'s email is the natural default/suggested recipient once reps exist — currently nothing auto-populates this at all |
| `saas/lib/demoSeed.ts` | Fabricates `contactName`/`contactPhone`/`contactEmail` per demo company | Needs to fabricate at least one guide + one rep per demo company, or the demo tour's company-code flow silently breaks after the nightly reseed |
| `tests/tier2-core-flows/booking-enhanced.spec.ts`, `tests/tier1-regression/payment-label-precedence.spec.ts`, `tests/helpers/payments.ts` | Assert on `Company.accessCode` directly | Need updating to the new shape, plus new coverage for guide-code vs rep-code resolution |
| `saas/prisma/schema.prisma` / RLS setup | `Price` is the existing child-of-Company pattern (no own `tenantId`, JOIN-based RLS policy) | New tables copy this shape; needs the two-tenant RLS test per [[MaintenanceNotes]] #10, not just `check-rls.ts` |

### Key considerations / tradeoffs

1. **Backward compatibility with existing companies.** Every company that exists today has a
   single `accessCode` and contact fields already in use. Retiring them outright the moment
   guides/reps ship would break every existing company's booking flow until someone manually
   migrates each one. Options: (a) keep `Company.accessCode`/contact fields as a fallback when a
   company has zero guides/reps configured, (b) write a one-time backfill that turns each
   existing company's current code+contact into its first "Guide" row automatically, or (c)
   force a manual migration and accept a window where old companies are broken. This should be
   decided explicitly, not defaulted into.
2. **Granularity of what an `Order` remembers.** The phone-during-dinner requirement only makes
   sense if a *specific* order can say which guide was involved — a company-level "the guide" is
   meaningless once a company has several. That likely means `Order` needs a new optional
   relation (e.g. `guideId`), which is a small schema change but has ripple effects into
   `createBooking.ts`, `updateOrderEnhanced()`, and `assignOrderCompany()` (the three places that
   already independently re-derive company pricing per [[MaintenanceNotes]] #22 — worth checking
   whether guide assignment needs to hook into the same three places or is independent of them).
   Representatives may not need the same per-order tracking if invoicing is always handled after
   the fact by an admin picking a rep manually, rather than the rep being "the person who
   submitted the code."
3. **Wine orders in or out of scope.** Wine orders already have their own, structurally
   different, code-lookup flow (see asymmetry above). Extending guides/reps there is more work
   than the booking form alone and touches a form with no current company-name dropdown to give
   the lookup context.
4. **Uniqueness scope for codes**, per the asymmetry section above — per-tenant or per-company,
   and whether that answer differs between guides and reps.
5. **Are both lists optional, always, per company?** — e.g. a brand-new company with zero guides
   and zero reps configured: does the admin get blocked from anything, or does the booking flow
   just have no code gate at all for that company (mirroring today's "no `accessCode` set → no
   popup" escape hatch)?
6. **Naming/labels.** "Back Office Representative" is a specific, slightly formal label — worth
   confirming it's what should appear in the admin UI verbatim, versus a shorter "Representative"
   or "Billing Contact," before it's threaded through translations (`adminT.ts` already has
   Georgian labels for the current access-code UI — new labels need the same EN/KA treatment,
   per the pattern in [[MaintenanceNotes]] and `lib/adminT.ts`'s existing structure).

---

## Current status

| Chunk | What | Status |
|---|---|---|
| **1** | Data model decisions — lock the open questions before any code | ✅ Done |
| **2** | Schema + migration (dev DB) | ✅ Done |
| **3** | Server actions — CRUD + code verification for Guides/Reps | ✅ Done |
| **4** | Admin: Edit Company panel — Guides & Representatives sub-lists | ✅ Done |
| **5** | Booking form — code popup resolves to a guide/rep, not just a company | ✅ Done |
| **6** | Wine order form — same code-resolution change | ⬜ Not started (out of scope per Chunk 1) |
| **7** | Order record — remember which guide/rep was used | ✅ Done |
| **8** | Print/ops surface — booking sheet shows the guide's phone | ✅ Done (no code change needed) |
| **9** | Emails — new-company notification, invoice recipient | ⬜ Not started |
| **10** | Demo seed + onboarding — fabricate guides/reps so the demo/onboarding paths don't break | ⬜ Not started |
| **11** | Tests — update existing `accessCode` assertions, add coverage for the new lookup | ⬜ Not started |
| **12** | Vault + RLS checklist close-out | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Chunks 1-5, 7-8 done and pushed to `staging`. Remaining: Chunk 6 (wine
orders — confirmed out of scope, may need explicit re-confirmation with Max), Chunk 9 (emails),
Chunk 10 (demo seed + onboarding), Chunk 11 (tests), Chunk 12 (vault + RLS close-out + the
staging → master merge, which needs Max's go-ahead per Rule 0).

---

## Ground rules for every chunk

1. **[[ClaudeInstructions]] Rule 0** — schema changes via `prisma migrate dev` against the **dev**
   DB first, verified on `staging`, only then `prisma migrate deploy` to production as its own
   deliberate step. Everything here is a shared/tenant-facing file, so every chunk ships through
   `staging`, never straight to `master`.
2. **[[ClaudeInstructions]] Rule 8** — state the plan for a chunk and get a go-ahead before
   editing; Chunk 1's whole job is producing the decisions the rest of the chunks need, so it
   should be confirmed with Max explicitly before Chunk 2 starts.
3. **[[MaintenanceNotes]] #10** — any new tenanted table needs a real two-tenant RLS test
   (`test-payment-rls.ts` is the pattern), not just the green `check-rls.ts` existence check.
4. **[[MaintenanceNotes]] #22** — if guide/rep assignment ever touches pricing logic, remember
   the three separate places that already re-derive company-tier price
   (`createBooking.ts`, `updateOrderEnhanced`, `assignOrderCompany`) and keep them in sync.
5. Update `FeatureLog.md` as this moves from 🚧 to ✅ (per [[ClaudeInstructions]] Rule 4), and
   file a `Features/Feature NNN - Company Guides & Representatives.md` note per Rule 9 once the
   design in Chunk 1 is locked — this clearly touches 3+ files and has non-obvious state logic.

---

## Chunk 1 — Data model decisions

**Status:** ✅ Done (2026-09-14, decided by Claude per Max's go-ahead — "info in this plan is
considerations, not hard fact" — proceeding straight into build, no separate confirmation round)

Decisions:

- **One shared code namespace.** Guide codes, rep codes, and the existing `Company.accessCode`
  all draw from one collision-checked pool **per tenant**. This is what keeps the wine-order
  form's existing code-alone `findCompanyByCode` lookup (searches across every company in the
  tenant with no company selected first) mechanically compatible, even though wine orders aren't
  getting guide/rep resolution in this pass (see below) — nothing about the code format or
  uniqueness scope changes underneath it.
- **`Order` gets one new relation: `guideId` only.** The phone-during-dinner case needs a specific
  order to know which guide was used; invoicing does not need the same per-order memory —
  Representatives stay a company-level list an admin picks from manually when sending an invoice,
  never something typed into a public form or stored on an order. No `representativeId` column.
- **Wine orders are out of scope for this build.** `WineCatalogueClient.tsx` keeps using
  `Company.accessCode` / `findCompanyByCode` exactly as today. Guides/reps apply to the booking
  flow only. Revisit later if needed — noted as a real fork, not forgotten.
- **`Company.accessCode` + contact fields are kept, untouched, as the fallback.** A company with
  zero guides configured still gates its booking form on `accessCode` exactly as today (no
  backfill, no migration of existing data into a first Guide row — simplest option, zero risk to
  existing companies, and avoids inventing history for data that was never actually "one guide's"
  phone number in the first place). `createCompany()` keeps auto-generating an `accessCode` as
  it does today. New: the booking form's code check tries guide codes **first**, falls back to
  `accessCode` only if the company has zero guides — see Chunk 5.
- **Uniqueness scope: per tenant**, across `Company.accessCode` + `CompanyGuide.code` +
  `CompanyRepresentative.code` combined (consistent with the shared-namespace decision above).
  Enforced at the application level in `generateCode()`'s caller (retry-on-collision), not a DB
  constraint spanning three tables.
- **Both lists fully optional, always.** No admin-UI gating, no "at least one guide required"
  rule. A company with zero guides has no code gate on the booking form at all — same escape
  hatch as today's "no `accessCode` set → no popup".
- **Naming:** UI labels are **"Guides"** and **"Representatives"** (dropping the more formal
  "Back Office Representative" from the plan title — shorter, matches how the rest of this
  document already refers to them after the opening section).

---

## Chunk 2 — Schema + migration

**Status:** ✅ Done (2026-09-14)

- [x] Added `CompanyGuide` (id, companyId → Company, name, phone?, code, createdAt) — no own
  `tenantId`, JOIN-to-Company RLS, same shape as `Price`
- [x] Added `CompanyRepresentative` (id, companyId → Company, name, email?, phone?, code,
  createdAt) — same JOIN-based RLS shape
- [x] `Order` got `guideId` (optional, → `CompanyGuide`) per Chunk 1 — no `representativeId`
- [x] Ran `prisma migrate dev --name add_company_guides_reps` against the dev DB (no dev server
  was running, so no stop/restart needed), then `prisma generate`
- [x] `scripts/setup-rls.ts` extended: both tables added to `writableTables`, JOIN-to-Company
  policies added (copy of `Price`'s), re-run against dev DB
- [x] `scripts/test-guides-reps-rls.ts` written (copy of `test-payment-rls.ts`'s two-tenant
  pattern) — 8/8 passed

**Resume point:** —

---

## Chunk 3 — Server actions

**Status:** ✅ Done (2026-09-14)

- [x] `saas/app/actions/companyGuides.ts` — `createGuide` / `updateGuide` / `deleteGuide` /
  `regenerateGuideCode` / `setGuideCode`, mirroring `createCompany`/`regenerateAccessCode`/
  `setAccessCode`'s shape, plus the same 5 for representatives
  (`createRepresentative`/etc.) in the same file
- [x] `companies.ts` gained `generateUniqueTenantCode`/`codeExistsInTenant` (both async, so they
  can be exported from a `'use server'` file per [[MaintenanceNotes]] #24 — `generateCode` itself
  stays private/sync) — the shared per-tenant collision check used by every code-generating
  action across Company/Guide/Representative
- [x] `verifyBookingCode(companyId, code)` added to `companies.ts` for Chunk 5: tries the
  company's guides first (returns `matchType: 'guide'`, guide's own name/phone as the profile),
  falls back to legacy `Company.accessCode` (`matchType: 'company'`) only when the company has
  zero guides. `verifyCompanyCode`/`findCompanyByCode` untouched — wine orders still use them
  directly (Chunk 6 out of scope)
- [x] All new actions wrapped in `withTenantDb`, re-verify the parent Company's `tenantId` before
  touching a guide/rep row, same defense-in-depth pattern as `prices.ts`
- [x] `npx tsc --noEmit` clean

**Resume point:** —

---

## Chunk 4 — Admin: Edit Company panel

**Status:** ✅ Done (2026-09-14)

- [x] `CompaniesClient.tsx` edit panel gains two new sub-sections: **Guides** and
  **Representatives** (`GuidesSection`/`RepresentativesSection`), each an addable/removable list,
  same visual language as the existing Price-tier rows
- [x] Each row: name, role-specific field(s) (guide: phone; rep: email + phone), a compact
  `PersonCodeField` (show/hide, copy, regenerate — same interaction as the company-level code
  field, sized for a list row)
- [x] Wired to the Chunk 3 actions; `companies/page.tsx` now includes `guides`/`representatives`
  in its query; guide/rep edits update local panel state live (not a full-page reload like the
  Price-tier "add" flow) and propagate into the parent's `companies` list immediately so
  reopening the panel later in the same session isn't stale
- [x] New `companies.people.*` label keys added to `lib/adminT.ts`, EN + KA
- [x] `npx tsc --noEmit` and `npm run build` both clean
- [x] Verified live in the browser (dev server, dev DB, Nikalas Marani/Staging tenant): opened
  Edit Company, added a guide (name + phone, code auto-generated and masked, Show/Copy/Regenerate
  all work), added a representative (name + email, same code controls), deleted both — test rows
  removed, no leftover data

**Resume point:** —

---

## Chunk 5 — Booking form code resolution

**Status:** ✅ Done (2026-09-14)

- [x] `BookingForm.tsx`'s dropdown-flow code popup now calls the new `verifyBookingCode()`
  (companies.ts) instead of `verifyCompanyCode` — tries the company's guides first, falls back to
  `Company.accessCode` only when the company has zero guides
- [x] `applyProfile()` unchanged (already generic) but now receives the matched **guide's** own
  name/phone when one exists, instead of always `Company.contactName/contactPhone`
- [x] Direct-code-entry variant (`hideCompanyDropdown`, Feature 113/114) covered too — new
  `findBookingCodeByCode()` does the same guide-first/company-fallback search **tenant-wide**
  (no company chosen first, matching this variant's existing UX), used in
  `handleDirectCodeSubmit` in place of the old `findCompanyByCode` call
- [x] New `matchedGuideId` state tracks which guide (if any) matched; reset whenever the company
  selection changes, the code popup is dismissed via "Not a rep", or direct-code entry is cleared
- [x] `AccessCodePopupView.tsx` / `accessCodePopupLabels.ts` copy reviewed — left unchanged
  (still generically "enter the access code provided by the winery", which reads fine whether it
  resolves to a guide or the company fallback)
- [x] `buildBookingPayload()` extended with `guideId` per [[MaintenanceNotes]] #1's Feature 180
  note — flows through both the normal submit and the "New Company?" popup submit automatically
  since both call this shared builder
- [x] Verified live end-to-end in dev: added a guide with a distinct name/phone, entered that
  guide's code on the public booking form (dropdown variant), confirmed the popup closed and
  First Name/Last Name/Phone autofilled to the **guide's own** values (not the company's) — test
  guide then deleted, no leftover data

**Resume point:** —

---

## Chunk 6 — Wine order form code resolution

**Status:** ⬜ Not started
**Depends on:** Chunk 3, Chunk 1's answer on whether wine orders use this split at all.

- [ ] `WineCatalogueClient.tsx`'s `findCompanyByCode`-based flow updated to match Chunk 5's
  approach, if in scope
- [ ] If wine orders are explicitly out of scope (Chunk 1), note that decision here and skip

**Resume point:** —

---

## Chunk 7 — Order record

**Status:** ✅ Done (2026-09-14)

- [x] `createBooking.ts` stores the matched guide on the new `Order.guideId` column — re-verifies
  the guide actually belongs to `data.companyId` under the tenant before trusting a client-sent
  id (`verifiedGuideId`), same defense-in-depth pattern as the rest of this file
- [x] `updateOrderEnhanced()` / `assignOrderCompany()` in `orders.ts` reviewed — **left
  unchanged, deliberately**. Both only run after a booking already exists with no company
  attached (Feature 180's no-company path); there is no code-entry step at that point for an
  admin to attach a guide to, so there's nothing to wire. An admin can still manually note which
  guide a linked-after-the-fact order used, same as any other manual admin action — not a gap
  worth a UI for in this pass.

**Resume point:** —

---

## Chunk 8 — Print/ops surface

**Status:** ✅ Done (2026-09-14) — **no code change needed, confirmed by reading the file**

- [x] `BookingSheetPrint.tsx` read directly: its "contact name"/"contact phone" columns
  (`orders.sheet.contactName`/`contactPhone`) print `o.name`/`o.surname`/`o.phone` — **the
  guest's own form fields** — not `Company.contactName`/`contactPhone` as this plan's original
  dependency map assumed. Since Chunk 5's `applyProfile()` already autofills those exact form
  fields from the matched guide's name/phone, the printed sheet already shows the right guide's
  phone for any order where the guest didn't overwrite the autofilled fields — with zero changes
  here. `Order.guideId` (Chunk 7) remains useful as an unambiguous record of who matched even if
  the guest *does* edit the phone field afterward, but nothing needs to read it for this sheet.
- [x] `OrdersTable.tsx` checked — doesn't show company contact info at all today, nothing to swap

**Resume point:** —

---

## Chunk 9 — Emails

**Status:** ⬜ Not started
**Depends on:** Chunk 3.

- [ ] `notifyNewCompanyTemplate.ts` (internal "new company requested" email) — review whether it
  needs to mention guides/reps at all, or stays company-level
- [ ] Invoice send flow (`OrdersTable.tsx`'s "Send Invoice by Email" modal → `invoiceEmail.ts`) —
  if a **Representative**'s email should become the default/suggested recipient instead of a
  manually-typed address, wire that up here
- [ ] Confirm no email template needs a DB call added directly (per [[MaintenanceNotes]] #23 —
  templates in `lib/emails/templates/` must stay pure; any new lookup happens in the wrapper)

**Resume point:** —

---

## Chunk 10 — Demo seed + onboarding

**Status:** ⬜ Not started
**Depends on:** Chunks 2–3.

- [ ] `lib/demoSeed.ts` — fabricate at least one guide and one representative per demo company so
  the demo tour's company-code flow (and the "Per-company price ladders" Explore link,
  [[MaintenanceNotes]] #12) keeps working after the nightly reseed
- [ ] `app/admin/onboarding/steps/CompaniesStep.tsx` + `actions/onboarding.ts` — decide whether
  the setup wizard prompts for a first guide/rep at company-creation time, or leaves that for the
  Companies page afterward

**Resume point:** —

---

## Chunk 11 — Tests

**Status:** ⬜ Not started
**Depends on:** Chunks 2–8.

- [ ] Update `tests/tier2-core-flows/booking-enhanced.spec.ts` and
  `tests/tier1-regression/payment-label-precedence.spec.ts` — both currently assert on
  `accessCode` directly
- [ ] Update `tests/helpers/payments.ts` if it builds fixture companies with a bare `accessCode`
- [ ] Add new coverage: a guide code and a rep code both correctly resolve on the booking form;
  a wrong code still errors the same way; the printed sheet shows the right guide's phone

**Resume point:** —

---

## Chunk 12 — Vault + RLS close-out

**Status:** ⬜ Not started
**Depends on:** all prior chunks done and verified on `staging`.

- [ ] `SessionLog.md`, `FeatureLog.md`, `Roadmap.md` updated per [[ClaudeInstructions]] Rules 1/4
- [ ] `Features/Feature NNN - Company Guides & Representatives.md` written per Rule 9
- [ ] `RLS-Architecture.md`'s table-by-table list extended with the new table(s)
- [ ] `MaintenanceNotes.md` gets a new numbered entry if this introduces a coupling worth
  flagging for future changes (e.g. the guide/rep code-resolution logic now lives in more than
  one place, the way §22's pricing logic does)
- [ ] Confirm with Max, get the `staging` → `master` merge approval, then flip this plan's
  overall status to done

**Resume point:** —
