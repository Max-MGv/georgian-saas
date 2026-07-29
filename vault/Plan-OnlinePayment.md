---
tags: [plan, payment, flitt, multi-tenant]
status: proposed — not started
created: 2026-07-29
---

# Plan — Online Payment (Flitt)

Turning the existing "place a reservation" flow into an optional "pay now" flow, per-tenant, using Flitt (formerly Fondy).

Prior research this builds on: [[MigrationNotes]] → "Old site source (pre-migration)" sections (2026-07-28). That covers the old Laravel integration, the per-tenant-vs-aggregator decision, and Flitt's onboarding requirements. **This document is the build plan; that one is the research.** Not repeated here.

---

## 1. Decisions locked in

| Question | Decision | Decided |
|---|---|---|
| Aggregator vs. per-tenant merchant accounts | **Per-tenant** — each winery registers its own Flitt account, money settles to their own bank | 2026-07-28 |
| Where the pay trigger lives | **The existing submit buttons become purchase buttons** — booking "Confirm" and wine "Place Reservation". No separate "pay now" screen, no admin-sent payment link (for v1) | 2026-07-29 |
| Optional per tenant | **Yes** — tenants without online payment keep today's behaviour exactly: reservation is placed, winery contacts the customer to settle payment themselves | 2026-07-29 |
| Gateway | **Flitt**, reusing Nikala's Marani's existing live merchant account (`4056054`) | 2026-07-28 |

**The toggle is the core constraint.** Every change below has to be a no-op for a tenant with payment off. That tenant's booking form, emails, admin panel, and DB rows must look exactly as they do today.

---

## 2. What we already have vs. what's missing

**Have (from the old site, verified 2026-07-29):** endpoint `https://pay.flitt.com/api/checkout/url`, merchant_id, merchant password, the signature algorithm, the exact request params, the response shape. Nothing further needs to be issued by Flitt for Nikala's Marani, because it's the same merchant and the `.ge` domain (which the account is registered against) is being migrated to the new site.

**Merchant account confirmed live — 2026-07-29.** Phase 0 run: a checkout-creation POST with the existing credentials returned `HTTP 200`, `response_status: success`, `payment_id 1002579836` and a real `checkout_url`. Nothing charged (creating a checkout only mints a link). This confirms account `4056054` is active, the merchant password is still valid, GEL is accepted, and the old site's param shape is still accepted by Flitt's current API.

**Bonus result — the signature port is already validated.** Flitt rejects a bad signature, so a `success` response means the PHP→JS port of the signing algorithm (`array_filter` → `ksort` → `array_values` → prepend password → `join('|')` → `sha1`) is correct. That was Phase 2's main technical risk and it was retired before Phase 1 started.

> The throwaway script used for that check held the live merchant password in plaintext and has since been **deleted**. The algorithm now lives in `saas/lib/payments/flitt.ts`, cross-checked against the original implementation on 2026-07-29 (identical hashes across four param shapes, including the zero-value and key-order cases). Do not recreate a credential-bearing scratch script — `saas/scripts/test-flitt-signature.ts` covers the same ground with a throwaway password.

**Also outstanding, non-blocking:** rotate the merchant password (it sat in plaintext PHP on shared hosting for years and is now also in a Downloads folder), and get merchant-portal access from the client for refunds and transaction visibility.

---

## 3. Blockers found in the current code

These are the things that will silently break if not handled. All verified against the code on `staging` @ `e6a18eb`.

### 3.1 `proxy.ts` will eat the Flitt callback — must fix first

`C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\proxy.ts` runs on all routes (matcher excludes only static assets). Two of its redirects will intercept an inbound POST from Flitt's servers:

- **line 182** — tenant with `modulesPublicSite = false` → redirect to `/coming-soon`
- **line 168** — unresolved tenant → redirect to `/welcome`

Flitt would receive a 307 and the callback would never reach the handler. The payment would succeed at the bank and the order would stay unpaid forever.

**Fix:** an early bypass at the top of `proxy()` for `/api/payments/`, returning `NextResponse.next()` with the tenant headers set but *before* the auth guards and module redirects. This also skips the `supabase.auth.getUser()` round-trip, which is pure waste on a machine-to-machine call.

