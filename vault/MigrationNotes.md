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

## Scaling beyond one account

When you hit ~25–30 clients on a single Supabase account, open a new account and onboard new clients there (existing clients stay put). The onboarding checklist above applies identically — just run it against the new Supabase + Vercel. See [[Scaling-AccountSharding]] for the full setup steps and tradeoff comparison vs. Supabase Pro.

---

## Tenant IDs (current clients)

| Name | Slug | Domain | Tenant ID | Database |
|---|---|---|---|---|
| Nikalas Marani | nikalasmarani | nikalasmarani.vercel.app | `cmqou94er0000vl1sl9v0yv54` | **prod** |
| Staging Winery | staging-winery | georgian-saas-git-staging-mg-productions-projects.vercel.app | `cmrxb85wo0000vlc0d964nzf8` | **dev** |

> Nikalas Marani moved from `nikalasmarani.ge` to `nikalasmarani.vercel.app` on 2026-07-18 (Max doesn't control the .ge domain yet — swap back via the Step 1–2 procedure above once he gains it).
> Test Winery (`cmqou94sx0001vl1sga705ltt`, slug had drifted to `test-winery`) was **deleted from prod** 2026-07-23 (#79) along with its `testwinery@email.ge` auth user — test tenants now belong in the dev DB only. `testwinery.vercel.app` still attached in Vercel; shows the platform placeholder.
> Staging Winery lives in the **dev** Supabase project (`jpbkkngpgtvqmsocitjx`) — it will never appear in prod queries. See `Plan-DevProdEnvironments.md`.

---

## Old site source (pre-migration) — hosting panel access

Max was given access to the original host's control panel: `https://nikalasmarani.ge:2222/evo/` — a **DirectAdmin** panel (port 2222 + "evo" = the "Evolution" skin), hosting account `nalige`. That one account hosts three domains: `nikalasmarani.ge`, `nali.ge`, `dublin.ge`. This is a traditional shared-hosting panel, not a git remote — there's no repo here, just a File Manager over the live file tree.

**File Manager path:** `domains/nikalasmarani.ge/public_html` (explored read-only 2026-07-28, session 3 — no edits made, per Max's explicit instruction).

Structure found:
- `public_html/` root — legacy procedural PHP (`index.php`, `php.php`, `py.php`, `.htaccess`). This is the old public-facing site.
- `public_html/booking/` — a separate app with its own `laravelCore/` folder, plus `nikala_booking.sql` (~12KB dump) — the old booking DB schema/data.
- `public_html/adminIntegral/` — a **full standalone Laravel app** (`app/`, `bootstrap/`, `config/`, `database/`, `resources/`, `routes/`, `storage/`, `vendor/`, `artisan`, `composer.json/.lock`, `.env`). This is almost certainly the real admin + booking-management backend behind the old site, and the most likely place to find how the old payment/booking flow actually worked.
- `public_html/admin/` — not yet explored.

**Relevant to the new payment system:** `adminIntegral/.env` and `adminIntegral/routes|config` likely reference whatever payment gateway the old site used (Georgian bank redirect, per the legal-pages work in #128). Worth a read-only pass through `routes/`, `config/`, and `app/` there (skip `.env` itself — treat as live credentials, don't paste contents anywhere) before designing the new payment integration, so it's informed by what already worked in production rather than starting blind.

**Other tools in this panel** (not used yet): File Manager's Download/Archive can pull the whole tree as a zip; "Backup and Restore" under Advanced Features can generate a full site backup — either is the way to get a local copy of the old codebase for reference if needed.

### Update 2026-07-28: full local copy downloaded, old payment flow found

Max downloaded the whole account tree to `C:\Users\Max\Downloads\NikalasMarani Assets\nikalasmarani.ge\`. Inspected read-only (no code written yet — this is research for designing the new payment feature).

Turns out `nikalaIntegral` (hosting-account root, sibling to `public_html`) is a full separate Laravel app — same shape as `public_html/adminIntegral`, likely the same app mirrored/symlinked. This is the one with the real order + payment logic:

- **Gateway used live: [Flitt](https://flitt.com/) (formerly Fondy)**, hosted-checkout redirect style. `app/Flitt.php` builds a signed request (`sha1` of pipe-joined sorted params + merchant password) and posts to `https://pay.flitt.com/api/checkout/url`; `PayController::index` redirects the customer to the returned `checkout_url`, `PayController::response`/`callback` mark `Orders.pay_status = 1` on `order_status == 'approved'` and email both the customer and `nikalasmarani@gmail.com` (plain PHP `mail()`, hardcoded Georgian HTML templates).
- **`app/TBC.php`** (TBC Bank's own direct API, `api.tbcbank.ge/v1/tpay`) exists but is **dead code** — not referenced anywhere in `routes/web.php` or any controller. Don't treat it as the live integration.
- **Payment is currently disconnected from checkout.** In `OrderController::add`, the `redirect('pay/'.$app_id)` call is commented out — every order (wine order *and* tasting/dinner booking, both go through the same `Orders` model, differentiated by `type`: 1 = tasting, 2 = tasting+dinner, else = wine order) just saves with `pay_status = 0` and shows the success view. Flitt is never actually invoked in this snapshot. This matches what Max described as "missing" — the groundwork exists, the wiring doesn't.
- **Security note:** both `Flitt.php` and `TBC.php` have live merchant credentials **hardcoded in plaintext in the PHP source** (Flitt merchant_id `4056054` + password, TBC ApiKey + client_id/secret) instead of pulled from `.env`. Not something to carry over into the new SaaS — and worth asking Max to rotate these with the provider once the old app is fully retired, since the old codebase (now sitting in his Downloads folder too) will keep the secrets around indefinitely otherwise.
- Not yet checked: `public_html/booking/laravelCore` — a *third*, separate Laravel app under the `booking/` path with its own `nikala_booking.sql` dump. Unclear yet whether it's an older/parallel booking system or unrelated. Check before assuming `nikalaIntegral` is the only source of truth for booking data.

**Implication for the new SaaS payment feature:** Flitt/Fondy is the known-working gateway for this merchant (Georgian bank cards, GEL) — reusing it (with fresh credentials, proper env-var storage, and Flitt's own docs) is the lowest-risk path unless Max wants to switch providers. The signature scheme (sorted params, pipe-joined, sha1 with password prefix) is Flitt's standard checkout signing and will need re-implementing in the new stack.

### Update 2026-07-28: multi-tenant design assessment (Flitt)

Reviewed Flitt's public API docs (docs.flitt.com) against the current `saas/` schema and conventions (via Explore agent). Assessment only — nothing built yet.

**Per-tenant credentials required:** Flitt issues `merchant_id` + a secret payment key **per business** at registration (funds settle to that business's own bank account — there's no easy "one platform account, many sub-merchants" flow in the base API; that's a separate Fondy "Marketplace/Platform" product requiring its own KYC/AML business relationship). Given tenants already have their own `payment_recipient_name`/`payment_personal_number`/IBAN fields for bank transfer (`Setting` rows, see `saas/app/actions/settings.ts:8-22`), the consistent design is: **each tenant registers their own Flitt merchant account and enters their own `merchant_id` + secret key.** No aggregator model.

**Where this fits the existing schema:** `Setting(key, value, tenantId)` is the only existing per-tenant config mechanism — but every value in it today is plaintext, non-secret display text (bank transfer info, embed URLs). A Flitt secret key stored there would be **the first real per-tenant secret in this codebase** — no encryption precedent exists (all other 3rd-party creds — Resend, Supabase — are single platform-wide env vars). Worth at least masking the field in the admin UI even if storage stays plaintext like everything else in `Setting`.

**New architecture needed (none of this exists yet):**
- `app/api/` doesn't exist in this repo at all — everything today is Server Actions. A Flitt callback is necessarily the **first Route Handler**, since it's an inbound POST from Flitt's servers, not a page-initiated action.
- **Checkout creation** (customer/admin-initiated → redirect to Flitt) can safely use `getTenantId()`/`x-tenant-id` exactly like Server Actions do today — no new tenant-resolution mechanism needed there.
- **Inbound callback** cannot rely on `x-tenant-id` — Flitt calls the server directly and `proxy.ts` may not reliably resolve tenant context for that request. Fix: embed the tenant identifier in Flitt's `merchant_data` (or in `order_id`) at checkout-creation time, read it back from the callback body, look up that tenant's secret key (service-role query, pre-RLS), verify the signature, *then* enter `withTenantDb(tenantId, ...)` to update the `Order`.
- **Security fix vs. the old code**: the legacy `PayController` never verified the callback's `signature`/`response_signature_string` — it trusted `order_status` blindly. The new implementation must verify before trusting anything in the callback.
- `Order.totalPrice` + the existing `OrderStatus.PAID` enum value are ready-made hooks — no schema change needed there. `legalContent.ts` already has conditional "online payment via banking partner" language anticipating this (Feature #31 was legal-copy prep, not the integration itself).
- Natural to gate behind a new module flag (`modulesOnlinePayment` or similar), same pattern as `modulesLegalPages`/`modulesBooking` — "pay online" only appears for a tenant when the module is on *and* their merchant_id/secret are actually filled in.

**Not yet decided / needs Max's input before building:** where the "pay now" trigger lives (customer self-serve right after booking? admin-sent link via the invoice email? both?), and whether the checkout-language (`lang`) should just follow the tenant's site locale automatically rather than being a separate setting.

**Decision: per-tenant merchant accounts, not a shared/aggregator account.** Discussed both shapes with Max — a single platform-level Flitt account redistributing to tenants (Fondy's "Marketplace" product) vs. each tenant registering their own. Went with **per-tenant accounts**: the aggregator model still requires KYC per sub-merchant (doesn't actually remove onboarding friction) while *adding* payment-facilitator-style compliance exposure and a payout engine to build — disproportionate for ~2-3 clients. Per-tenant also matches the existing `payment_recipient_name`/IBAN precedent (money already conceptually goes straight to each winery).

### What a client needs beyond just the merchant_id (2026-07-28)

Researched Flitt/Fondy's public onboarding requirements. Their own FAQ confirms: **a fully operational website + "compulsory documentation"** is mandatory to register, approval takes "same day to up to a week," and it's an e-signature agreement to their T&Cs (no separate contract). Exact KYC document list isn't published — only shown inside their actual signup flow.

Client-side dependencies (before `merchant_id` + secret key even exist):
- A registered legal business entity in Georgia (individual entrepreneur or LLC) — needed for Flitt's business-identification step.
- A business bank account for settlement — same info already captured in the `payment_recipient_name`/`payment_personal_number`/IBAN `Setting` fields.
- KYC documents per Flitt's application flow (unpublished specifics).
- A live, complete-looking website at application time — Flitt's FAQ explicitly says reviewers check this.
- Terms / Privacy / Refund-Return pages — standard for payment-gateway approval (chargeback risk signal). **Already satisfied for Nikalas Marani** by the #128 Legal Pages feature, done before this conversation even started.
- **Unconfirmed and worth asking Flitt support directly: whether alcohol/wine sales are an accepted category.** Couldn't find Flitt's restricted-category list publicly — some payment processors flag or restrict alcohol. Don't assume approval; verify before the client relies on this.

Not the client's problem — platform/technical side, already satisfied or handled once in code:
- HTTPS (Vercel provides automatically).
- Checkout/callback/signature code — built once, reused per tenant.
- Flitt's callback IP allowlist (`54.154.216.60`, `3.75.125.89`) — only relevant if a tenant sits behind a WAF/firewall; Vercel has no inbound blocking by default, so a non-issue unless a client later adds something like Cloudflare in front of their domain.

Sources: [Fondy FAQ](https://fondy.eu/en-pl/faq/), [Flitt API docs](https://docs.flitt.com/).

### Old code dependency map — what's fragile in `nikalaIntegral`'s Flitt integration (2026-07-28)

Checked whether a schema/SQL source of truth exists for `nikalaIntegral`'s `orders`/`transactions` tables — **it doesn't**. `nikalaIntegral/database/migrations` only has the default Laravel `users`/`password_resets` migrations. The one SQL dump on the whole account (`public_html/booking/nikala_booking.sql`) belongs to the *other*, separate `booking/laravelCore` app — its `orders` table has a completely different column set (`adults_dinner`, `wines_info`, `masterclass`, no `pay_status`, no `type`, no Flitt fields at all). **Important open question for the migration: there appear to be two independent, unrelated order/booking systems on the old site, and only `nikalaIntegral`'s has any Flitt wiring — need to confirm which one the live site actually uses before assuming `nikalaIntegral` is the full picture.**

Exact params sent to Flitt at checkout creation (`PayController::index` → `Flitt::create`): `merchant_id` (hardcoded `4056054`, duplicated uselessly a second time inside `Flitt.php`), `order_id` (`Orders.id`), `currency` (hardcoded `'GEL'`), `order_desc` (hardcoded static string `'nikalasmarani.ge'`, not order-specific), `amount` (`Orders.total_price * 100`), `response_url`/`server_callback_url` (built by concatenating a **hardcoded** `$website = 'https://www.nikalasmarani.ge/'` — not derived from the actual request host), `signature` (sha1 of secret + sorted non-empty params).

Fragility points to deliberately fix rather than replicate in the new integration:
- Signature is computed over `array_filter($params, 'strlen')` — empty params are silently dropped from the hash. A field that's normally populated becoming empty would silently change what gets signed.
- `PayController::response()` (browser redirect) and `::callback()` (server webhook) **independently duplicate** the entire "mark paid + send 2 emails" logic — already drifted slightly (one uses a `trans()` key, the other hardcodes raw text). Should be one shared function in the rebuild.
- Both handlers do `Transactions::where('payment_id', ...)->firstOrFail()` — a `Transactions` row must already exist from the initial checkout call, or a legitimate callback 500s instead of failing gracefully.
- `/pay`, `/fail`, `/response`, `/callback` routes sit **outside** the localized route group in `routes/web.php` — deliberate or accidental, but the hardcoded `$website` string has to stay in sync with wherever these routes actually live.
- **No callback signature verification exists** (repeated from above — this is the concrete mechanism by which that gap could be exploited: anyone who obtains/guesses a `payment_id` can POST a forged `order_status=approved` callback).
- DB fields referenced directly and unsafely (Eloquent silently returns `null` for a missing column rather than erroring) — `Orders`: `id, total_price, pay_status, type, name, surname, phone, guests_qty, date, time, restaurant_name, company_name, company_id, address, email, ordern`. `Transactions`: `payment_id, orders_id, checkout_url, data, status, amount`.

**Design implication for the new SaaS integration**: build `order_desc` from the actual order contents, derive `response_url`/`server_callback_url` from the tenant's real domain at request time (never hardcode), put the "mark paid + notify" logic in one shared function called from both the redirect and webhook paths, and verify the callback signature before trusting anything in it.

### Update 2026-07-28: real production data found via phpMyAdmin — corrects the "TBC is dead code" claim

Checked the account's actual databases (DirectAdmin → Databases → phpMyAdmin, read-only — `SELECT`/aggregate queries only, nothing modified). Three DBs exist: `nalige_booking` (224 KB — the `booking/laravelCore` app), `nalige_db` (3.02 MB — `nikalaIntegral`, `APP_ENV=production` confirmed in its `.env`), and an unexpected `nalige_wpblog` (35.88 MB, WordPress — **not yet investigated, separate system**).

**Correction:** earlier I called `TBC.php` dead/unused code because no route calls it. Wrong conclusion from code alone — `nalige_db` has a `transactions_tbc_old` table with **201 rows** (ids 2–202), clearly a real payment history from before the switch to Flitt (`transactions` has 30 rows). TBC *was* live at some point; the code just doesn't show that era anymore because the routes were swapped over to Flitt and the TBC route wiring was removed, not because TBC never worked.

**`nalige_booking` (the `booking/laravelCore` app) — confirmed NOT worth migrating.** Its `orders` table has exactly 4 rows, all the same person ("ტიგრან ვოსკანიანი", same phone, same visit date, all created within 14 minutes on 2026-03-22), plus a `sessions` row referencing `localhost/keyagency/...` — a generic Laravel starter template name. This is a developer testing the form, not customer history. The `companies` (2 rows) and `prices` (7 rows, real update history back to 2024) tables in this DB are more likely genuine config, not "historical data" — could be reused as seed data for the new `Company`/`Price` models if relevant, separately from any order-history migration decision.

**`nalige_db`'s `orders` table — real, worth migrating.** 52 rows, `created_at` spanning **2022-06-12 to 2026-06-28** (4 years), 38 distinct phone numbers, no NULL `total_price`. All rows are `type=1` (avg price 200 GEL) or `type=2` (avg 473 GEL) — matches `PayController`'s "tasting" / "tasting+dinner" labels, i.e. maps cleanly onto the new schema's `VisitType.TASTING`/`TASTING_LUNCH`. **Zero rows of the wine-order type** — the old site's wine e-commerce/cart flow appears to have had no real customer usage at all; there's nothing to migrate for "wine orders" specifically. 19/52 marked `pay_status=1` (paid online via Flitt/TBC); the other 33 aren't necessarily unpaid — `pay_status` only tracks *online* payment, plenty of bookings likely settled by bank transfer or in person.

**Column mapping, old `orders` (nalige_db) → new `Order` model** (`saas/prisma/schema.prisma:55`):

| Old column | New field | Fit |
|---|---|---|
| `name`, `surname`, `phone`, `email` | same | direct |
| `date` (varchar) | `date` (DateTime) | needs parsing |
| `time` | `timeSlot` | direct |
| `total_price` | `totalPrice` | direct |
| `created_at` | `createdAt` | direct |
| `type` (1/2) | `visitType` (TASTING/TASTING_LUNCH) | clean 1:1 |
| `comment` | `notes`/`foodNotes` | reasonable fit |
| `company_name` (raw text) | `Company` row + `companyId` | **needs transform** — old data has no normalized companies table here, just free text; must dedupe into real `Company` rows first |
| `guests_qty` (single number) | `guestCount` + the v1.2 split (`lunchGuestCount`/`tastingGuestCount`/`freeGuestCount`) | **needs a judgment call** — old data only has one combined number, new schema wants it split; no clean automatic derivation |
| `pay_status` (0/1) + `status` (1–6, but **every one of the 52 real rows is `status=1`** — the richer 6-state lifecycle in the column comment was apparently never actually used) | `OrderStatus` enum (NEW/CONFIRMED/INVOICE_SENT/PAID/COMPLETED/CANCELLED) | **needs a judgment call from Max** — `pay_status` alone can't distinguish "cancelled" from "paid in person" from "still owed"; likely rule: past-dated rows → `COMPLETED` (or `PAID` where a matching approved transaction exists), no clean signal for `CANCELLED` |
| `restaurant_name`, `working_hours`, `address`, `ordern`, `users_id`, `order` (app id), `updated_at` | *(no equivalent field)* | fold into `notes`, or drop — new `Order` has no `updatedAt` at all |

**No landing spot yet for the 30+201 payment transaction records.** The current schema has no `Transaction`/`Payment` model — only `Order.status` including `PAID`. To preserve granular payment history (which attempts succeeded/failed, amounts, dates — not just a final paid/unpaid flag), a new model would need to be added. Worth noting this isn't throwaway migration-only work: **the new Flitt integration will need a transactions table of its own anyway** (to store `payment_id`/`checkout_url`/callback data going forward) — so this can be the same table, built once, serving both the historical import and all future live payments.

**Bottom line:** migrating `nikalaIntegral`'s 52 real bookings is doable and worthwhile (4 years of real customer history, clean `visitType` mapping) but is a real data-transformation job, not a straight SQL import — it needs company deduplication, a guest-count-splitting rule, and an explicit policy from Max for mapping old status fields onto the new `OrderStatus` enum. `nalige_booking`'s 4 rows aren't worth migrating at all. `nalige_wpblog` is unexplored — open item.

---

## Unknown domains = no tenant (since 2026-07-18, #123)

A domain with no `Tenant.domain` match resolves to **no tenant** — public routes redirect to the `/welcome` platform pitch page; `/super-admin` and `/admin/login` still work there (the bare `georgian-saas.vercel.app` doubles as platform HQ). There is no longer a global `DEFAULT_TENANT_ID` fallback for unknown domains — that env var now only affects localhost dev. Consequence for migrations: if you update `Tenant.domain` but forget to add the new domain in Vercel (or typo it), visitors see the placeholder page, not a half-broken tenant site.
