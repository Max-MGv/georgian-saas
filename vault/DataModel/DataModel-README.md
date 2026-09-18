---
tags: [index, schema, data-model]
---

# Data model work — start here

Everything about the transactional schema — orders, wine orders, line items, payments,
money types and timestamps. **If you are a new session picking this work up, read in
this order.**

---

## The files

| # | File | What it's for |
|---|---|---|
| 0 | **[[Plan-DataModel]]** | 🚧 **The live task tracker.** Chunks 0–7, strictly sequential, with a resume point on each. **Check this before starting any data-model work.** |
| 1 | **[[Dependencies]]** | 🔴 **Read before touching money columns.** The blast radius: which files break, which break loudly, which break silently. Written before any code changed. |
| 2 | [[Definitions]] | ⬜ **Not written yet — produced by Chunk 2.** The vocabulary that stops the errors we found on 2026-09-18 recurring: what a row in `Order` actually means, what "revenue" counts, and the grain rules. |
| 3 | [[Research-OrderStatusPatterns]] | How Shopify / Magento / Saleor / Medusa / WooCommerce model order status. The grounding for keeping enums instead of status tables. |

**Related, outside this folder:**
- `vault/Plan-StatusModel.md` — the status redesign that led here. Chunks 1–5. Its chunk 5 (enums + milestone dates) is the shape this work builds on.
- `vault/RLS-Architecture.md` — the checklist any new table must satisfy.
- `vault/MaintenanceNotes.md` — coupled components, read before non-trivial changes.

---

## State of play, 2026-09-18

**The status question is closed.** After a session of interrogating the structure and
checking it against industry practice, Max settled on **C — fixed Postgres enums for
stage, money as milestone dates.** That is what is already built in `Plan-StatusModel.md`
chunk 5. Display/label tables ("so it's comfy for us") are wanted **later**, as a
presentation layer only — never something code branches on. See [[Research-OrderStatusPatterns]]
for why that split is the industry norm.

**Nothing from this plan has been built yet.** The two chunk-5 commits still sit
unpushed on local `staging`:

```
staging...origin/staging [ahead 2]
  3b6c77e  Mark the chunk 5 shape as contested, not decided
  2db5277  Replace the two status axes with stage enums and milestone dates
```

`master` (production) is **37 commits behind** and still runs the old single-`status`
design.

**The window that makes this work cheap:** Max has confirmed a complete wipe of
transactional data — orders, wine orders, line items, payments and companies — is
acceptable on **both dev and production**, because all of it is fake. That removes
every backfill problem from the money-type change. It closes the moment real customer
data lands.

---

## The one-line summary of what this work is

The status vocabulary is now right. What is still wrong sits underneath it: **money is
stored as `Float`**, four tables have **no timestamps at all**, `recalcOrderTotal`
**silently reprices old bookings** at today's rates, and there is **no history table**,
so nothing records who changed what or when.