### 3.2 Neither submit action returns an order ID

- `createBooking()` returns `{ success, totalPrice, bookingType }`
- `submitWineOrder()` returns `{ success: true }`

Flitt's checkout needs `order_id`. Both must return the created row's `id`. Small change, but it is on the critical path for both triggers.

### 3.3 Confirmation email currently fires before payment could happen

`createBooking.ts:170-195` sends `sendBookingConfirmation` immediately on order creation. With payment on, that email says "your booking is confirmed" to someone who hasn't paid yet and may abandon checkout.

**Fix:** when the tenant has payment on *and* this order is going to checkout, suppress the immediate send and fire it from the settle function instead (§4.3). Tenants with payment off keep the current immediate send, untouched.

### 3.4 `totalPrice` is legitimately `0` for unconfigured tenants

`createBooking.ts:89-90` documents this deliberately: a tenant with no pricing tiers stores `0` and confirms the price manually. There is also a `showCompanyPrice` setting that hides the price from company bookings entirely.

You cannot send a 0 GEL checkout to Flitt. **The payment path must fall back to reservation-only whenever `totalPrice` is null or ≤ 0**, regardless of the module flag. This is a runtime condition, not a config one, and it needs to be a visible fallback rather than an error the customer sees.

### 3.5 `WineOrder` has no email column

Fields are `businessName, llcName, llcId, address, workingHours, contactName, contactPhone` — phone only. There is no address to send a payment receipt to. Either add `contactEmail` to the model, or accept that wine-order payments produce no customer receipt (the winery still sees it in admin). **Needs your call** — see §7.

### 3.6 Two different status conventions

`Order.status` is the `OrderStatus` enum; `WineOrder.status` is a bare `String @default("pending")`. The settle function has to handle both, and any new payment state has to be expressed twice, in two different shapes.

### 3.7 Storing the merchant secret in `Setting` would be a mistake

The earlier research suggested `Setting`, as the only existing per-tenant config mechanism. Having now read [[MaintenanceNotes]] §9: `getAllSettings()` returns the **entire** settings map including bank details, and the documented hazard is exactly that handing that map to a client component serialises it into public HTML. Adding a payment secret to that map puts the highest-value credential in the project one careless prop away from every visitor.

**Recommendation: keep it out of `Setting` entirely.** Put `flittMerchantId` and `flittSecretKey` on the `Tenant` model (or a dedicated `TenantPaymentConfig` row). They are then structurally unreachable from `getAllSettings()`, and the admin UI reads them through a purpose-built action that never returns the secret to the browser — only whether one is set.

---

## 4. Architecture

### 4.1 Schema changes

```
Tenant
  + modulesOnlinePayment  Boolean @default(false)   // off by default — additive for every existing tenant
  + flittMerchantId       String?
  + flittSecretKey        String?                   // never leaves the server

OrderStatus enum
  + PENDING_PAYMENT                                  // customer sent to Flitt, not yet settled

model Payment                                        // new — serves live payments AND the historical import
  id                String   @id @default(cuid())
  tenantId          String?
  orderId           String?                          // one of orderId / wineOrderId is set
  wineOrderId       String?
  provider          String   @default("flitt")
  providerPaymentId String?                          // Flitt's payment_id
  checkoutUrl       String?
  status            String                           // Flitt's order_status verbatim: created/approved/declined/…
  amount            Float
  currency          String   @default("GEL")
  rawResponse       Json?                            // full callback body, for disputes
  createdAt         DateTime @default(now())
  settledAt         DateTime?
```

`Order.totalPrice` and `OrderStatus.PAID` already exist and need no change.

Adding `Payment` means following the [[RLS-Architecture]] new-table checklist in full: `tenantId` column → `prisma migrate dev` against **dev** → add to both `writableTables` and `tenantedTables` in `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\scripts\setup-rls.ts` → re-run it → verify with `check-rls.ts`. Skipping the setup-rls step leaves the table readable across tenants.

Per [[ClaudeInstructions]] Rule 10, stop the dev server before any migrate/generate.

