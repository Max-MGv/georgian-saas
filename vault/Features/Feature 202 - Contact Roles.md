---
tags: [feature, companies, contacts, booking, wine-orders]
---

# Feature 202 — Contact Roles (generalised company people)

**Built:** 2026-09-22 to 2026-09-23 · **Status:** ✅ built and verified on dev/`staging`, pending
production cutover · **Supersedes:** [[Feature 185 - Company Guides and Representatives]],
absorbs [[Feature 201 - Guide Picker After Company Code]] · **Resolves:** [[KnownBugs]] #56, #57

Full plan, Max's verbatim brief, every design decision and all twenty hurdles hit along the way:
[[Plan-ContactRoles]]. This note is the durable summary; the plan is the working history.

---

## What it does (user-facing)

Before this, a company had three separate contact concepts doing overlapping jobs:
`Company.contactName/contactPhone/contactEmail` (a single scalar "back-office" contact),
`CompanyGuide` (people who lead visits, each with their own access code), and
`CompanyRepresentative` (people invoices go to). Max's own review of that design: *"A company
should have ability to have Contact Person's & Guides. right now we have that + representative.
but thats 1 extra."*

Now a company has **one people list**, each person tagged with a **role** — Contact Person or
Guide today, more later without a migration. A company can have several people in each role;
**exactly one of each role is picked per order.** Entering the company's access code on a public
form now opens a picker for each role in turn (*"Who should we put on this booking?"*) — the
point is autofill, not authentication — and picking someone fills that role's fields (Contact
Person fills the classic First/Last Name; Guide fills its own Guide — Name/Guide — Phone block).
Guide fields only appear in the detailed booking variant. Wine orders get the identical
treatment (previously out of scope). Admin screens skip the popup and show the same role
dropdowns inline.

Per-person access codes are a tenant setting (`person_codes_enabled`), **off by default** — when
on, a person's own code identifies them directly and the picker is suppressed entirely, so
colleagues in different roles can't see each other's names/phones/emails.

## Key design decisions

Full reasoning and the 2026-09-19 conversation that produced them: [[Plan-ContactRoles]] §1/§2.

1. **Roles live in a dimension table (`ContactRole`), not an enum.** Adding "CEO" later is
   inserting a row, not shipping a migration — the explicit requirement the old design could not
   meet.
2. **One `CompanyPerson` table** replaces `CompanyGuide`, `CompanyRepresentative` **and**
   `Company.contactName/Phone/Email`.
3. **One polymorphic `OrderContact` table**, following `OrderEvent`/`Payment`'s shape, covers
   both `Order` and `WineOrder`. Carries `nameSnapshot`/`phoneSnapshot`/`emailSnapshot` — written
   once, never re-read from the live person — so deleting a person loses the *link*, never the
   *facts*. This is what closes [[KnownBugs]] #56.
