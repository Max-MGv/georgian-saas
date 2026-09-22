---
tags: [plan, companies, contacts, schema]
---

# Plan — Contact Roles (generalised company people)

> **This is the live task tracker.** Update checkboxes and each chunk's Status line as work
> happens. **Chunks are sequential — do not start chunk N+1 until chunk N's Status is ✅**,
> unless a chunk's own notes say otherwise. If a session ends mid-chunk, note the resume point
> at the top of that chunk.

**Supersedes [[Plan-CompanyGuidesAndReps]].** That plan shipped `CompanyGuide` +
`CompanyRepresentative` as two hand-written, near-identical tables. This one replaces both with
a single role-driven design. Do not work from the old plan; it is kept for the reasoning in its
"Key considerations" section and for the record of what was built.

---

## 1. The original intent — Max's own words, 2026-09-19

**Read this first, every session.** Everything below is derived from it. If an implementation
decision seems to conflict with this section, this section wins and the plan is wrong.

> heres a feature I started implementing but I realised it needs a proper re-work.
>
> so, for companies we recently added heirarchy of guides, represenatvies and contact persons,
> adn gave them all access codes.
>
> there's been little misudnerstanding. here's hwo it should work and you can compare it to how
> it does work: A company should have ability to have Contact Person's & Guides. right now we
> have that + representative. but thats 1 extra.
>
> so 1 company can have several represntatives and guides but 1 of each per specific order. For
> better UI/UX experience, i want to original company code when entered - to prompt to choose
> guide and conact person. the point of this is to autofill. so our forms should have additiona;
> fields. right nwo it has first naem alst name, phone email - that is for contact persons (back
> office representative) now we also want to add guide info as well allright? only in the details
> booking option.
>
> And I am thinking to make this proper di mtables conneced to company, mayeb have col like type
> that says if theyre a gudie or contact person, so that each guide or contact perosn can have
> id. all of thsi is for bookign orders - for wine roders as-is - is fine - meanign only 1
> contact perosn - but we want to setup same sort of dim tables for orders - so that if in the
> future we want to add 2 types of contact persons - we can.
>
> I want you to review what we haev to update to relfect thsi change and what dependencies there
> are, we dotn want to accidentalyl break somethign or orphan somethign.
>
> the access code system they have now - can stay - but i want to make it a setting to be enabled
> from the admi nsettigns - disabled by default. if this method is enabled - turn out off the
> auto picker jsut in case soem crazy company doesnt want to share guide info insdie their
> companeis, so gudies and represenatatives cant see eahc others info)
>
> it should be trivially easy, to in the future add or remove types of contact data attached to
> an order, if let's say in the future i will need to add 3 types of busienss cotnact person
> types - it should be easy. it shoudl also be easy to feed soem of thsoe into each order - or
> haev them like - this is true for thsi company always - and this contact person type is for per
> order picker (lets say in the future i add ceo data, that doesnt need to be auto filled in the
> booking form its company data, shoudl live in company dim table )

### What that means, unpacked

1. **Two role types, not three.** Contact Person and Guide. Today's third concept — the scalar
   `Company.contactName/contactPhone/contactEmail` — is the "1 extra". "Representative" and
   "Contact Person" are **the same person**: Max's own gloss is *"first name last name, phone
   email — that is for contact persons (back office representative)"*.
2. **Several per company, exactly one of each per order.**
3. **The point of the picker is autofill**, not authentication. Say this out loud whenever the
   design is questioned — it is the reason self-declared attribution is acceptable.
4. **Guide fields are new on the booking form, in the detailed variant only.** Contact Person
   keeps the existing first name / last name / phone / email fields.
5. **Roles must be addable and removable without a migration.** *"trivially easy … if let's say
   in the future i will need to add 3 types of busienss cotnact person types"*.
