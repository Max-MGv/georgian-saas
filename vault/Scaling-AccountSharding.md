---
tags: [operations, scaling, infrastructure]
---

# Scaling Strategy — Account Sharding

When a Supabase account approaches its free tier egress limit (~25–30 clients), open a new Supabase account + new Vercel account and route all new clients there. Existing clients stay untouched on the current deployment.

**Code changes required: zero.** Same GitHub repo, same branch. Only env vars differ.

---

## When to do this

- ~25–30 active tenants on a single Supabase account (egress becomes the constraint, not DB or storage)
- See [[Tech Stack]] for the full capacity simulation and free tier limits

---

## One-time setup checklist (new account)

1. Create new Supabase account → new project → copy the 5 env vars:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Run `npx prisma db push` against the new DB
3. Run `npx tsx scripts/setup-rls.ts` to deploy RLS policies
4. Create Max's super_admin user in new Supabase Auth:
   ```bash
   npm run set-admin -- --email max.mghvdliashvili@gmail.com --role super_admin
   ```
5. Create new Vercel account → connect same GitHub repo → paste new env vars
6. New deployment is live — ready for first new client

---

## Onboarding new clients (unchanged from today)

Same checklist as [[MigrationNotes]], but run against the new Supabase + Vercel:

1. Insert row in `Tenant` table on new Supabase
2. Run `set-admin` script for their admin user
3. Add their domain to the new Vercel project
4. Coordinate DNS with client
5. Seed initial settings/content if needed

---

## Tradeoffs vs. upgrading to Supabase Pro

| | Account sharding | Supabase Pro ($25/mo) |
|---|---|---|
| Cost | Free | $25/month (~70 GEL) |
| Code changes | None | None |
| Operational overhead | Two dashboards, two super-admins | Single dashboard |
| Data isolation | Hard split — no cross-shard super-admin | All tenants in one place |
| Scales to | ~30 clients per account, infinitely repeatable | ~500+ clients comfortably |

At 30 clients (1,500 GEL/month revenue) the $25/month Pro cost is trivial. Sharding makes more sense in early growth before revenue is stable.

---

## Limitations

- `/super-admin` panel on shard 1 cannot see tenants on shard 2 — you manage each shard separately
- No automated routing layer — you manually decide which shard a new client goes on
- If a client on shard 1 needs to move to shard 2 (or vice versa), that requires a data migration (rows + Storage files + Auth user)

---

## Related

- [[Tech Stack]] — capacity simulation, free tier limits, upgrade trigger
- [[MigrationNotes]] — client onboarding checklist, domain setup
- [[Decisions]] — decision log entry for this strategy
