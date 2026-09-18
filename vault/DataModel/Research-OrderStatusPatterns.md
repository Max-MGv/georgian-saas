---
tags: [research, schema, orders, status]
---

# Research: how e-commerce platforms model order status

**Date:** 2026-09-18. Gathered to settle an open question — should order statuses be
dimension tables (rows a tenant can add to) or fixed enums? The question had been asked,
argued and left undecided twice; see `vault/Plan-StatusModel.md`.

---

## The finding, in one line

**Nobody makes the state machine dynamic.** Across every major platform checked, the set
of status values that *code branches on* is fixed. Customisation, where it exists, is
confined to labels.

---

## What each platform does

| Platform | Lifecycle vocabulary | Axes | History |
|---|---|---|---|
| **Shopify** | Fixed enums, not customisable | `financial_status` + `fulfillment_status` | Events |
| **Medusa** | Fixed TS enums | `status` + `payment_status` + `fulfillment_status` | — |
| **Saleor** | Fixed Django choices | `OrderStatus` + `FulfillmentStatus` + charge/authorize status | **`OrderEvent` table** |
| **WooCommerce** | Fixed core set, extended in *code* | one axis + separate payment data | Order notes |
| **Magento** | **Fixed `state` in code + customisable `status` in a DB table** | state/status + separate invoice entities | `sales_order_status_history` |

---

## Three patterns that hold everywhere

**1. The state machine is fixed.** Shopify's `financial_status` and `fulfillment_status`
are fixed enum values with no merchant customisation at all. This is the direct answer to
the question that opened the research: order statuses are **not** dimension tables in
standard e-commerce.

**2. Multiple independent axes is universal.** Medusa has three status fields, Saleor
four, Shopify two. Nobody crams fulfilment and payment into one column.

> This means the instinct behind `Plan-StatusModel.md` chunks 1–4 was **correct** — it was
> the implementation (reference tables rather than plain fields) that was the detour. The
> current `stage` enum + milestone dates is this same pattern, with money expressed as
> timestamps instead of a second enum.

**3. An event/history table is standard, not exotic.** Saleor has a model literally called
`OrderEvent`. Magento has `sales_order_status_history`. **This is the piece the project
does not have**, and it is why [[Plan-DataModel]] Chunk 5 exists.

---

## Magento is the precedent for display tables

Magento is the only platform here with a status lookup table, and the way it splits the
two concepts is exactly the shape Max asked for:

- **`sales_order_status`** — a real DB table of statuses with labels. Merchants **can**
  insert rows.
- **`sales_order_status_state`** — maps each status to one of ~10 **states**, which are
  fixed constants in code.

Magento's own framing: **state is for the system to process the order in a defined
workflow; status is for the store owner to understand it.** Code branches on state.
Merchants customise status.

That is [[Plan-DataModel]] Chunk 7, arrived at independently by a platform with two
decades of multi-merchant experience — and for the same reason found in this codebase:
`lib/statusWrite.ts:72-96` is a `switch` mapping each stage to the milestone column it
stamps, so a tenant-invented status has no column to write to and would be a second-class
citizen next to the shipped ones.

---

## How the options scored

| Option | Precedent |
|---|---|
| **A** — four tables, financial ladder returns | **None.** Nobody ladders payment states in a way that overwrites history. |
| **B** — status dimension tables that code branches on | **None.** Magento has the table; code never branches on it. |
| **C** — fixed enums, money as dates | **Shopify, Medusa, Saleor.** Mainstream. ✅ **Chosen.** |
| **D** — fixed enum + display/label table | **Magento.** Also mainstream; the upgrade path. → Chunk 7. |

**Max's decision, 2026-09-18:** C, with display tables later as a presentation layer only.

---

## Why B was rejected on evidence, not opinion

A grep for `BookingStage` / `WineOrderStage` found **14 files**, of which 10 are real
application code (the rest are seeds and tests). Under a dimension table, `stage` becomes
a `String` in all ten, and every `switch` in `lib/statusWrite.ts` silently falls through
on an unrecognised value instead of failing at build time.

Option D touches roughly **one** of those files — the display layer — while the other nine
keep their exhaustiveness checks intact.

---

## Sources

- [Magento 2 order status vs order state — MageComp](https://magecomp.com/blog/difference-magento-order-status-order-state-magento-2/)
- [Managing Magento 2 Order Status — Mageplaza](https://www.mageplaza.com/kb/magento-2-order-status-order-state.html)
- [Create custom order status programmatically — Atwix](https://www.atwix.com/magento-2/create-order-status-programmatically/)
- [Shopify OrderDisplayFinancialStatus — GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus)
- [Shopify OrderDisplayFulfillmentStatus — GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFulfillmentStatus)
- [Saleor Events — Saleor Commerce Documentation](https://docs.saleor.io/docs/3.x/developer/extending/api/events)
- [Medusa PaymentStatus enum — Medusa Docs](https://docs.medusajs.com/v1/references/entities/enums/entities.PaymentStatus)
- [Medusa Order entity — Medusa Docs](https://docs.medusajs.com/v1/references/entities/classes/Order)
