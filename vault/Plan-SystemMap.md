---
tags: [plan, meta, documentation]
---

# Plan: Generated System Map

**Status:** 📋 Proposed, not started
**Date:** 2026-09-16
**Trigger:** Max raised concern about overall site health — too much functionality has accumulated to hold a mental model of it. Specific worry: "we can't write tests for things we forget exist — how can we handle all different payment states if we don't know what they are?"

---

## The problem

Documentation drift, not documentation absence. The vault has ~60 files, but they're hand-written and nothing forces them to stay in sync with the code.

Evidence found 2026-09-16:
- `Architecture.md` lists `/admin/orders/[id]` as "(planned v1.2)" — it already exists and is live.
- `Architecture.md` lists 9 files in `app/actions/` — there are actually 24.
- `Architecture.md` has no mention of `/admin/onboarding`, `/admin/(panel)/content`, `/admin/(panel)/my-reports`, or the `(panel)` route group at all.

More hand-written docs make this worse, not better. The fix is to generate the map from the code so it can't go stale — regenerating becomes one command, and drift shows up as a diff.

---

## Where the ground truth already lives (just never harvested)

| Question | Source of truth |
|---|---|
| What can an admin manage? | `app/admin/**/page.tsx` (15 screens) + `app/actions/*.ts` exports |
| What settings exist? | `SETTING_DEFAULTS` in `saas\lib\settings.ts` — 25 keys, one object |
| What are all the payment/order states? | `enum OrderStatus` in `prisma\schema.prisma` — 7 values |
| What can be switched off per tenant? | `x-tenant-modules-*` headers, `saas\lib\requireModule.ts` |
| What data exists and how is it related? | 516 lines of `schema.prisma` |
| Who's allowed to do what? | `requireAdmin` / `requireSuperAdmin` / `requireModule` calls inside each action |

---

## Proposed layers

### 1. Generated map script -- Max this is i think outdated - the 'dashboard' i think is also out of date
`saas\scripts\generate-map.ts` → writes to `vault\generated\*.md`.

Walks the route tree, parses `app/actions/*.ts` exports, reads `SETTING_DEFAULTS`, extracts Prisma enums/models. Output is an *inventory*, not prose.

Point the existing React Flow dashboard (`dashboard/`) at the generated file instead of hand-written `Architecture.md` — the viewer already exists, it's just fed stale input today.

### 2. `AdminCapabilities` table
One row per admin screen: screen → what it manages → which actions it calls → which settings it reads → which module gates it → which test covers it.

This is the direct answer to "what can admin manage from their website" — derived, not remembered.

### 3. Stable IDs + coverage ledger (the fix for the testing worry)
Give every generated item a stable ID:
- `action:orders.updateStatus`
- `setting:booking_lead_hours`
- `state:OrderStatus.PENDING_PAYMENT`

Keep one `coverage.yaml` mapping each ID → `tested-by: <spec file>` / `manual` / `untested`.

`npm run map:check` fails when an ID exists in code but has no entry in the ledger — so a new order status or setting can't silently go untracked. This is the actual mechanism for "we can't write tests for things we forget exist": forgetting becomes impossible because CI goes red until someone classifies the new item.

Existing spec suite (`saas\tests\tier1-regression` … `tier4-locale`, 16 files) is a good spine; this tells us what it doesn't cover.

### 4. Declare `OrderStatus` as an explicit state machine
Legal transitions currently live implicitly, scattered across `orders.ts`, `settle.ts`, `startCheckout.ts`. Declare once as data: `from → to, who can trigger, side effects (email? invoice?)`.

Then:
- admin UI renders allowed actions from this table instead of ad hoc checks
- docs generate from it
- a test can loop over every transition

Payment states stop being folklore held in several files' heads at once.

---

## Also recommended, separate from the generator

Archive the ~30 completed `Plan-*.md` files into `vault\archive\`. They're history; their presence in the live folder is part of why the vault feels unmanageable. (Not done as part of this plan — needs its own pass to confirm which are actually done.)

---

## Sizing / sequencing

1. **Layers 1–2 (generated map + capabilities table)** — ~half a session. Highest payoff, lowest risk: pure read-code-and-write-markdown, no runtime changes. Do this first and look at the output before committing to the rest.
2. **Layer 3 (coverage ledger + `map:check`)** — ~one session.
3. **Layer 4 (OrderStatus state machine)** — ~one session, touches real code (`orders.ts`, `settle.ts`, `startCheckout.ts`), needs staging verification per standard git workflow (Rule 0 in `ClaudeInstructions.md`).

---

## Next step

Not started. Waiting on Max to confirm scope before building layer 1.
