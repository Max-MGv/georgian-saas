---
tags: [seeding, wine-orders]
---

# Seed: Wine Orders

Populates the Wine Orders admin tab with realistic test data from Georgian businesses.

## How to run

```bash
npm run seed
```

Run from `saas/` directory. Requires `.env` with `DATABASE_URL` (already set up).

## What it creates

5 wine order records:

| Business | Status |
|---|---|
| Rustavi Wine & Dine | pending |
| Batumi Seaside Restaurant | confirmed |
| Tbilisi Old Town Hotel | pending |
| Kutaisi Grand Café | pending |
| Signagi Wine House | confirmed |

Each order gets 1–3 randomly picked wines with random quantities (2–11 units), pulled from the **live active wine catalogue** in the DB — so names and IDs always match what's in the admin panel.

## Important: run order

The script fetches active wines first. If there are no active wines, it skips and warns. Always make sure wines exist in `/admin/wines` before seeding.

## File

`saas/scripts/seed.ts`

## Structure

The seed file is split into named sections at the bottom of the file:

```
seedWineOrders()        ← active
seedTestCompanies()     ← placeholder (uncomment when needed)
seedTestOrders()        ← placeholder (uncomment when needed)
```

To add a new section: write an `async function seedXxx()` and add it to `main()`.

## Re-running

The script always **adds** records — it does not clear existing ones first. To start fresh, delete existing wine orders from the admin panel (or directly in Prisma Studio: `npx prisma studio`) before re-running.

## Verified

✅ Tested 2026-05-28 — 5 orders created, wines matched real catalogue (Saperavi 2022, Rkatsiteli 2023, Rkatsiteli Amber 2022, Mtsvane 2023, Rosé 2023, Kisi).
