---
tags: [operations, clients, migration]
---

# Client Migration Notes

Operational reference for migrating clients — changing domains, moving to subdomains, or onboarding new tenants.

---

## How the routing works

The entire routing system pivots on a single DB field: `Tenant.domain`. The middleware (`saas/proxy.ts`) reads the incoming hostname, looks up that field, and resolves the `tenantId`. All tenant data is keyed by `tenantId` (a CUID) — **not** by domain. The domain is only a routing lookup key.

This means: **domain migrations require no data migration**. You just update the lookup key.

---

## Changing a client's domain (e.g. Nikalas Marani)

### Step 1 — Update the DB

```sql
UPDATE "Tenant" SET domain = 'nikalasmrani.ge' WHERE slug = 'nikalasmrani';
-- or for a subdomain on your platform:
UPDATE "Tenant" SET domain = 'nikalasmrani.yourplatform.ge' WHERE slug = 'nikalasmrani';
```

That's the only code/data change required.

### Step 2 — Add domain to Vercel (if hosted on Vercel)

In the Vercel project settings, add the new domain. Vercel provisions TLS automatically. **Do this before going live** — visiting a domain not added to Vercel results in cert errors.

### Step 3 — DNS

- **Subdomain of your platform**: add a CNAME/A record at your registrar pointing to Vercel/your server. You control this.
- **Client's own domain**: the client points their DNS to you (you give them the IP or CNAME target), then you add it to Vercel.

### Step 4 — Admin auth (nothing to do)

The admin user (`nikalasmarani@email.ge`) has `tenantId: cmqou94er0000vl1sl9v0yv54` in their Supabase `app_metadata`. This is keyed to the tenant ID, not the domain. It keeps working automatically after a domain change.

### Step 5 — Search for hardcoded references

```bash
grep -r "old-domain.ge" saas/
```

Catch any hardcoded URLs in emails, redirects, or config before cutover.

---

## Key things to be wary of

### In-memory cache
`saas/proxy.ts` caches `domain → tenantId` in a module-level `Map` for the lifetime of the server process. After updating the DB, the **old domain keeps resolving until the server restarts**. On a production deploy this is a non-issue (deploy triggers restart). Mid-session it causes a brief window of confusion during testing.

### Old domain goes dead immediately
Once the DB row is updated, any user still on the old URL gets an unknown-tenant response. Communicate the cutover window to the client in advance.

### DNS propagation
Client-owned domains can take up to 48 hours to propagate. Plan for a transition window where both old and new domains need to work (if needed, keep a second `Tenant` row temporarily, or coordinate a hard cutover at a low-traffic time).

### TLS / HTTPS
On Vercel: add the domain in the dashboard first or you'll get cert errors. On a self-hosted server: run certbot/Let's Encrypt for the new domain before pointing DNS.

---

## Subdomain vs. own domain comparison

| | Subdomain (`client.yourplatform.ge`) | Own domain (`client.ge`) |
|---|---|---|
| DNS control | You manage it | Client manages it (points to you) |
| TLS cert | Wildcard cert covers it | Per-domain cert via Vercel or certbot |
| Steps for you | Add DNS record + update DB | Update DB only; client does DNS + you add to Vercel |
| Propagation risk | None | Up to 48h DNS TTL |

---

## Onboarding a brand new client (full checklist)

1. Insert a row into `Tenant`:
   ```sql
   INSERT INTO "Tenant" (id, name, domain, slug, "createdAt")
   VALUES (cuid(), 'Client Name', 'client.ge', 'client-slug', now());
   ```
   Or use a seed script if one exists.

2. Create a Supabase user for their admin account.

3. Lock the user to that tenant:
   ```bash
   npm run set-admin -- --email client@domain.ge --tenantId <new_tenant_id>
   ```

4. Add the domain to Vercel.

5. Coordinate DNS with the client.

6. Seed initial content/settings for the new tenant if needed (copy from an existing tenant or from defaults).

---

## Tenant IDs (current clients)

| Name | Slug | Domain | Tenant ID |
|---|---|---|---|
| Nikalas Marani | nikalasmrani | nikalasmarani.ge | `cmqou94er0000vl1sl9v0yv54` |
| Test Winery | winery2 | winery2.local | `cmqou94sx0001vl1sga705ltt` |
