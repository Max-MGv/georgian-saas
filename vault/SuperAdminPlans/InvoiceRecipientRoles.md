---
tags: [plan, idea, superadmin, contacts]
---

# Idea — per-tenant invoice-recipient roles

**Not built. A possible future want, recorded 2026-09-23 during [[Plan-ContactRoles]] Chunk 11
so it isn't lost, not because it's scheduled.**

## The gap

Chunk 11 needed to decide who the "Send Invoice" email's recipient dropdown offers, now that
`CompanyRepresentative` (which had no role restriction at all) is gone. Max's answer: *"contact
person is the company representative, and they are the target for the email. but pass the role
and dont hardcode anything... keeping it flexible... in case another role becomes the
destination... or plural."*

Built as a single constant instead of a schema change:
[`INVOICE_RECIPIENT_ROLE_KEYS`](../../saas/lib/contactResolution.ts) in `lib/contactResolution.ts`,
currently `['contact_person']`. Every place that needs to know who can receive an invoice —
`orders/page.tsx`'s list query and `sendOrderInvoice()`'s server-side re-validation — calls the
one shared `invoiceRecipientsFor()` function built around it. Changing which role(s) qualify, or
adding a second, is a one-line edit to that array. No admin-facing control exists yet.

## What "flexible" would mean if this ever gets built

**Superadmin-level, not tenant-admin-level** — Max was explicit the flexibility he wanted was
for platform-side configuration (the kind `/super-admin` already does for other cross-tenant
knobs — see [[SuperAdmin-Architecture]]), not a per-tenant toggle a winery owner would see. A
tenant admin should not need to think about "which roles bill" as a concept at all; Contact
Person as the default is meant to be invisible plumbing for a normal winery.

A real version would probably look like:

- A `Setting` row (or a new column on `Tenant`, if `Setting`'s per-tenant JOIN-RLS shape turns
  out to be the wrong fit — see [[MaintenanceNotes]] #27 before assuming either way) holding a
  list of role keys, editable only from `/super-admin`, defaulting to `['contact_person']` so
  every existing tenant's behaviour is unchanged on migration day.
- `invoiceRecipientsFor()` would read that setting instead of the hardcoded constant. The
  function's shape (batched by company id, minimal fields, no `code`) shouldn't need to change —
  only where the role-key list comes from.
- Whether this should support the plural case Max mentioned ("contact person **+** x") — offering
  people from more than one role at once — falls out of the same design for free: the constant is
  already an array, and `invoiceRecipientsFor()` already does `key: { in: [...] }`.

## Why this wasn't built now

No tenant has asked for it, and building a superadmin setting nobody can reach yet (no UI screen
for it, no reason to test it) is speculative work Rule-of-thumb-wise this project avoids —
Chunk 0 of [[Plan-ContactRoles]] made the same call about a COMPANY_LEVEL "CEO" role: build the
`scope` column that makes it *possible*, not the feature itself, until someone actually needs it.
This note is that column's equivalent for invoice recipients — the one-constant seam is already
there; a settings row and a super-admin control are the only things missing if this is ever asked
for.
