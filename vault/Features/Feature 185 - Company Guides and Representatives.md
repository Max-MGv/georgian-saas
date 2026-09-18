---
tags: [feature, companies, booking]
---

# Feature 185 — Company Guides and Representatives

## What it does (user-facing)

Before this, a `Company` had exactly one `accessCode` and one set of contact fields
(`contactName`/`contactPhone`/`contactEmail`) doing double duty for "who to invoice" and "who to
call during the dinner." Now a company can have two separate, per-person lists, each managed from
its Edit Company panel:

- **Guides** — name + phone. Each gets its own unique code. Entering a guide's code on the public
  booking form identifies that specific person, not just the company — the phone that ends up in
  the booking (and therefore on the printed booking sheet, and in the admin Orders table) is
  *that guide's own phone*, not a generic company number.
- **Representatives** — name + email + phone. Who invoices get sent to. Never typed into a public
  form; picked manually by an admin from a dropdown when sending an invoice.

Both lists are fully optional. A company with zero guides configured keeps working exactly as
before — its booking form code check falls back to the company's own `accessCode`, same as every
company before this feature existed.

## Key design decisions

Recorded in full, with the open questions that led to them, in `Plan-CompanyGuidesAndReps.md`
Chunk 1. Summary:

- **One shared code namespace.** Guide codes, rep codes, and `Company.accessCode` all draw from
  one collision-checked pool **per tenant** (`generateUniqueTenantCode()`/`codeExistsInTenant()`
  in `companies.ts`) — this is what keeps the wine-order form's existing tenant-wide,
  code-alone lookup (`findCompanyByCode`) mechanically compatible even though wine orders didn't
  get guide/rep resolution in this pass.
- **`Order` gets one new relation: `guideId` only.** The phone-during-dinner case needs a specific
  order to remember which guide was used; representatives are never stored on an order — always a
  company-level list an admin picks from manually.
- **Wine orders are out of scope.** `WineCatalogueClient.tsx` is untouched; still uses
  `Company.accessCode`/`findCompanyByCode` exactly as before this feature.
- **No backfill.** `Company.accessCode` + contact fields are kept, untouched, as the permanent
  fallback for a company with zero guides — no migration of existing companies' data into a
  first "Guide" row, since a company's historical `contactName`/`contactPhone` was never
  necessarily "one guide's" info in the first place.
- **Uniqueness is per-tenant, enforced at the application level**, not a DB constraint spanning
  three tables — see `MaintenanceNotes.md` §26 for the coupling this creates.
- **The booking form has two independent code-resolution entry points** that must be kept in
  sync: `verifyBookingCode()` (a company is already chosen; the popup flow) and
  `findBookingCodeByCode()` (`hideCompanyDropdown` tenants — code alone, searched tenant-wide,
  no company chosen first). Both implement "guide codes first, `Company.accessCode` fallback"
  independently — see `MaintenanceNotes.md` §26.
- **Two of this plan's own original assumptions turned out wrong once the real code was read**,
  both caught and corrected during the build rather than carried through:
  - `BookingSheetPrint.tsx` was assumed to print `Company.contactName`/`contactPhone`. It
    actually prints the **guest's own form fields** (`Order.name`/`surname`/`phone`) — which the
    guide's autofill already populates, so Chunk 8 needed **no code change at all**.
  - The invoice "Send by Email" modal was assumed to have a manually-typed recipient field that
    should default to `Company.contactEmail`. It actually **hardcoded the order's own email with
    no alternative at all** and never read `Company.contactEmail`. Chunk 9 built the
    representative-as-recipient option from scratch rather than modifying an existing default.

## Files touched

- `saas/prisma/schema.prisma` — `CompanyGuide`, `CompanyRepresentative` models (JOIN-to-Company
  RLS, same shape as `Price`); `Order.guideId` (optional, → `CompanyGuide`)
  (migration `20260914180619_add_company_guides_reps`)
- `saas/scripts/setup-rls.ts` — GRANT + RLS policies for both new tables
- `saas/scripts/test-guides-reps-rls.ts` — two-tenant cross-isolation test (copy of
  `test-payment-rls.ts`'s pattern), 8/8 passing
- `saas/app/actions/companies.ts` — `generateUniqueTenantCode`/`codeExistsInTenant` (shared
  per-tenant code pool), `verifyBookingCode`, `findBookingCodeByCode`; `createCompany`/
  `regenerateAccessCode`/`setAccessCode` updated to use the shared pool
- `saas/app/actions/companyGuides.ts` — full CRUD + code regeneration for both entity types
- `saas/app/admin/(panel)/companies/CompaniesClient.tsx` + `page.tsx` — `GuidesSection`/
  `RepresentativesSection` in the Edit Company panel, `PersonCodeField` (show/hide/copy/
  regenerate, compact row version of the existing company-level code control)
- `saas/components/BookingForm.tsx` — `matchedGuideId` state, dropdown-flow popup now calls
  `verifyBookingCode`, direct-entry variant calls `findBookingCodeByCode`, `buildBookingPayload()`
  carries `guideId`
- `saas/app/actions/createBooking.ts` — `guideId` on `BookingFormData`, re-verified against the
  booked company/tenant before being stored on the created `Order`
- `saas/app/actions/orders.ts` — `sendOrderInvoice()` gained an optional `recipientEmail` param,
  re-validated against the order's company's representatives
- `saas/app/admin/(panel)/orders/OrdersTable.tsx` + `page.tsx` — `invoiceRecipientOptions()`,
  a recipient dropdown in the Send Invoice modal when a company order has more than one candidate
- `saas/lib/adminT.ts` — new `companies.people.*` and `orders.emailModal.guestEmail` keys, EN + KA
- `saas/tests/tier2-core-flows/company-guide-code.spec.ts` — new coverage (see "What to test")
- `saas/tests/helpers/payments.ts` — `openCompanyEditPanel`/`clickUntil`/`editPanelHeading`
  exported for reuse by the new spec (no behavior change)

## Edge cases handled

- A company with zero guides: booking form falls back to `Company.accessCode` exactly as before
  this feature — no popup-copy change, no gating on "must add a guide first."
- A client-sent `guideId` on `createBooking()` is re-verified server-side to actually belong to
  the booked company under the current tenant before being trusted — never stored as-is.
- A client-picked invoice recipient email is re-validated server-side against the order's
  company's actual representatives (or the order's own email) before `sendOrderInvoice()` uses it.
- Code uniqueness collisions: `generateUniqueTenantCode()` retries up to 10 times against the
  shared pool; a manually-set code (`setGuideCode`/`setRepresentativeCode`/`setAccessCode`)
  is rejected with an explicit error if it collides with anything else in the tenant.

## What to test

- Add a guide to a company with an existing `accessCode`; confirm the booking form's code popup
  resolves the guide's code first and autofills the guide's own name/phone (verified live in the
  session that built this — see `Plan-CompanyGuidesAndReps.md` Chunk 5's resume notes).
- A company with zero guides still gates on its own `accessCode` exactly as before.
- Add a representative with an email; confirm the "Send Invoice by Email" modal offers them
  as a recipient option alongside the order's own email (verified live — Chunk 9).
- `tests/tier2-core-flows/company-guide-code.spec.ts` covers the guide-code-resolves /
  wrong-code-still-errors pair automatically — confirmed passing twice in a row
  (`npx playwright test tests/tier2-core-flows/company-guide-code.spec.ts`, ~44s and ~47s), with
  no leftover `CompanyGuide` row afterward (checked directly against the dev DB).