4. **`Order.name/surname/phone/email` stay**, kept in sync with the `contact_person`
   `OrderContact` row by `syncOrderContactPerson()` — the only place those columns may be
   written now (see [[MaintenanceNotes]] #26, coupling 1).
5. **One shared resolver (`resolveCompanyContacts()`), one shared picker
   (`ContactPickerPopupView.tsx`), one shared hook (`useContactSelection()`)**, consumed by all
   four contact-autofill forms (public booking, public wine order, admin manual booking, admin
   manual wine order) — chosen deliberately over patching the missing fourth form once it turned
   out three near-identical implementations already existed. See §4b of the plan for the one
   honest asymmetry this left (public forms trigger the picker from a code popup; admin forms
   render the same choices inline with no code step).
6. **`company_access_codes_enabled` renamed `person_codes_enabled`** (it gates people's codes,
   not the company's), tenant-wide, default off.
7. **One person per role per order** — `@@unique([orderId, roleId])` / `@@unique([wineOrderId,
   roleId])`.
8. **No order backfill** — `Order.guideId` was dropped, not migrated (nothing ever read it — see
   Finding F1 below). Company-side data (guides/reps/contacts) **was** carried across into
   `CompanyPerson`, codes preserved verbatim, since that is real configuration someone typed.

## Findings that shaped the build ("don't break or orphan anything" — Max's explicit brief)

- **F1 — `Order.guideId` was write-only.** Written by `createBooking.ts`, read by nothing — no
  screen, print, or email. The dev DB had 0 orders with a `guideId` after 5 days live. The
  feature's actual attribution payoff only arrived with this rework's admin order surfaces
  (Chunk 10).
- **F2 — Deleting a guide silently erased which guide was on every past order.** Prisma's default
  `SetNull` on the old optional `Order.guide` relation. Fixed by the `OrderContact` snapshot
  design; regression-tested in `contact-orphan-safety.spec.ts`.
- **F3 — Every company's access code was served in the public homepage's HTML** (View Source on
  `/`). [[KnownBugs]] #57 — fixed by sending `hasAccessCode: boolean` instead of the real code.
- **F4 — Admin order screens passed full representative rows, including codes, into a client
  component** that only used id/name/email. Narrowed alongside F3's fix.
- **A1 (found by a 2026-09-22 blind audit, not by the original build) — the access-code gate was
  enforced only by the form, not the server.** `resolveCompanyContacts`, an unauthenticated
  server action, returned a company's full staff directory when given a company id and no code.
  Fixed the same day: the gate is now enforced server-side whenever a company has a code.

## Files touched

Schema: `saas/prisma/schema.prisma` (`ContactRole`, `CompanyPerson`, `OrderContact`,
`ContactScope`/`ContactApplies` enums) — migration `20260922101500_contact_roles`, hand-written
(carries across existing guide/rep/contact data rather than dropping it).

Server: `saas/lib/contactResolution.ts` (the one resolver), `saas/lib/orderContacts.ts`
(`writeOrderContacts`, `syncOrderContactPerson` — the one write path), `saas/app/actions/
contactRoles.ts` (role CRUD), `saas/app/actions/companyPeople.ts` (replaces
`companyGuides.ts`), `saas/scripts/setup-rls.ts` (RLS for all three tables).

Client: `saas/lib/useContactSelection.ts` (shared state machine), `saas/components/
ContactPickerPopupView.tsx` (shared picker render), `saas/components/BookingForm.tsx`,
`saas/app/(site)/wines/WineCatalogueClient.tsx`, `saas/app/admin/(panel)/orders/new/
NewOrderForm.tsx`, `saas/app/admin/(panel)/wine-orders/new/NewWineOrderForm.tsx` (all four
forms now thin consumers of the shared pieces).

Admin: new Contact Types management screen, Edit Company's role-driven people list, a Settings
toggle for `person_codes_enabled`, a Contacts card on order detail pages.

Seed/onboarding: `saas/lib/demoSeed.ts`, `saas/scripts/backfill-test-fixtures.ts`,
`saas/app/actions/onboarding.ts`, `saas/app/admin/onboarding/page.tsx` — moved off the dropped
columns/tables onto `CompanyPerson`; `saas/app/actions/superAdmin.ts` (`createTenant()`) now
seeds the two system `ContactRole` rows for every new tenant (Chunk 14 — this was a gap in
every earlier chunk, found in Chunk 12, closed here).

Tests: `saas/scripts/test-contact-roles-rls.ts` (19/19, two-tenant), `saas/scripts/
test-order-contacts.ts` (36/36, write-path + snapshot behaviour), `saas/tests/
tier2-core-flows/contact-role-picker.spec.ts` + `contact-orphan-safety.spec.ts` (replace
`company-guide-code.spec.ts` + `guide-picker.spec.ts`, both deleted).

## Edge cases handled

- A company with zero people in a role: that role's fields stay blank, same as "I am not on this
  list" — there is no company-level fallback anymore (Contact Person is itself a per-order role).
- A matched person only fills the field block for the role they matched under — a guide's own
  code fills the Guide block, never First/Last Name (hurdle H20).
- Switching company mid-form (public wine order) clears every role's typed fields, not just the
  hook's own state — a gap (H3 recurring) caught by the 2026-09-22 audit and fixed.
- A role's phone typed before its name no longer discards every keystroke (audit finding A4).
- Deleting a role that still has people is refused (`Restrict`), not silently cascaded.
- Deleting a person leaves the link gone but the snapshot intact on every past order (F2).

## What to test

Automated: `scripts/test-contact-roles-rls.ts` (RLS, 19/19), `scripts/test-order-contacts.ts`
(write path + snapshots, 36/36), `tests/tier2-core-flows/contact-role-picker.spec.ts` (5/5) +
`contact-orphan-safety.spec.ts` (1/1) — run with `--workers=1` (running the whole
`tier2-core-flows/` directory at default parallelism overloads the dev server and produces
unrelated login timeouts, see hurdle in [[Plan-ContactRoles]]).

Manual, once on `staging`: pick a company with 2+ Contact Persons and 2+ Guides on each of the
four forms; confirm the picker (or, on admin, the inline dropdown) offers every role in turn,
autofill lands in the right field block per role, "I am not on this list" leaves that role
blank, a wrong code is still rejected, and with `person_codes_enabled` on, a person's own code
skips the picker while a company code is accepted with the picker suppressed. Confirm an
existing order's Contacts card still shows the right name after the person is deleted from the
company.

## Chunk 14 addendum — a fifth silent write site, found by a blind audit

A second fenced-off audit (vault access removed, given the brief and decisions inline) confirmed
9 of the 10 decisions and 3 of the 4 "don't break" checks solid, and found one real defect:
`lib/demoSeed.ts` wrote `Order`/`WineOrder`'s denormalised contact columns directly from the seed
spec but never wrote a matching `OrderContact` row — a fourth write site decision 4's "exactly
one place" didn't account for (the other three are `createBooking.ts`, `orders.ts`'s
`createOrderAdmin`/`updateOrder`, all going through `writeOrderContacts()`/
`syncOrderContactPerson()`). Every seeded demo-tenant order had an empty Contacts card despite
`CompanyPerson` being seeded correctly for the same companies — user-visible on the public sales
demo. Fixed 2026-09-23 ([[KnownBugs]] #59): the company/wine-company seed loops now keep each
seeded person's id, and both order-writing loops attach a nested `contacts: { create: [...] } }`
using that same person, so the snapshot can't drift from the columns it mirrors.

## Production cutover

**Not yet done.** See [[Plan-ContactRoles]] §9c for the five pre-flight checks required against
the production database before `staging` → `master`, and the Chunk 14 section for the close-out
checklist this note is part of. The pre-flight itself is currently blocked at the tooling level
(production-database reads refused regardless of tool) — needs Max to unblock it or run the five
queries himself.