### 4.2 New files

```
saas/lib/payments/flitt.ts          signature build + verify, createCheckout()
saas/lib/payments/settle.ts         the ONE shared "mark paid + notify" function
saas/app/api/payments/flitt/callback/route.ts    server webhook (POST)
saas/app/api/payments/flitt/return/route.ts      browser return (POST from Flitt → redirect to a result page)
saas/app/(site)/payment/result/page.tsx          customer-facing success/failure screen
```

This is the repo's **first `app/api/` directory** — everything today is Server Actions. Confirmed correct for the inbound webhook: Flitt POSTs machine-to-machine, which a Server Action cannot receive. Next 16.2.6 Route Handler conventions apply (`route.ts`, exported `POST`, not cached).

### 4.3 The settle function — one path, not two

The old code duplicated the entire "mark paid + email" block across `response()` and `callback()`, and the two had already drifted apart. Both new routes call `settlePayment(providerPaymentId, rawBody)` in `settle.ts`, which:

1. Looks up the `Payment` row by `providerPaymentId`
2. Resolves `tenantId` from that row, loads the tenant's secret **outside** RLS (service-role, like `proxy.ts` already does for tenant lookup)
3. **Verifies the signature** — the old code never did this; anyone who learned a `payment_id` could POST a forged `order_status=approved`
4. **Verifies the amount matches the order's `totalPrice`** — also never checked by the old code, and the reason a tampered checkout could otherwise settle for 1 tetri
5. Returns early if the order is already `PAID` (idempotency — Flitt retries, and the return + callback routes both fire)
6. Enters `withTenantDb(tenantId, …)` to write the status change
7. Sends the emails

### 4.4 Tenant resolution on the callback

The earlier research assumed `x-tenant-id` would be unavailable on the callback. Having read `proxy.ts`: it is actually set for any resolved domain, including API routes, because Flitt calls the tenant's own domain. But it stays a *secondary* signal here — the authoritative binding is the `Payment` row, which is looked up by `providerPaymentId` and carries `tenantId` from checkout-creation time. That survives a tenant domain change mid-payment, which the header would not.

Also embed `tenantId` in Flitt's `merchant_data` at checkout creation as a third cross-check, per the original research.

### 4.5 Params sent to Flitt — deliberately different from the old site

| Param | Old site | New |
|---|---|---|
| `order_desc` | hardcoded `'nikalasmarani.ge'` | built from actual order contents |
| `response_url` / `server_callback_url` | hardcoded `https://www.nikalasmarani.ge/` | derived from the request host at runtime |
| `amount` | `total_price * 100` | `Math.round(totalPrice * 100)` — float×100 must not produce 4999 |
| `currency` | hardcoded `GEL` | `GEL` (fine — no multi-currency need) |
| signature | `array_filter($params,'strlen')` then sort/join/sha1 | same algorithm (it's Flitt's spec), but built from an explicit param list, not a filtered map |
| `lang` | not sent | follow the tenant's site locale |

The `array_filter` detail matters: the old code silently dropped empty params from the hash, so a normally-populated field going empty would change what got signed without any error. Building from an explicit list removes that class of bug.

---

## 5. Build phases

Each phase is independently shippable to `staging` and verifiable there. Per [[ClaudeInstructions]] Rule 0, nothing reaches `master` until you've confirmed staging.

**Phase 0 — verify the merchant account is live. ✅ DONE 2026-07-29.** Account `4056054` active, credentials valid, signature algorithm validated (see §2). Nothing blocks Phase 1.

**Phase 1 — schema + RLS.** Tenant columns, `modulesOnlinePayment`, `PENDING_PAYMENT`, `Payment` model, `setup-rls.ts`, `check-rls.ts`. Ships invisibly — no behaviour change at all.

**Phase 2 — `lib/payments/flitt.ts`.** Signature build + verify, `createCheckout()`. Unit-testable in isolation against the known-good param set from the old site. No UI yet.

**Phase 3 — proxy bypass + route handlers + result page.** The callback becomes reachable and settle-able. Testable end-to-end with a manually created checkout before either button is touched.