6. **Two flavours of role.** Some are picked per order (Guide, Contact Person). Some are just
   company data that never appears on a booking form (Max's example: CEO). This is the `scope`
   column, and it is the single concept an admin has to understand.
7. **Wine orders get the same dim-table treatment.** Clarified 2026-09-19: *"i meant multiple
   contact person **types** — not multiple per order."* So wine orders support several roles,
   still one person per role per order.
8. **Access codes stay, but behind a setting, off by default.** When on, the picker is
   suppressed — *"just in case soem crazy company doesnt want to share guide info insdie their
   companeis, so gudies and represenatatives cant see eahc others info"*.
9. **The explicit brief for the review was:** *"we dotn want to accidentalyl break somethign or
   orphan somethign."* Section 5 is the answer to that sentence.

---

## 2. Decisions locked

Settled in the 2026-09-19 conversation. Do not re-open without Max.

1. **Roles live in a dimension table, not an enum.** Adding "CEO" is inserting a row.
2. **One `CompanyPerson` table** replaces `CompanyGuide`, `CompanyRepresentative` **and**
   `Company.contactName/contactPhone/contactEmail`.
3. **One polymorphic `OrderContact` table** for bookings and wine orders both, following
   `OrderEvent`/`Payment`'s shape rather than two parallel tables.
4. **`Order.name/surname/phone/email` stay and keep being written** for company bookings, as a
   denormalised copy of the Contact Person; `OrderContact` is the source of truth.
   *Why:* those columns are non-nullable and are the only place an INDIVIDUAL booking's guest
   name exists, so they cannot be removed. ~16 production files read them. One consistent
   meaning — "who to contact about this booking" — beats sixteen `if (companyBooking)` branches.
   **Written in exactly one place: `createBooking.ts`.**
5. **Wine orders get the full treatment** — real pickers, multiple role types. This reverses
   `Plan-CompanyGuidesAndReps` Chunk 1's "wine orders out of scope".
6. **`company_access_codes_enabled`, a tenant setting, default `'false'`. Tenant-wide only —
   no per-company override** (asked and answered explicitly). Off: no code gate, pickers
   everywhere. On: a person's own code identifies them directly and **the picker is suppressed
   entirely**.
7. **No order backfill.** Max: *"all orders are fake, no need to backfill or check the guide
   stuff."* `Order.guideId` is dropped, not migrated. **Company-side data is different** —
   guides, reps and company contacts are configuration someone typed, so Chunk 1 copies them
   into `CompanyPerson` rows rather than discarding them.
8. **Feature 201's uncommitted work folds in**, generalised from a guide-only picker to a
   per-role one. Not shipped separately first.
9. **One person per role per order** — `@@unique([orderId, roleId])`. Confirmed 2026-09-19.
10. **One shared resolver + one shared picker, consumed by all four forms** (Max, 2026-09-22,
    choosing this over patching the gap it was found through). See §4b.

---

## 3. What existed before this plan (verified by reading the code, 2026-09-19)

```prisma
model Company {
  contactName        String?   // ← the "1 extra": a scalar doing a table's job
  contactPhone       String?
  contactEmail       String?
  accessCode         String?
  guides             CompanyGuide[]
  representatives    CompanyRepresentative[]
}
model CompanyGuide          { companyId, name, phone?, code, orders Order[] }
model CompanyRepresentative { companyId, name, email?, phone?, code }
model Order                 { guideId String?, guide CompanyGuide? }
model WineOrder             { contactName String, contactPhone String, contactEmail String? }
```

Shipped over Chunks 1–11 of [[Plan-CompanyGuidesAndReps]] (2026-09-14), plus Feature 201
(2026-09-19, **uncommitted**). All of it was on `master`; migration
`20260914180619_add_company_guides_reps` was in the production migration folder.

### Precedent this plan copies rather than invents

| Need | Already in the schema |
|---|---|
| Child-of-Company table, JOIN-based RLS | `Price` |
| Polymorphic order/wine-order child, own `tenantId` | `OrderEvent`, `Payment` |
| Snapshots that survive the dimension changing | `WineOrderItem.priceSnapshot`, `OrderMasterclass.pricePerUnit`, `Order` rate snapshots |
| Tenant boolean setting, default off | `enable_enhanced_company_booking` (`lib/settings.ts`) |
| Fixed behaviour in code + customisable rows in a table | Magento's `state`/`status` split — [[DataModel/Research-OrderStatusPatterns]] |

> **On enum-vs-dimension-table, since this project already settled it once.**
> [[DataModel/Research-OrderStatusPatterns]] concluded statuses stay enums because *"the state
> machine is fixed; customisation is confined to labels."* Contact roles are the other side of
> that line: nothing branches on "is this a guide", only on `scope`. The dim table here is
> **consistent with** that decision, not a reversal of it. Written down so nobody re-opens it
> in three months.

---

## 4. Target shape

Built in Chunk 1. See `saas/prisma/schema.prisma` for the live version with its full comments.

- **`ContactRole`** — `tenantId`, `key`, `labelEn`, `labelKa`, `scope`, `appliesTo`,
  `sortOrder`, `isActive`, `isSystem`. Own `tenantId`, so a **direct** RLS policy.
- **`CompanyPerson`** — `companyId`, `roleId`, `name`, `phone?`, `email?`, `code?` (`@unique`),
  `isActive`. No own `tenantId`; **JOIN-to-Company** RLS, the `Price` shape.
- **`OrderContact`** — `tenantId?`, `orderId?` / `wineOrderId?` (exactly one set), `roleId`,
  `personId?`, and `nameSnapshot` / `phoneSnapshot` / `emailSnapshot`.
  `@@unique([orderId, roleId])` + `@@unique([wineOrderId, roleId])`.
- **Enums** — `ContactScope { PER_ORDER, COMPANY_LEVEL }`,
  `ContactApplies { BOOKING, WINE_ORDER, BOTH }`.

`Company.accessCode` **stays** — it is the company-level gate, separate from a person's code,
and now carries a `@unique` of its own.

---

## 4b. Four forms, one implementation

**Found 2026-09-22**, while checking whether the plan covered every dependency. It did not:
**four** forms autofill contact details from a company, and an early draft of this plan had them
in three different chunks with the fourth missing entirely.

| # | Form | File | Was |
|---|---|---|---|
| 1 | Public booking | `components/BookingForm.tsx` | Chunk 7 |
| 2 | Public wine order | `app/(site)/wines/WineCatalogueClient.tsx` | Chunk 8 |
| 3 | Admin manual booking | `app/admin/(panel)/orders/new/NewOrderForm.tsx` | Chunk 10 |
| 4 | Admin manual wine order | `app/admin/(panel)/wine-orders/new/NewWineOrderForm.tsx` | **missing** |

Form 4 autofills from `company.contactName` at line 130, under a comment that reads *"Mirrors
WineCatalogueClient.tsx's applyProfile()"* — the duplication was already documented in the code
and still went unnoticed.

**That is the H4 / [[MaintenanceNotes]] #22 shape exactly**: the same job implemented in several
places, drifting silently, eventually needing a consolidation someone has to pay for later.
Patching the missing form would have fixed the omission and left the pattern.

**Max's call: build it once.** Three shared pieces, and forms 1–4 become thin consumers:

- **`resolveCompanyContacts()`** (Chunk 3, server) — the single resolver. Given a company and
  optionally a typed code, returns `{ company, matchedPerson?, roleChoices }`, already filtered
  by `appliesTo` and already respecting `company_access_codes_enabled`. Replaces the four
  overlapping functions that caused H4.
- **`ContactPickerPopupView.tsx`** (Chunk 7) — pure render, role-driven, caller owns state.
  Generalised from Feature 201's `GuidePickerPopupView`, keeping its `aria-label` fix (H14).
- **`useContactSelection()`** (Chunk 7) — the client state machine: the
  `Record<roleId, personId>` map, applying a picked person's details into the form, and the
  resets. This is where H3's "reset it everywhere" lives, **once**, instead of four times.

**One honest asymmetry, not to be papered over.** The public forms reach the picker through a
*code popup*; the admin forms have no code step — an admin picks from a dropdown inline. So they
share the resolver, the hook and the option list, but the admin forms render the choices inline
rather than in the popup. Same data, same state machine, different trigger. Do not force the
popup into the admin screens to make the symmetry look neater than it is.

---

## 5. "Don't break or orphan anything" — the four findings

Max's explicit brief. Each was found by reading the actual code on 2026-09-19, and each changed
the build.

### F1 — `Order.guideId` was write-only

Written at `createBooking.ts:351`, read by **nothing** — no screen, print or email. The
attribution that justified the entire guides feature was not delivered anywhere; the booking
sheet only appeared to work because autofill copied the guide's phone into the guest's own
field.

**Confirmed independently in Chunk 1:** the dev database had **0 orders with a `guideId`** after
five days of the feature being live.

**Consequence: Chunk 10 is where this finally gets paid off.** Do not treat it as optional
polish; it is the feature's actual point.

### F2 — Deleting a guide silently erased order history

`Order.guide` was an optional relation with no `onDelete`, and **Prisma defaults that to
`SetNull`**. Deleting a guide nulled `guideId` on every past order, no warning, no trace. Same
shape as finding 2 in [[DataModel/Dependencies]]. Logged as [[KnownBugs]] #56.

**Fixed in Chunk 1** by snapshots on `OrderContact`: deleting a person loses the *link*, never
the *facts*.

### F3 — Every company's access code ships to the browser

`app/(site)/page.tsx:52` selects whole `Company` rows and passes them to `BookingForm`, a client
component whose `Company` type declares `accessCode: string | null`. **View source on the public
homepage and every booking company's code is there.** The form only ever uses it as a boolean.
Logged as [[KnownBugs]] #57. **Still open — fix in Chunk 7** (send `hasAccessCode: boolean`).
Same check needed on `app/(site)/wines/page.tsx`.

### F4 — Admin-side code leakage (lower severity)

`app/admin/(panel)/orders/page.tsx:289` passes full representative rows — **including their
codes** — into `OrdersTable`, a client component, when only `id`/`name`/`email` are used.
**Still open — narrow the projection in Chunk 10.**

---

## 6. Hurdles we have already hit — suggestions, not orders

Every item below is something this project actually got wrong at least once. None is a hard
rule; they are the cheap checks that would have caught a real bug. Read this section at the
start of the chunk it applies to.

### H1 — The old plan's dependency map was wrong in four places, and reading the file caught it every time

[[Plan-CompanyGuidesAndReps]] opened with a confident dependency list. Four entries were false,
each discovered only when someone opened the file:

| The plan assumed | The code actually did |
|---|---|
| `BookingSheetPrint.tsx` prints `Company.contactName/Phone` | It prints `o.name`/`o.surname`/`o.phone` — the **guest's** fields |
| The invoice modal's "To" was a manually-typed address | It was hardcoded to `order.email`, with no alternative |
| `Company.contactEmail` fed the invoice recipient | It was never consulted anywhere at all |
| The demo tour used a company-code flow that guides would break | Demo companies have **no `accessCode` at all** |

**Suggestion:** this plan's own file list is a starting point, not a fact. Open the file before
writing the chunk that touches it, and correct the plan in place when it is wrong.

### H2 — Optional Prisma relations default to `SetNull`, and it fails silently

Hit twice: `Payment` orphaning ([[DataModel/Dependencies]] finding 2) and `Order.guideId` (F2).
**Suggestion:** state `onDelete` explicitly on every new relation even when the default is what
you want, so the next reader sees a decision rather than an omission. *Done in Chunk 1.*

### H3 — `buildBookingPayload()` is the only place a booking field may be added

[[MaintenanceNotes]] #1: `BookingForm.tsx` has two submit paths — the normal one and the "New
Company?" popup (Feature 180) — and both build their payload through this one function. **A
field added outside it is silently dropped by the popup path.** Already happened once. Chunk 7
adds several fields.

### H4 — Two code-resolution functions silently disagreed for five days

[[MaintenanceNotes]] #26: `verifyBookingCode()` rejected a company code for any company with
guides while `findBookingCodeByCode()` accepted it unconditionally, so **the same code worked or
failed depending on how it was typed**. Both functions' comments claimed they mirrored each
other. **Chunk 3 collapses them into one resolver — that is the real fix.**

### H5 — Adding a guide silently killed a code already in circulation

[[KnownBugs]] #55. A winery hands `MARANI42` to a tour operator; months later someone adds a
guide; the code dies that instant; `/admin/companies` still displays it as live. **Suggestion:**
whenever a change makes an existing credential stop working, ask what the admin panel will show
afterwards. "Still looks live" is the trap, not the logic. *This is why Chunk 1 preserved every
migrated code verbatim.*

### H6 — A green RLS check proves nothing

[[MaintenanceNotes]] #10: `check-rls.ts` only confirms a policy *exists*; `test-rls.ts` **skips
its cross-tenant section entirely** on a one-tenant database and still prints a clean pass. The
dev DB normally has one tenant. **Suggestion:** copy `test-payment-rls.ts`'s two-tenant pattern.
*Did exactly this in Chunk 2 — and it immediately caught H18.*

### H7 — Reading a column off `Tenant` through `withTenantDb` returns `null`, not an error

[[MaintenanceNotes]] #27. `Tenant` has RLS enabled with zero policies, so `app_user` gets an
empty result that every `?? false` fallback swallows. **Suggestion:** this is why Chunk 6 puts
the toggle in `Setting` rather than on `Tenant`. If anyone moves it, they must use the plain
`db` client.

### H8 — `prisma migrate dev` while the dev server runs breaks the client silently

[[ClaudeInstructions]] Rule 10 / [[MaintenanceNotes]] #3. On Windows the schema pushes but the
client is **not** regenerated (EPERM on the DLL rename). **Suggestion:** stop the server, run
it, confirm the output ends `Generated Prisma Client`, restart.

### H9 — A `'use server'` file may only export async functions

[[MaintenanceNotes]] #24 — not even a type re-export survives. `generateCode()` is already
private for this reason. Chunks 3 and 4 add helpers; sync ones belong in `lib/`.

### H10 — Order queries must exclude abandoned orders, and nothing enforces it

[[MaintenanceNotes]] #28: an abandoned order sits at `stage: 'NEW'` and renders as an ordinary
booking. The exclusion is `NOT_ABANDONED` in `lib/orderFilters.ts`, spread in by hand.
**Suggestion:** any new order query in Chunks 10–11 needs it.

### H11 — The Playwright company-edit-panel helper loses ~50% of its clicks

`payments.ts`'s `openCompanyEditPanel` pairs a company's name button with its Edit button via an
xpath walk; `booking-enhanced.spec.ts` documented it as unreliable on this exact panel and uses
index matching instead. **Suggestion:** Chunk 13 uses the index-matching variant.

### H12 — A long-lived dev server can start 404ing on routes that exist

After many hours and dozens of hot-reloads, `/admin/login` began returning 404; a plain restart
fixed it. **Suggestion:** if a Playwright run hangs at login, `curl -D -
http://localhost:3000/admin/login` before blaming the test.

### H13 — A fixture that can't distinguish two outcomes proves neither

Feature 201: `Silk Road Journeys`'s contact person was also its first guide, so "I am not on
this list" and "pick guide 1" filled the form identically. **Suggestion:** in Chunk 12, give
every seeded role a visibly different person.

### H14 — Buttons built from nested spans have no accessible name

Feature 201: the guide buttons' name and phone were separate nested spans, so the computed
accessible name was empty — no screen reader, no Playwright selector. Fixed with an explicit
`aria-label`. **Suggestion:** the generalised picker keeps that, and Chunk 13 asserts on it.

### H15 — Measure before building

[[Plan-Performance]]. A batching refactor was built on an assumption that measurement
falsified. **Suggestion:** if the picker makes the booking path look slow, measure first.

### H16 — Demo seed data has mixed units before

[[KnownBugs]] #42: the seed mixed GEL tier rates with tetri masterclass amounts.
**Suggestion:** Chunk 12 touches the seed; re-run the money plausibility audit afterwards.

### H17 — Never hand a client component the whole settings map

[[MaintenanceNotes]] #9: `getAllSettings()` includes `payment_iban` and friends. Chunk 6 reads
one key. **Suggestion:** pass that key, not the map. F3 and F4 are the same mistake in a
different costume — over-broad projections into client components.

### H18 — `setup-rls.ts` has two lists, and a table in only one of them silently returns nothing

Found 2026-09-22, during this plan's own Chunk 2. `writableTables` switches RLS **on** and
grants `app_user` access; `tenantedTables` creates the **policy**. A table in the first but not
the second has RLS enabled with zero policies, which makes Postgres **default-deny every row** —
reads come back empty, nothing throws, and `check-rls.ts` still reports the table as fine. The
same silent shape as [[MaintenanceNotes]] #27.

It happened because both arrays end with the identical line `'OrderEvent',`, so an edit aimed at
the second one landed in the first. **Suggestion:** after editing that file, check the table
count it prints at the end, and confirm every new table actually has a policy:

```sql
SELECT relname, relrowsecurity, polname
FROM pg_class LEFT JOIN pg_policy ON polrelid = oid
WHERE relname IN ('ContactRole','CompanyPerson','OrderContact');
```

A `null` in the `polname` column is the bug.

---

## 7. Current status

| Chunk | What | Status |
|---|---|---|
| **0** | Seed-role definitions | ✅ Done |
| **1** | Schema + migration (dev DB) | ✅ Done |
| **2** | RLS policies + two-tenant test | ✅ Done |
| **3** | Server actions — roles, people, code resolution | ✅ Done |
| **4** | Admin — Contact Roles management screen | ✅ Done |
| **5** | Admin — Edit Company people list, role-driven | ✅ Done |
| **6** | Settings — `person_codes_enabled` | ✅ Done |
| **7** | **Shared picker + hook** + public booking form | ✅ Done |
| **8** | Both wine order forms (public + admin manual) | ✅ Done |
| **9** | Write path — `OrderContact` rows + snapshots | ⬜ Not started |
| **10** | Admin order surfaces — finally display contacts | ⬜ Not started |
| **11** | Emails — invoice recipient from roles | ⬜ Not started |
| **12** | Demo seed, onboarding, test fixtures | ⬜ Not started |
| **13** | Tests | ⬜ Not started |
| **14** | Vault + close-out | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Chunks 0–8 all done (2026-09-22).
**Chunk 9 next — the write path.** Both public forms and both admin forms now build a
`contacts` payload and nothing consumes it yet; Chunk 9 turns those into `OrderContact` rows
with snapshots. **Nothing breaks the build at runtime any more** — every route returns 200.

**43 type errors remain**, none of them in a file Chunks 7 or 8 own:
`app/admin/(panel)/orders/page.tsx` (9, Chunk 10), `app/actions/orders.ts` (9, Chunks 9/11),
`scripts/backfill-test-fixtures.ts` (8, Chunk 12), `app/admin/onboarding/page.tsx` (5,
Chunk 12), `app/actions/onboarding.ts` (5, Chunk 12), `lib/demoSeed.ts` (4, Chunk 12),
`app/actions/createBooking.ts` (3, Chunk 9).

Chunk 7 cleared 5 (one on `app/(site)/page.tsx`, three on `components/BookingForm.tsx`, one
that left with `GuidePickerPopupView.tsx`); Chunk 8 cleared the remaining 6, across both wine
pages and `WineCatalogueClient.tsx`.

*(Count the lines matching `error TS`, not the lines of output — a multi-line "Type ... is
missing the following properties" explanation belongs to the error above it. This note briefly
said 45, from summing a per-file list by hand; 49 is what the compiler reports. The running
figure has been 65 → 54 → 49. An earlier revision also said "~46", a separate slip on a
correct list.)*

### ✅ Every route renders as of Chunk 8

Chunk 7 rewrote `components/BookingForm.tsx` and Chunk 8 rewrote
`app/(site)/wines/WineCatalogueClient.tsx` — the two files whose stale Chunk 3 imports failed
every route through Turbopack's whole-graph export resolution. Measured 2026-09-22 after both:
`/`, `/wines`, `/about`, `/contact` and `/admin/login` all return **200**, and `/wines` no
longer takes `/admin/login` down with it.

**This section's original diagnosis named only one of those two files, and the handoff repeated
it.** Chunk 7 found the second the hard way — the admin panel worked until something compiled
`/wines`, then stayed broken until a dev-server restart. Worth remembering as a shape: "one
stale import file breaks everything" is rarely a claim about exactly one file.

What remains, and does not block anything:

- `/admin/orders` still 500s — `app/admin/(panel)/orders/page.tsx` selects a dropped relation.
  **Chunk 10 owns it.** It is a per-request Prisma error, not a module-resolution one, so
  unlike `/wines` it does not poison the graph for other routes.
- Verifying an admin screen needs an admin login, and **typing a password into a form is
  off-limits for Claude**, including when asked to. Settled in practice on 2026-09-22: Max
  signed in himself and handed the session over. The Chunk 13 Playwright specs are the other
  route — they read `credentials.txt` directly (`tests/helpers/credentials.ts`), so the
  credential never passes through Claude either way.

**Plan amended 2026-09-22** after a dependency re-check found two gaps: the admin manual
wine-order form was missing entirely, and `app/admin/onboarding/page.tsx` was unlisted. Max chose
to fix the *pattern* rather than the omission — see decision 10 and §4b.

⚠️ **The tree does not compile right now, and that is expected.** The migration is applied to the
dev DB, so `CompanyGuide`, `CompanyRepresentative`, `Order.guideId` and
`Company.contactName/Phone/Email` no longer exist while ~10 files still reference them —
The running count is kept in the resume point above.
**Do not try to "fix the build" ahead of the chunk that owns each file.**

⚠️ **`staging.vineworks.ge` reads the dev database and is therefore broken** until Chunks 3–7
land — the deployed code still selects dropped columns. Expected and recoverable, but worth
knowing before demoing anything from staging.

**Chunks 0–7 are committed and pushed to `staging`.** Nothing has reached `master`; the
production database still has the old tables and awaits `prisma migrate deploy` at Chunk 14.

---

## 8. Ground rules for every chunk

1. **[[ClaudeInstructions]] Rule 0** — `prisma migrate dev` against **dev**, verify on
   `staging`, `prisma migrate deploy` to production as its own deliberate step. Never straight
   to `master`.
2. **Rule 10 / H8** — stop the dev server before any `migrate dev` or `generate`.
3. **Rule 8** — state the chunk's plan, get a go-ahead, then edit.
4. **H6** — new tenanted tables get a real two-tenant RLS test, not a green tick.
5. **H3** — `buildBookingPayload()` is the only place a booking field may be added.
6. **⚠️ Migrations must not touch `Company` rows or `Price`.** Price tiers are tenant setup, not
   fake data — [[DataModel/Dependencies]] finding 1. **Read the generated SQL before running.**
7. EN + KA for every new admin string (`lib/adminT.ts`) and public string (`lib/t.ts`); the
   parity check must stay green. **Role labels are tenant data** and live in
   `ContactRole.labelEn/labelKa`, not in those files.
8. [[MaintenanceNotes]] #26 gets rewritten by this plan, not merely appended to — Chunk 14.
9. `saas/AGENTS.md`: this is **Next.js 16.2 / React 19.2** — check
   `node_modules/next/dist/docs/` before writing component or routing code, rather than relying
   on remembered conventions. Applies from Chunk 4 onward.

---

## Chunk 0 — Seed roles

**Status:** ✅ Done (2026-09-22)

- [x] **Two seeded system roles, locked.** Labels are the project's own existing Georgian, taken
      from `adminT.ts` rather than invented — `გიდები`/`გიდი` is already used for guides
      (`companies.people.guidesTitle`) and `საკონტაქტო პირი` already renders as "contact person"
      in two places (`orders.sheet.contactName`, `companies.editPanel.contactPerson`):

      | key | scope | appliesTo | sortOrder | EN | KA |
      |---|---|---|---|---|---|
      | `contact_person` | PER_ORDER | BOTH | 10 | Contact Person | საკონტაქტო პირი |
      | `guide` | PER_ORDER | BOOKING | 20 | Guide | გიდი |

      Singular, because a role label names one person in a list row. `contact_person` sorts
      first: it appears on both forms and it is the role that writes the legacy
      `Order.name/surname/phone/email` columns (decision 4). `guide` is BOOKING-only — a wine
      order has no visit for a guide to attend.

- [x] **No COMPANY_LEVEL role ships in this pass — only the `scope` column that makes one
      possible later.** CEO was Max's illustration of *why* the column must exist, not a request
      to build it. Building it unasked would be scope creep, and the requirement it demonstrates
      is satisfied by the column alone. **Chunk 4's screen must still let an admin create a
      COMPANY_LEVEL role**, or the requirement is only half met.

- [x] **System roles can be renamed and deactivated, never deleted.** Renaming is safe — labels
      are display-only and `key` is what code matches on. Deleting is not: every `OrderContact`
      and `CompanyPerson` points at a role. Deactivating hides it from the pickers and from Edit
      Company while leaving history readable.

**Resume point:** —

---

## Chunk 1 — Schema + migration

**Status:** ✅ Done (2026-09-22) · migration `20260922101500_contact_roles`, **dev DB only**

- [x] Added `ContactRole`, `CompanyPerson`, `OrderContact` + `ContactScope` / `ContactApplies`
- [x] **Every new relation states its `onDelete` explicitly** (H2), including where the default
      was already right: `CompanyPerson.company` Cascade, `CompanyPerson.role` **Restrict**
      (deleting a role must never silently delete its people), `OrderContact.order` /
      `.wineOrder` Cascade, `OrderContact.role` Restrict, `OrderContact.person` **SetNull** —
      which is now *correct* rather than the bug it was on `Order.guideId`, because the
      snapshots mean the link can go without the facts going with it
- [x] Two system roles seeded per tenant, inside the migration
- [x] `Company.contactName/Phone/Email` copied into `contact_person` rows, then dropped
- [x] Guides and representatives copied into `CompanyPerson`, **codes preserved verbatim** —
      regenerating them would have been exactly the silent-credential-breakage of H5
- [x] `CompanyGuide`, `CompanyRepresentative`, `Order.guideId` dropped
- [x] **SQL read before running** (ground rule 6) — no `DELETE`, no `UPDATE`, no `Price`
- [x] Dev server confirmed not running → applied → `Generated Prisma Client` confirmed

**Written by hand, not generated.** `prisma migrate dev` refuses to run non-interactively when a
migration drops non-empty columns or tables, and the generated version would only have dropped —
it cannot know the guide/rep/contact rows are configuration worth carrying across.

**Pre-flight audit of the dev DB, which shaped the migration:** 3 tenants, 22 companies, **none
with a null `tenantId`** (what makes `ContactRole.tenantId` safe as non-nullable), 18 companies
carrying contact details, 3 guides, 6 representatives, **no duplicate codes in any of the three
sources** (what makes the new unique indexes safe), and **0 orders with a `guideId`** — which
independently confirms F1.

**Verified after applying:** 6 roles (3 tenants × 2) with the right labels, scopes and sort
order · 27 people = 18 company contacts + 3 guides + 6 reps · 24 `contact_person` + 3 `guide` ·
9 carrying codes, 9 distinct — no collisions · 0 blank names, 0 orphans · all four dropped
objects confirmed gone.

**One design change from the plan as written.** The code-pool unique indexes were going to be
*partial* (`WHERE code IS NOT NULL`). They are plain `@unique` instead: Postgres already treats
NULLs as distinct in a unique index so the behaviour is identical, and **Prisma cannot express a
partial index** — a partial one would have left `schema.prisma` and the database permanently out
of sync, with every later `migrate dev` trying to "fix" it. `Company.accessCode` got the same
treatment. This is the first DB-level guarantee that code pool has ever had
([[MaintenanceNotes]] #26).

**Resume point:** —

---

## Chunk 2 — RLS

**Status:** ✅ Done (2026-09-22) · 19/19 passing, twice

- [x] All three tables added to `setup-rls.ts`'s `writableTables`
- [x] `ContactRole` — direct `tenantId` policy
- [x] `CompanyPerson` — JOIN-to-Company, copied from `Price`'s
- [x] `OrderContact` — direct `tenantId`, following `OrderEvent` (the same
      polymorphic-child-that-carries-its-own-tenantId shape)
- [x] `test-guides-reps-rls.ts` deleted; `scripts/test-contact-roles-rls.ts` written on
      `test-payment-rls.ts`'s two-tenant pattern — 19 assertions, run twice, no leftover rows,
      real data confirmed intact afterwards
- [x] Old guides/reps policy blocks removed; a tolerant `DROP POLICY IF EXISTS` loop kept so
      re-running the script against a half-migrated DB cleans up after itself
- [ ] Extend the checklist in [[RLS-Architecture]] — **deferred to Chunk 14** with the other doc
      updates

Beyond isolation, the test pins three things this design depends on: a cross-tenant
`CompanyPerson` insert is refused (the `WITH CHECK` half, which a `USING`-only policy would
miss), a duplicate `code` is refused **by the database** rather than only by app code, and
deleting a role that still has people is refused (`Restrict`, not `Cascade`).

### 🔴 A real defect this chunk produced, and the test caught — now hurdle H18

`ContactRole` and `OrderContact` were added to `writableTables` (RLS **on**) but not to
`tenantedTables` (the **policy**). RLS enabled with no policy default-denies every row silently.
Caught only by the `sees exactly 1` assertions in the new two-tenant test — precisely the
scenario H6 exists to warn about, hit on the first chunk that could hit it. Root cause: an edit
landed in the wrong array, because **both arrays end with the same `'OrderEvent',` line**.

**Resume point:** —

---

## Chunk 3 — Server actions

**Status:** ✅ Done (2026-09-22) · 22/22 resolver tests passing, twice

- [x] `app/actions/contactRoles.ts` — role CRUD. Deleting a system role is refused, and so is
      deleting any role still in use, with a sentence an admin can act on rather than a
      foreign-key error. `scope` is deliberately **not** editable: flipping PER_ORDER →
      COMPANY_LEVEL would strand every `OrderContact` already pointing at it
- [x] `app/actions/companyPeople.ts` replaces `companyGuides.ts` — **ten near-identical
      functions became five.** A code is only minted when the tenant actually uses person codes;
      generating one while the feature is off would put a live-looking credential in the admin
      panel that nothing accepts, which is the H5 trap in reverse
- [x] `codeExistsInTenant` drops from three sources to two
- [x] **`resolveCompanyContactsFor()` replaces all four resolvers** — `verifyCompanyCode`,
      `verifyBookingCode`, `findBookingCodeByCode`, `findCompanyByCode`. One function cannot
      contradict itself, which is the permanent fix for H4
- [x] Respects `person_codes_enabled` in both directions, including returning an **empty**
      `roleChoices` on a successful company match when codes are on — that emptiness *is* the
      privacy feature, and callers must read it as "ask them to type their details", never as an
      error
- [x] `withTenantDb` throughout; every write re-verifies the parent company's tenant
- [x] `scripts/test-contact-resolution.ts` — 22 assertions over a throwaway tenant, both modes,
      run twice, no leftover rows. `test-contact-roles-rls.ts` still 19/19

### The setting is `person_codes_enabled`, not `company_access_codes_enabled`

Decision 6 named it `company_access_codes_enabled`. Building it surfaced that the name described
the wrong thing, and the wrong thing would have broken a live feature.

Max's words were *"the access code system **they** have now"* — and "they", in the sentence
before it, were the guides and contact persons who had just been given codes. So the setting
governs **person codes**. `Company.accessCode` is untouched by it and works in both modes.

That distinction is load-bearing, not pedantic: the company code is the **only** way the
`hide_company_dropdown` booking variant (Features 113/114) can identify a company at all, since
that variant has no dropdown. Gating it behind a tenant setting that defaults to off would have
silently broken that form for any tenant using it — an H5-shaped failure, discovered by
implementing rather than by planning.

### 🔴 A real defect the resolver test caught — the `appliesTo`/`scope` hole

The person-code lookup filtered the **company** by module but never the **role**. Two
consequences, both live until the test found them:

- a `BOOKING`-only guide code resolved on the **wine-order** form;
- a `COMPANY_LEVEL` person — a CEO — holding a code would have resolved on a **public order
  form**, which is the exact thing `scope` exists to prevent.

This is the same shape as the hole the status redesign already hit: `appliesTo` filtered the
dropdown but never the foreign key, so nothing stopped a booking being marked DELIVERED
([[DataModel/Research-OrderStatusPatterns]]). **Filter where the value is chosen, not only where
it is displayed.** Fixed, and both halves are now asserted.

### Two structural choices worth knowing

**The resolver lives in `lib/contactResolution.ts`, not in the actions file.** It takes an
explicit `tenantId`, and a server action is callable by the browser — exporting a
tenant-parameterised function from a `'use server'` file would let a client pass any tenant's
id. `app/actions/companies.ts` holds two thin wrappers that resolve the tenant from the request.
It also made the function testable at all, since `getTenantId()` needs a request context.
Consumers import the types from `@/lib/contactResolution`, because a `'use server'` file cannot
re-export even a type (H9 / [[MaintenanceNotes]] #24).

**`ContactChoice` deliberately has no `code` field.** The shape goes to a browser, and F3 and F4
are both this exact mistake already made once. A test asserts no code appears anywhere in the
payload.

### Correction to this chunk as originally written

The last checkbox used to read *"`tsc --noEmit` clean for `app/actions/**`"*. That was wrong:
`createBooking.ts` (Chunk 9), `orders.ts` (Chunks 9/11) and `onboarding.ts` (Chunk 12) are
legitimately later chunks' work, and pulling them forward to chase a green check would have
meant writing `OrderContact` rows before the chunk that designs that write path. The real
criterion, met: `companies.ts`, `contactRoles.ts`, `companyPeople.ts` and `contactResolution.ts`
typecheck clean, and `companyGuides.ts` is gone.

**Resume point:** —

---

## Chunk 4 — Admin: Contact Roles screen

**Status:** ✅ Done (2026-09-22) · typecheck + i18n parity green; **visual check deferred, see
the resume note above**

- [x] `app/admin/(panel)/settings/ContactRolesPanel.tsx` — add / edit / turn off / delete, with
      label EN + KA, scope, appliesTo and sort order. A **sibling** of `SettingsClient.tsx`, not
      a section inside it: that file is already ~1560 lines and this is self-contained
- [x] System roles are renameable but have **no delete button at all**, rather than one that
      always errors. The server refuses either way; an absent control is honest where a dead one
      is the H5 trap in miniature
- [x] **Creating a COMPANY_LEVEL role is supported**, which is what makes Chunk 0's deferral of
      the CEO role legitimate rather than a quiet drop of the requirement
- [x] `scope` is offered on create and **hidden on edit** — changing it would strand every
      `OrderContact` already recorded against that role. The server refuses it too, so the UI is
      not the only guard
- [x] The `appliesTo` control is hidden entirely for tenants without the wine-orders module, and
      a COMPANY_LEVEL role stores `BOTH` rather than a module restriction that means nothing
- [x] 23 new `adminT` keys, EN + KA. **Parity 1106/1106** (was 1083)
- [x] `person_codes_enabled` toggle added to `SettingsClient.tsx` — pulled forward from Chunk 6
      because Chunk 5's code fields are gated on it and a half-wired setting is worse than a
      finished one. Chunk 6 is now essentially done; it keeps its row only for the help copy
- [x] `settings/page.tsx` fetches roles via `listContactRoles()` and passes the wine-orders
      module flag through

**Georgian labels were written, not transliterated.** They reuse the project's own existing
vocabulary (`საკონტაქტო პირი`, `გიდი`, `დამატება`, `წაშლა`) rather than inventing terms, and
`settings.common.save` / `.cancel` were reused outright instead of adding near-duplicate keys.
Standing caveat from Feature 201 still applies: **drafted, not natively reviewed.**

**On the scope copy.** The labels deliberately never say PER_ORDER or COMPANY_LEVEL. They say
*"Chosen per booking — fills in the form"* and *"Company information — never on a booking
form"*, which is Max's own framing from the brief. This is the one concept an admin has to
understand for the feature to make sense, so it gets the plainest words available.

**Verified:** `tsc --noEmit` clean for every settings file · i18n parity 1106/1106 ·
`/admin/settings` returns 307 to login (route compiles, guard runs) · no `ContactRoles`-related
entry in the dev server log.

**Not verified, and honestly so:** the panel has never been *rendered*. See the resume note —
the whole app 500s on `BookingForm.tsx` until Chunk 7, and an admin screen needs a password
typed in besides.

**Resume point:** —

---

## Chunk 5 — Admin: Edit Company

**Status:** ✅ Done (2026-09-22) · typecheck + parity green; **visual check deferred to Chunk 7**

- [x] `GuidesSection` + `RepresentativesSection` (two near-identical ~75-line components, plus
      two near-identical forms) collapse into **one `PeopleSection` rendered once per active
      role**. A role added on the settings screen now appears here with no code change, which is
      the requirement the whole rework exists for
- [x] `PersonCodeField` kept, but rendered **only when `person_codes_enabled` is on** — a code
      control for a switched-off feature is a live-looking credential nothing accepts, which is
      H5's trap in miniature
- [x] `companies/page.tsx` selects only the columns the client renders, and **drops `code`
      entirely from the payload when person codes are off** (H17 — F3 and F4 were both
      over-broad projections into a client component)
- [x] Inactive people are filtered out of the panel; deactivating is how a person is retired
      without erasing them from past orders
- [x] The three company contact inputs are gone from the edit panel — they are `CompanyPerson`
      rows now
- [x] `companies.people.*` generalised: 8 dead keys removed (`guidesTitle`, `repsTitle`,
      `addGuide`, `addRepresentative`, …), 3 added (`roleHint`, `noneYet`, `addTo`), EN + KA.
      **Parity 1101/1101.** Role names come from the database, not the dictionary

### One deliberate simplification

**Every role now gets the same three fields — name, phone, email.** The old split gave guides no
email and representatives no reason to be phoned during a visit. That was a guess baked into two
table definitions, and it is exactly the kind of guess that needs a migration to undo. An unused
box is cheap; a missing column is not.

### Two smaller things worth knowing

**`missingDetails()` changed meaning.** It used to flag a company whose three contact columns
were all empty. It now flags one with **no people at all** and no address. Same intent, and it
is still kept in sync with `getFinishDetailsStatus()` in `onboarding.ts`, which the function's
own comment already required.

**The wine-orders tab summary shows the first person on file** rather than the old scalar
columns. A company can have several; that strip is a one-line summary and the edit panel is
where the full list lives.

### Verified

`tsc --noEmit` clean for both companies files · i18n parity 1101/1101 · the page's real query
run against the dev database: both roles returned in the right order, 9 of 9 companies have
people, and **no active person falls outside a rendered role** — so nobody is invisible in the
new panel.

That check also showed the migration's predicted pair, working as designed: *Alazani Valley
Tours* has both its old company contact (`Levan`, no code) and its old representative (`Tamuna`,
code preserved) as `contact_person` rows. Chunk 1's comment called this out — visible and
fixable in the panel, where a dropped phone number would have been neither.

> **Correction, 2026-09-22 (Chunk 7).** The handoff called these "duplicate `contact_person`
> rows … a two-minute tidy". **They are not duplicates and there is nothing to tidy.** All 25
> rows were read before touching anything: on each of the five affected companies the two people
> have different names, different phone numbers and different email addresses — one operational,
> one finance (`hello@` / `finance@`, `bookings@` / `invoices@`, `groups@` / `accounts@`,
> `ops@` / `billing@`, `reservations@` / `ap@`). Merging them would have thrown away a real
> address. Several contact persons per company is the model working, not a migration artefact.
>
> Two rows *were* deleted, both hand-typed test junk on Alazani Valley Tours from 2026-09-19: a
> Contact Person called `test test` with no phone or email, and a Guide called `x` with phone
> `1`. Neither was referenced by an `OrderContact` (there are none until Chunk 9). 27 people →
> 25.
>
> That also leaves the fixtures usefully split for H13: **Silk Road Journeys** is the company
> with both roles populated (2 + 2), and **Alazani Valley Tours** is the contrast — contact
> persons, no guides — so "one picker fires" and "two pickers fire" are distinguishable.

**Not verified:** nothing has been rendered. Same two blockers as Chunk 4 — the app 500s on
`BookingForm.tsx` until Chunk 7, and an admin screen needs a password typed in.

**Resume point:** —

---

## Chunk 6 — Settings

**Status:** ✅ Done (2026-09-22) · built across Chunks 3–4, live-checked in Chunk 7 · **Read H7, H17**

- [x] `person_codes_enabled: 'false'` in `lib/settings.ts` `SETTING_DEFAULTS` (Chunk 3 — the
      resolver needed it). **Renamed from `company_access_codes_enabled`**; see Chunk 3 for why
      the original name described the wrong thing and would have broken a live form
- [x] Toggle in `SettingsClient.tsx` + `settings/page.tsx`, copying
      `enable_enhanced_company_booking`'s wiring exactly (Chunk 4 — Chunk 5's code fields gate
      on it, and a half-wired setting is worse than a finished one)
- [x] **Kept in `Setting`, not on `Tenant`** — H7 explains what that costs
- [x] Help text stating the trade-off plainly: on = codes prove identity but colleagues stay
      private; off = one-click autofill but everyone sees the list
- [x] **Confirmed live 2026-09-22** (Chunk 7's click-through): the toggle flips, persists to the
      database, and survives a page reload. Its consequence was checked on the public form too —
      codes on means no picker and no colleague names in the page, and a person's own code
      resolves them directly into their own role's fields. Setting restored to `false` after

**Resume point:** —

---

## Chunk 7 — Shared picker + public booking form

**Status:** ✅ Done (2026-09-22) · typecheck clean for every file this chunk owns · parity
1101/1101 · RLS 19/19 · resolver 22/22 · **and the app renders again** · **Read §4b, F3, H3,
H13, H14, ground rule 9. Folds in Feature 201.**

**This chunk builds the two shared client pieces** (decision 10). Chunks 8 and 10 consume them
rather than reimplementing. The booking form is their first consumer, not their owner — if
something here only makes sense for bookings, it belongs in the form, not in the shared piece.

- [x] **Fix F3 first:** `app/(site)/page.tsx` sends `hasAccessCode: boolean`, never the code.
      Same on `wines/page.tsx`. Closes a live leak ([[KnownBugs]] #57 — now resolved)
- [x] **Build `components/ContactPickerPopupView.tsx`** — generalised from
      `GuidePickerPopupView.tsx`, role-driven, pure render, caller owns state. **`aria-label`
      kept** (H14) and confirmed live. Renders **one role per showing**; the role is expressed
      only through the caller's `title`/`intro`, so the component never branches on which role
      it is looking at. `GuidePickerPopupView.tsx` deleted
- [x] **Build `useContactSelection()`** (`lib/useContactSelection.ts`) — the
      `Record<roleId, ContactSelection>` map, the queue of roles still to ask about, the call to
      the resolver, and every reset. Shared by all four forms
- [x] Keep "I am not on this list" — verified live: it advances the queue without attributing
      anyone, and whatever the guest types still reaches the payload as a snapshot
- [x] `BookingForm.tsx` drops `matchedGuideId` and consumes `useContactSelection()`; the resets
      it owned (company change, "Not a rep", direct-code clear) moved into the hook
- [x] Pickers per PER_ORDER role where `appliesTo` includes BOOKING. **Guide fields only in the
      detailed variant** (`isEnhanced`); Contact Person in both — per the original brief
- [x] Codes on → no picker at all (decision 6). Falls out of the resolver returning an empty
      `roleChoices`; the hook's queue is then empty and nothing opens
- [x] ⚠️ **Extended `buildBookingPayload()`, not the submit handler** (H3)
- [x] Also closes the Feature 201 known gap: the form now tells "has people" from "has a code",
      so a company with people but no `accessCode` is no longer unreachable
- [x] `BookingFormVisualPanel.tsx` mirrors the form ([[MaintenanceNotes]] #1). Applying that
      note's own test, the new detailed-only section gets **no `FIELDS.form` entry**: its
      heading is the role's own `labelEn`/`labelKa` from `ContactRole`, which is admin-managed
      data like the `MenuItem`/`MasterclassItem` rows, not SiteContent. The panel shows it as an
      illustrative block, the same way it shows a masterclass row

### One addition to the plan, agreed with Max before building

**`app/(site)/page.tsx` also passes `bookingRoles`** — the tenant's PER_ORDER booking roles with
no people attached, from a new `orderRolesFor(tenantId, module)` in `lib/contactResolution.ts`.
The plan budgeted "one line" for that file.

The reason is that `resolveCompanyContacts()` deliberately drops roles nobody is in, so a form
driven only by it cannot render a Guide block until it knows the selected company has guides —
the form's shape would flicker as the dropdown changed, and a company with no guides would offer
nowhere to type one. Driving the blocks off the **role list** and the *people* off the resolver
keeps the layout stable and the data per-company. Chunks 8 and 10 need the same function.

Verified live: Alazani Valley Tours has contact persons and no guides, and still renders the
Guide block — empty, and with no "Choose from list" control, because there is nobody to choose.

### 🔴 A real bug this chunk found by walking the screen, not by reading it

**Switching company left the previous company's contact person in the form's four fields.**

The hook reset its own state — the Guide block cleared correctly — but `firstName`, `lastName`,
`phone` and `email` belong to the form, not the hook, and the dropdown path never cleared them.
Picking "I am not on this list" for the new company would then have submitted a booking for
company B attributed to a person who works at company A.

Pre-existing, not a regression: `applyProfile()` only ever *set* those fields. The direct-code
path already cleared them (`clearDirectCode`); the dropdown path was the one that was missed —
**H3's "reset it everywhere", with exactly one path forgotten, which is what that hurdle
predicts.** Fixed with a `prevCompanyIdRef`, guarded so a guest who types their own details
before choosing a company does not watch them vanish. Re-verified live.

### 🔴 The plan and the handoff are both wrong about what unblocks the admin screens

Both say `components/BookingForm.tsx` is *the* file whose stale imports 500 every route. **There
are two.** `app/(site)/wines/WineCatalogueClient.tsx` imports `verifyCompanyCode` and
`findCompanyByCode`, which Chunk 3 also removed, and Turbopack resolves exports across the whole
graph in the same way.

Measured on a freshly restarted dev server:

| Request order | `/admin/login` |
|---|---|
| straight to `/admin/login` | **200** |
| after `/` | **200** |
| after `/wines` | **500** |

So Chunk 7 *has* unblocked the admin screens — but only until something compiles `/wines`, after
which they stay broken until the dev server is restarted. **Chunk 8 owns that file**, and fixing
its two imports properly means rewiring its call sites to the resolver, which is that chunk's
actual work — not a one-line import swap. Left alone deliberately, per ground rule "do not fix
the build ahead of the chunk that owns each file".

**Practical consequence for the admin click-through:** restart the dev server first, and do not
open `/wines` during it.

### Verified live, in a browser

`Staging Winery` on `localhost:3000`, `person_codes_enabled` off, `enable_enhanced_company_booking` on.

- `/`, `/about`, `/contact`, `/admin/login` all return **200** — the app renders for the first
  time since Chunk 3
- **KnownBugs #57 closed**, with a check built so it can tell the two outcomes apart (H13): the
  homepage carries 5 companies that *do* have access codes, `hasAccessCode` is present in the
  payload, and **none of the 5 codes appears anywhere in the page source**. Before this, all
  five were in plain sight in View Source
- Silk Road Journeys (2 contact persons + 2 guides) → company code → **Contact Person picker
  first** (`sortOrder` 10), then **Guide picker** — two showings, one per role, each labelled
  from the database. Picking filled Mariam Dolidze into the form's own four fields and Tinatin
  Beruashvili into the Guide block
- The picker buttons report accessible names (`button "Keti Dolidze"`), so H14's `aria-label`
  survives the generalisation and Chunk 13 can target them
- "I am not on this list" dismisses without attributing, leaving the fields to be typed
- Switching to an INDIVIDUAL booking removes the Guide block, alongside Food Notes — the brief's
  "only in the details booking option"
- No console errors

### ✅ The admin click-through — done 2026-09-22, Max typed the password

Max signed in himself and handed the session over, which is the arrangement that works: he holds
the credential, Claude drives everything after it. **All four screens rendered for the first
time**, and every claim Chunks 4–6 made without seeing them held.

**Chunk 4 — Settings → Contact Types.** Both built-in roles listed with their Georgian labels and
the plain-words scope copy ("Chosen per booking · Bookings and wine orders" / "· Bookings only").
System roles show `Turn off` and `Edit` and **no delete button at all**, as designed. Creating a
role offers *"Company information — never on a booking form"* — so a COMPANY_LEVEL role really is
creatable, which is what makes Chunk 0's deferral of the CEO role legitimate rather than a quiet
drop. On **edit** the scope control is **absent** (name, Georgian name, order and "Used on"
only), exactly as that chunk claimed.

**Chunk 6 — the one checkbox left open.** The `person_codes_enabled` toggle flipped, persisted to
the database, and survived a full page reload. Its consequence was then verified on the public
form, which is the part that actually matters:

- **Codes ON + company code** → code accepted, **no picker opened, and not one colleague's name
  appears anywhere in the page**. That emptiness is decision 6's privacy feature, confirmed end
  to end rather than inferred from the resolver's tests.
- **Codes ON + a guide's own code** (`SRJGUIDE1`) → resolved straight to Tinatin Beruashvili and
  filled the **Guide block**, leaving the contact-person fields empty for the guest. So the hook
  routes a matched person by role correctly, and no other colleague leaked into the page.

The setting was put back to `false` afterwards and re-checked in the database.

**Chunk 5 — Edit Company.** Silk Road Journeys renders **one section per role**: Contact Person
(Keti Dolidze, Mariam Dolidze) and Guide (Nika Kvaratskhelia, Tinatin Beruashvili), each with
`+ Add Contact Person` / `+ Add Guide` labels built from the role name. No per-person code field,
because person codes are off — H5's trap avoided. The three old company contact inputs are gone.

**Chunk 7 — Content → Messages.** The renamed fields render and the preview shows the real
`ContactPickerPopupView` with both placeholders resolved.

### One small thing fixed during the click-through

The Messages preview hardcoded `SAMPLE_ROLE = 'Guide'`, so on the **Georgian** tab it read
*"…ამ ვიზიტის Guide, რომ…"* — a half-translated line the live form never produces, since the real
picker takes the role name from `ContactRole.labelKa`. An admin reviewing the Georgian would
reasonably have reported it as a translation bug. Made locale-aware; it now reads
*"Beridze LLC — აირჩიეთ ამ ვიზიტის გიდი, რომ მარანმა იცოდეს ვის დაუკავშირდეს."*

**Still not verified:** no booking was submitted, so the `contacts` payload has not been
round-tripped — there is nothing to receive it until Chunk 9 writes `OrderContact` rows.
`/admin/orders` also still 500s, which is Chunk 10's file and expected.

**Resume point:** —

---

## Chunk 8 — Both wine order forms

**Status:** ✅ Done (2026-09-22) · typecheck clean for every file this chunk owns (49 → 43) ·
parity 1103/1103 · RLS 19/19 · resolver 22/22 · **both forms walked in a browser** ·
**Read §4b — this chunk owns forms 2 and 4**

**Public** (`app/(site)/wines/WineCatalogueClient.tsx` + `wines/page.tsx`):

- [x] Consumes `resolveCompanyContacts()` + `ContactPickerPopupView` + `useContactSelection()`
      from Chunks 3 and 7. **No new picker implementation** (decision 10)
- [x] The picker fires at the right moment in *this* flow, confirmed live — see the correction
      below, because this plan was wrong about what that flow is

**Admin manual entry** (`app/admin/(panel)/wine-orders/new/NewWineOrderForm.tsx` + `page.tsx`
+ `createWineOrderAdmin` in `app/actions/wineOrders.ts`):

- [x] **The gap that produced decision 10 is closed** — the autofill from `company.contactName`
      under its *"Mirrors WineCatalogueClient.tsx's applyProfile()"* comment is gone, and
      `CompanyOption` no longer carries `contactName`/`contactPhone`; `page.tsx` stopped
      selecting them. Both forms now call one resolver and one hook
- [x] Renders the choices **inline, not in the popup** — a labelled dropdown per role. Verified
      live on Marani Import GmbH: *"Choose the Contact Person"* with one option
- [x] `createWineOrderAdmin` accepts `contacts`. **Writing the rows is Chunk 9** — the payload
      is carried and deliberately ignored until the chunk that owns the write path

**Both:**

- [x] Multiple role *types* supported; still one person per role per order (decision 9). Only
      `contact_person` applies to wine orders today, since `guide` is BOOKING-only — so the
      generic per-role block renders nothing at present, which is data, not a special case
- [x] `WineOrder.contactName/contactPhone/contactEmail` keep being written, mirroring decision
      4 — the wine form requires them and payment depends on `contactEmail`

### Corrections to this plan, found by opening the files (H1)

**"This path has no company dropdown" was wrong.** `WineCatalogueClient.tsx` has exactly the
same two-variant structure as the booking form: a company `<select>` *and* a
`hideCompanyDropdown` direct-code variant. Both were rewired.

**It also has its own hand-rolled access-code popup**, inline, rather than using
`AccessCodePopupView` like the booking form does — more of the H4/§22 duplication this rework
exists to reduce. **Left alone deliberately:** consolidating it is a separate job from this
chunk's, and doing it here would have meant rewriting a working popup while rewiring the
resolver underneath it.

### Two additions to `useContactSelection()`, both driven by the admin form

The hook was written in Chunk 7 against the popup flow. The inline flow needed two things, and
both are genuinely shared rather than admin-specific — Chunk 10 will want them too:

- **`resolve()` now returns `roleChoices` as well as storing them.** The stored copy is state
  and is not readable from the closure that just awaited the call, so a caller acting on the
  result immediately would otherwise have to reach for a ref.
- **`pickFor(person, role)` and `clearRole(roleId)`** — select for a named role with no popup in
  between, which is what a dropdown's `onChange` needs.

**One deliberate asymmetry between the two forms.** The admin form **auto-selects a role that
has exactly one person**; the public forms do not. That is not an oversight: on a public form
the whole point is the customer *declaring* who they are, and pre-filling the only person on
file would assert something that may be false — a different colleague could be ordering, which
is exactly what "I am not on this list" exists for. An admin recording an order on a company's
behalf is in the opposite position, and the old code auto-filled `company.contactName`
unconditionally, so auto-selecting the single contact preserves the workflow they already had.

### 🔴 A real bug, found by looking at the screen

**The picker rendered behind the checkout drawer.** `ContactPickerPopupView` hard-coded `z-50`,
which is fine on the booking form — it has no competing layer — but the wine catalogue's
checkout drawer is *also* `z-50`, and the picker is opened from inside it. The popup was
visible at the edge and completely unreachable. That page's own access-code popup already used
`z-[60]` for precisely this reason.

Fixed with an `overlayZClass` prop rather than by raising the component globally: what else is
on the page is the caller's knowledge, not the component's.

**And a second, sharper lesson underneath it.** The first fix used `z-[70]` — a fresh arbitrary
Tailwind value that **was not in the generated CSS**, so it computed to `zIndex: auto` and the
picker stayed behind the drawer with no error anywhere. Caught only by reading the computed
style off the live element rather than trusting that the class had applied. The working fix
reuses `z-[60]`, a class already proven to exist on that page. **A Tailwind arbitrary value
that has never been used before is not guaranteed to exist at runtime; check the computed
value, not the class name.**

### Verified live, in a browser

- **Public wine form** — Sighnaghi Wine Bar (code `SIGHNAGHI44`, 10% discount, one contact
  person): code accepted → the discount applied (15₾ → 13.50₾) → company facts filled (business
  name, LLC name, LLC id `412008551`, address) → the contact picker opened **above** the drawer
  → picking Tamar Gogoladze filled name, phone and email. The hidden `contacts` field carried
  `[{roleId, personId, name, phone, email}]`, ready for Chunk 9
- **Admin wine form** — Marani Import GmbH (20% discount): company facts filled, the discount
  note rendered, and the inline *"Choose the Contact Person"* dropdown appeared **pre-selected**
  with Katrin Vogel, her phone and email filled
- `/`, `/wines`, `/about`, `/contact`, `/admin/login` all **200**, and — the point of this
  chunk for everything else — **`/wines` no longer poisons `/admin/login`.** The whole app now
  renders
- Server log shows `resolveCompanyContacts` called with `module: 'WINE_ORDER'` from both forms

**Not verified:** no wine order was submitted, so the `contacts` payload has not been
round-tripped — there is nothing to receive it until Chunk 9.

**Resume point:** —

---

## Chunk 9 — Write path

**Status:** ⬜ Not started · **Read F2**

- [ ] `createBooking.ts` writes an `OrderContact` row per picked role **with snapshots**, and
      re-verifies each person belongs to `data.companyId` under the tenant before trusting a
      client-sent id — the existing `verifiedGuideId` pattern, generalised
- [ ] **Set `tenantId` on every row** — see the Chunk 3 note; a NULL makes it invisible
- [ ] Contact Person **also** writes `Order.name/surname/phone/email` (decision 4). **This is
      the one special case in the whole design — comment it here and nowhere else**
- [ ] Same for the wine order creation path
- [ ] `updateOrderEnhanced()` / `assignOrderCompany()` in `orders.ts`: the old plan left these
      alone because there was no code step for an admin to hook into. With pickers in the admin
      (Chunk 10) that reasoning no longer holds — **re-decide, don't inherit**

**Resume point:** —

---

## Chunk 10 — Admin order surfaces

**Status:** ⬜ Not started · **This is where F1 gets paid off. Read F4, H1, H10.**

- [ ] `OrderDetail.tsx` shows the order's contacts, by role
- [ ] `BookingSheetPrint.tsx` prints the **Guide's** name and phone as its own labelled row,
      rather than relying on autofill having copied it into the guest field.
      ⚠️ **H1 applies:** the old plan's assumption about this file was wrong. Open it first
- [ ] `OrdersTable.tsx` / `columnDefs.ts` — decide whether a guide column is wanted
- [ ] `orders/new/NewOrderForm.tsx` (form 3 of §4b) gains per-role pickers, **consuming the
      Chunk 7 shared pieces** — inline, not the popup, same as Chunk 8's admin form. It picks a
      company today and has no contact picker at all, a gap under the one-of-each-per-order rule
- [ ] **Narrow `orders/page.tsx:289`'s projection** so people's codes stop reaching the client
      (F4)
- [ ] Any new order query spreads `NOT_ABANDONED` (H10)

**Resume point:** —

---

## Chunk 11 — Emails

**Status:** ⬜ Not started · **Read H1**

- [ ] `invoiceRecipientOptions()` in `OrdersTable.tsx` reads people in billing-capable roles
      instead of `company.representatives`
- [ ] `sendOrderInvoice()`'s server-side re-validation of a client-sent recipient follows
- [ ] No DB calls inside `lib/emails/templates/*` — [[MaintenanceNotes]] #23
- [ ] Any new email goes through `sendTenantEmail()`, never Resend directly — #11
- [ ] ⚠️ This is the file whose behaviour the old plan got wrong **twice** (H1). Read it first

**Resume point:** —

---

## Chunk 12 — Seed, onboarding, fixtures

**Status:** ⬜ Not started · **Read H13, H16**

- [ ] `lib/demoSeed.ts`: `PersonSpec` gains a role; **lift the "guides on only one company"
      restriction** — it exists solely because guides used to retire a company's access code
      (H5), which this plan removes. Update the warning comment on `BookingCompanySpec.guides`
- [ ] **Give every seeded role a visibly distinct person** (H13)
- [ ] Re-run the money plausibility audit after touching the seed (H16)
- [ ] `scripts/backfill-test-fixtures.ts` updated to the new tables — it gained
      reconcile-existing behaviour in Feature 201 precisely because create-or-skip could never
      reach an already-seeded tenant
- [ ] `actions/onboarding.ts`, `app/admin/onboarding/page.tsx` **and** `steps/CompaniesStep.tsx`
      — the wizard still does not prompt for people, consistent with price tiers being a
      Companies-page concern, but all three currently select the dropped columns.
      `app/admin/onboarding/page.tsx` was the second gap found on 2026-09-22 (5 errors); it had
      been omitted from this list

**Resume point:** —

---

## Chunk 13 — Tests

**Status:** ⬜ Not started · **Read H11, H12, H14**

- [ ] Replace `company-guide-code.spec.ts` + `guide-picker.spec.ts` with role-driven coverage:
      picker with codes off, code path with codes on, **picker suppressed with codes on**,
      "not on this list", wrong code
- [ ] **The one this design most needs:** delete a person who is on a past order, assert the
      order still shows their name from the snapshot (F2). Nothing else proves the orphan fix
- [ ] Assert on the picker buttons' `aria-label` so H14 cannot regress silently
- [ ] Check `booking-enhanced.spec.ts`, `payment-label-precedence.spec.ts`,
      `payment-amount-integrity.spec.ts`, `tests/helpers/payments.ts`,
      `tests/helpers/bookingForm.ts`
- [ ] Use the index-matching approach for the company edit panel, not `payments.ts`'s xpath
      helper (H11)
- [ ] Run each new spec **twice** and confirm no leftover rows — writing a spec is not the same
      as it passing
- [ ] If a run hangs at login, check `curl -D - http://localhost:3000/admin/login` first (H12)

**Resume point:** —

---

## Chunk 14 — Close-out

**Status:** ⬜ Not started

- [ ] `SessionLog.md`, `FeatureLog.md`, `Roadmap.md` per Rules 1 and 4
- [ ] `Features/Feature NNN - Contact Roles.md` per Rule 9
- [ ] **Rewrite [[MaintenanceNotes]] #26** — the two-places-resolve-codes coupling is gone. The
      new couplings to document: the `Order.name/surname` mirror (decision 4), the snapshot rule
      that makes person deletion safe, and **H18** (`setup-rls.ts`'s two lists)
- [ ] `RLS-Architecture.md` table list extended; guides/reps rows removed (deferred from Chunk 2)
- [ ] Mark [[Plan-CompanyGuidesAndReps]] superseded; close [[KnownBugs]] #55, #56, #57
- [ ] Retire `Features/Feature 185` and `Feature 201` as history
- [ ] Optional, and Max often asks for it: a **blind second opinion** on the finished diff — a
      context-free subagent review with the vault fenced off, so it cannot read these
      conclusions back to us
- [ ] Verify on `staging`, then get Max's go-ahead for the `staging` → `master` merge (Rule 0)

**Resume point:** —
