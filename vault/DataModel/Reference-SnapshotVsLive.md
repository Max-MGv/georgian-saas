---
tags: [reference, schema, data-model, snapshots]
---

# Reference — what's a snapshot and what's live

**What this file answers:** for any given field on an order, is it a *live pointer* (reads
whatever the linked row says today) or a *snapshot* (a copy, frozen the moment it was written)?
Written 2026-09-23 after Max asked for a general overview of how the database works and
specifically how snapshots behave — see [[SessionLog]] that date for the conversation this
distilled from.

**Not a design doc for a single feature** — this is a cross-cutting reference. Update the table
below whenever a new field is added that could plausibly be either, so this stays the one place
to check rather than something re-derived by grepping the schema again.

---

## The distinction, in one paragraph

A **live pointer** is a foreign key. The order stores an id, and every read follows it to
whatever that row currently says — rename a company and every past order shows the new name
immediately, because nothing was ever copied. A **snapshot** is a copy, taken once, that never
changes again on its own. The two are not in tension: several tables in this schema deliberately
carry *both* — a nullable pointer for "who/what this refers to today" plus permanent snapshot
columns for "what was true when this row was written." `OrderContact` and `WineOrderItem` are
the clean examples of that pattern; see the table below for where it's one-sided instead.

**Editing a snapshot only touches the one row it lives on.** It never rewrites the live record it
was copied from, and it never rewrites any other order's copy of the same fact. That's not a
limitation — it's the entire reason a snapshot exists: so that correcting today's price list, or
today's phone number for a contact, doesn't quietly rewrite history on old orders. The one
exception is where the app deliberately keeps two snapshots of the *same* fact in step on purpose
— see the `Order`/`OrderContact` row below.

---

## Table by table

| Table.field | Kind | Notes |
|---|---|---|
| `Order.companyId` | **Live only** | Pure pointer, no name snapshot alongside it. Renaming a company relabels every past order that points at it. Probably fine — company renames are rare and usually *should* apply retroactively — but worth knowing if that assumption ever changes. |
| `OrderMasterclass.masterclassItemId` + `.pricePerUnit` | **Both, but incompletely** | `pricePerUnit` is a real snapshot (comment says so explicitly). The item's *name* is read live from `MasterclassItem` every time (`sendOrderInvoice`, `InvoicePrint` both do `l.masterclassItem.name`) — same shape as the `Order.companyId` gap, one level down. Renaming a masterclass item relabels old invoices. |
| `Order.tastingRateSnapshot` / `.lunchRateSnapshot` / `.registrationFeeSnapshot` | **Snapshot only** | The rate actually charged is frozen. There's no stored pointer back to *which* `Price` tier row produced it — you know the fact, not its provenance. Deliberate (chunk 4, 2026-09-18): built specifically to stop `recalcOrderTotal` re-pricing old bookings at today's rates. See `MaintenanceNotes` §22. |
| `Order.name/surname/phone/email` | **Snapshot only, for now — see caveat** | The *only* record for an INDIVIDUAL booking (no `OrderContact` row ever exists for one). For a COMPANY booking these columns are kept in sync with the linked `OrderContact` `contact_person` row (`syncOrderContactPerson()`, called from `updateOrder()`) — two snapshots of the same fact, deliberately kept in step by code, not by the database. See `MaintenanceNotes` #30 and [[Plan-ContactRoles]] decision 4. |
| `OrderContact.personId` + `.nameSnapshot`/`.phoneSnapshot`/`.emailSnapshot` | **Both — the clean example** | Nullable pointer (`SetNull` on delete) plus permanent snapshot columns. Deleting the person loses the link, never the facts (this is literally what `KnownBugs` #56 was, on the old `Order.guideId` design, before this pattern existed). |
| `WineOrderItem.wineVintageId` + `.wineNameSnapshot`/`.vintageYearSnapshot`/`.priceSnapshot` | **Both — the other clean example** | Same shape as `OrderContact`. |
| `Payment.amount` | **Snapshot, append-only** | Each payment is its own permanent row — editing `Order.totalPrice` later never rewrites what was actually received. This is the pattern `InvoiceSent` (below) copies for money actually *billed*, since invoices didn't have an equivalent until 2026-09-23. |
| `InvoiceSent` (new 2026-09-23) | **Snapshot, append-only** | See the dedicated section below — this table didn't exist until this reference was written. |

---

## Invoices — the gap this reference was written to close

Before 2026-09-23, `sendOrderInvoice()` built the invoice email **live, at send time**, from
whatever the order's *current* data said — current price, current guest counts, current
masterclass lines. Nothing about an invoice's actual content was ever saved. The only permanent
trace was `Order.invoiceSentAt`, a bare timestamp with no content.

Concretely, that meant: send an invoice for ₾500, later correct the guest count so the order
recalculates to ₾450, then reprint or resend — it now shows ₾450, with nothing anywhere recording
that ₾500 is what actually went out the first time.

**Fixed by adding `InvoiceSent`**, an append-only table — one row per send, never updated —
recording the recipient, the amount, the guest/visit breakdown, the masterclass/extra line items,
the custom message and the locale, all as they were **at the moment that specific invoice was
sent**. A resend after a correction is its own new row, not an overwrite — the same shape
`Payment` already used for money actually *received*; this is the equivalent for money actually
*billed*. Displayed on the order detail page as an "Invoice History" card, directly under
Contacts.

**Deliberately not snapshotted:** the tenant's banking details (IBAN, bank name, recipient name)
that appear on the invoice itself. Those are the winery's own identity, essentially never change
per-order, and snapshotting them would add a row of low-value duplication for every send. If that
assumption ever stops holding, revisit it here.

Full write path: `sendOrderInvoice()` in `saas/app/actions/orders.ts`. Schema comment on
`InvoiceSent` in `saas/prisma/schema.prisma`. Coupling note: `MaintenanceNotes` #31.