**Phase 4 — booking trigger.** `createBooking` returns the id; when payment is on and `totalPrice > 0`, create the checkout and return `checkoutUrl` for the client to redirect to. Confirm button becomes the purchase button. Suppress the premature email.

**Phase 5 — wine order trigger.** Same shape via `submitWineOrder`. Depends on the §7 email decision.

**Phase 6 — admin UI.** Super-admin `modulesOnlinePayment` checkbox alongside the existing four in `TenantFormClient.tsx`; tenant-admin fields for merchant id + secret (secret write-only, shows "set / not set", never returned to the browser); payment state visible on the orders list.

**Phase 7 — emails.** Payment-confirmation content, and the receipt decision from §7.

**Phase 8 — testing.** §8.

Phases 1–3 are invisible to every tenant. The first user-visible change is Phase 4, and only for a tenant that has the module on *and* credentials filled in.

---

## 6. Files touched

| File | Change |
|---|---|
| `saas\prisma\schema.prisma` | Tenant columns, `PENDING_PAYMENT`, `Payment` model |
| `saas\scripts\setup-rls.ts` | `Payment` in `writableTables` + `tenantedTables` |
| `saas\proxy.ts` | `/api/payments/` bypass before auth guards and module redirects |
| `saas\lib\payments\flitt.ts` | **new** |
| `saas\lib\payments\settle.ts` | **new** |
| `saas\app\api\payments\flitt\callback\route.ts` | **new** |
| `saas\app\api\payments\flitt\return\route.ts` | **new** |
| `saas\app\(site)\payment\result\page.tsx` | **new** |
| `saas\app\actions\createBooking.ts` | return id; conditional checkout; gate the email |
| `saas\app\actions\submitWineOrder.ts` | return id; conditional checkout |
| `saas\components\BookingForm.tsx` | redirect on `checkoutUrl`; button label |
| `saas\app\(site)\wines\WineCatalogueClient.tsx` | same |
| `saas\app\super-admin\tenants\TenantFormClient.tsx` | 5th module checkbox |
| `saas\app\admin\(panel)\settings\SettingsClient.tsx` | merchant id + secret fields |
| `saas\app\admin\(panel)\orders\*` | payment status column |
| `saas\lib\emails\*` | payment-confirmation content |
| `saas\scripts\seed-ka.ts` | `ka` rows for any new `form_*` label |

**[[MaintenanceNotes]] §1 applies to Phase 4:** changing the booking form's submit button means the label needs a `FIELDS.form` entry in `ContentClient.tsx`, a matching read in `BookingForm.tsx` via `fc()`, a mirror in `BookingFormVisualPanel.tsx`, and a `ka` seed row. A key with no `ka` row makes the Georgian toggle a silent no-op — this exact bug was issue #131.

---

## 7. Behaviour decisions — settled 2026-07-29

Max approved all four defaults. Overridable later; none is hard to reverse except the wine-order email column, and that is additive.

**The principle behind all four: when the winery has misconfigured something, the customer must never be the one who hits the wall.** Every branch below degrades to today's working reservation flow, never to an error the customer sees.

1. **Wine order receipts → add `contactEmail` to `WineOrder`, optional normally, required only when the tenant has payment on.** B2B buyers who pay online need something in writing for their books, and no receipt raises dispute risk. Making it mandatory for everyone would break reservation-only tenants. Conditional requirement matches the existing precedent in `createBooking` (phone *or* email required, not both).

2. **Abandoned checkout → stays `PENDING_PAYMENT` with a distinct badge in admin. No auto-cancel.** Preserves the lead for the winery to chase; avoids introducing scheduled jobs, of which this project has none. **The deciding reason: auto-expiry races Flitt's retries** — a late or retried callback arriving after the expiry window would land on an order we had already cancelled, i.e. cancelling something that was actually paid.

3. **Unconfigured pricing (`totalPrice` 0/null) → customer falls back to reservation-only; admin sees a warning banner.** Neither of the two options originally framed was right. Blocking the customer punishes them for the winery's config error and gives them nothing they can act on; silently falling back risks months of unnoticed free bookings. Doing both fixes both.

4. **Hidden-price company bookings → reservation-only, never charged.** `showCompanyPrice` exists because some company arrangements are negotiated privately. Charging a card for an amount deliberately never shown is a chargeback magnet and indefensible in a dispute. Those settle by invoice.

---

## 7a. Progress tracker

Updated as each phase lands, so work can resume here after any interruption. Statuses: ⬜ not started · 🚧 in progress · ✅ done.

| Phase | What | Status | Notes |
|---|---|---|---|
| 0 | Verify merchant account live | ✅ | 2026-07-29 — account `4056054` active, signature algorithm validated as a side effect |
| 1 | Schema + RLS | ✅ | 2026-07-29, commit `4b07b28`. Migration `20260729131800_add_online_payment` applied to **dev**; setup-rls re-run; check-rls shows `Payment` enabled + policy; existing `test-rls.ts` still 18/18. **Not yet applied to production** — `prisma migrate deploy` against prod is its own deliberate step after staging verification (Rule 0). |
| 2 | `lib/payments/flitt.ts` | ✅ | 2026-07-29. `buildSignature`, `verifyCallbackSignature`, `createCheckout`, `toMinorUnits`. 37 tests in `scripts/test-flitt-signature.ts`, plus an independent cross-check against the original algorithm. Flitt's docs confirmed the callback exclusion set (`signature`, `response_signature_string`) and one gotcha the plan missed: **a param valued `0` must not be dropped** — a truthiness filter would break the hash; the code uses a string-length test, matching PHP's `strlen`. |
| 3 | Proxy bypass + route handlers + result page | 🚧 | Proxy bypass **done**; `settle.ts`, the two route handlers and the result page remain. The proxy fix (§3.1) is the highest-risk item in the build |
| 4 | Booking trigger | ⬜ | Return id, conditional checkout, gate the premature email |
| 5 | Wine order trigger | ⬜ | Depends on Phase 1's `contactEmail` |
| 6 | Admin UI | ⬜ | Super-admin toggle, merchant credential fields, payment state in orders list |
| 7 | Emails | ⬜ | |
| 8 | Testing | ⬜ | §8 — module-off regression is the one protecting existing tenants |

**Working rules for this build** (per [[ClaudeInstructions]]): branch is `staging`, never commit to `master`; stop the dev server before any `prisma migrate dev`/`generate`; update [[FeatureLog]] as phases complete.

---

## 8. Testing

**Cannot be verified by unit tests alone** — the callback is inbound from a third party. Plan:

- Signature build + verify: unit tests against the old site's known-good params
- Amount tampering: forged callback with a mismatched amount must be rejected
- Forged approval: callback with a valid `payment_id` but invalid signature must be rejected (this is the specific hole in the old code)
- Idempotency: same callback delivered twice must settle once, send one email
- Proxy bypass: POST to `/api/payments/flitt/callback` on a `modulesPublicSite=false` tenant must reach the handler, not `/coming-soon`
- **Module-off regression:** a tenant with `modulesOnlinePayment=false` must produce byte-identical behaviour to today — same email timing, same order status, same button label. This is the test that protects existing tenants.
- Cross-tenant: tenant A's callback must not settle tenant B's order
- Live: one real low-value payment on staging against the real merchant account, then refund it via the portal

RLS verification via `check-rls.ts` after Phase 1, per the [[RLS-Architecture]] checklist.

---

## 9. Risk notes

- **The callback is the only unrecoverable path.** If it fails, the customer is charged and the order says unpaid. Every failure mode in `settle.ts` must log loudly and leave the `Payment` row with the raw body attached, so a human can reconcile from the Flitt portal.
- **Per-tenant secrets are new to this codebase.** All existing third-party credentials (Resend, Supabase) are platform-wide env vars. This is the first credential where a leak is scoped to one client but is also *their money*. §3.7 is the mitigation.
- **The `.ge` domain migration is a prerequisite for Nikala's Marani specifically**, not for the code. The code derives callback URLs from the request host, so it works on any domain — but Flitt's merchant account is registered against `nikalasmarani.ge`.
