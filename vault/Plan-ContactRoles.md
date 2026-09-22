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
| **3** | Server actions — roles, people, code resolution | ⬜ Not started |
| **4** | Admin — Contact Roles management screen | ⬜ Not started |
| **5** | Admin — Edit Company people list, role-driven | ⬜ Not started |
| **6** | Settings — `company_access_codes_enabled` | ⬜ Not started |
| **7** | Booking form — per-role pickers | ⬜ Not started |
| **8** | Wine order form — per-role pickers | ⬜ Not started |
| **9** | Write path — `OrderContact` rows + snapshots | ⬜ Not started |
| **10** | Admin order surfaces — finally display contacts | ⬜ Not started |
| **11** | Emails — invoice recipient from roles | ⬜ Not started |
| **12** | Demo seed, onboarding, test fixtures | ⬜ Not started |
| **13** | Tests | ⬜ Not started |
| **14** | Vault + close-out | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Chunks 0–2 done (2026-09-22). **Chunk 3 next — server actions.**

⚠️ **The tree does not compile right now, and that is expected.** The migration is applied to the
dev DB, so `CompanyGuide`, `CompanyRepresentative`, `Order.guideId` and
`Company.contactName/Phone/Email` no longer exist while ~10 files still reference them —
**131 TypeScript errors**, concentrated in `app/actions/companies.ts` (31),
`app/actions/companyGuides.ts` (18), `app/admin/**` (20), `app/actions/orders.ts` (9),
`scripts/backfill-test-fixtures.ts` (8), `app/actions/onboarding.ts` (5), `lib/demoSeed.ts` (4),
`app/actions/createBooking.ts` (3). Chunks 3–12 are what close them. Do not try to "fix the
build" ahead of the chunk that owns each file.

⚠️ **`staging.vineworks.ge` reads the dev database and is therefore broken** until Chunks 3–7
land — the deployed code still selects dropped columns. Expected and recoverable, but worth
knowing before demoing anything from staging.

**Nothing has been committed.** The Feature 201 working tree from 2026-09-19 is still
uncommitted underneath this work.

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

**Status:** ⬜ Not started · **Read H4, H9. This chunk starts closing the 131 errors.**

- [ ] New `app/actions/contactRoles.ts` — role CRUD; deleting an `isSystem` role refused
- [ ] Replace `app/actions/companyGuides.ts` with `app/actions/companyPeople.ts` — **ten
      near-identical functions collapse to five generic ones.** That duplication is the clearest
      evidence the old design didn't scale per type
- [ ] `companies.ts`: `codeExistsInTenant` drops from three sources to two
- [ ] **Collapse `verifyBookingCode` + `findBookingCodeByCode` + `verifyCompanyCode` +
      `findCompanyByCode` into one resolver** returning `{ company, matchedPerson?, roleChoices }`.
      This is the permanent fix for H4 — four functions with overlapping jobs is how they drifted
- [ ] Resolver respects `company_access_codes_enabled`: off → no code check, return pickable
      people; on → code required, return the matched person only, **never the choice list**
- [ ] `withTenantDb` + re-verify the parent company's `tenantId`, per `prices.ts`
- [ ] **Every `OrderContact` write must set `tenantId`** — it is nullable, and a NULL makes the
      row invisible to its own tenant under the Chunk 2 policy
- [ ] `npx tsc --noEmit` clean for `app/actions/**` (admin and form files stay broken until
      their own chunks)

**Resume point:** —

---

## Chunk 4 — Admin: Contact Roles screen

**Status:** ⬜ Not started · **Read ground rule 9**

- [ ] New screen (likely under Settings) listing roles: label EN/KA, scope, appliesTo, sort
      order, active
- [ ] Add / edit / deactivate; system roles renameable, not deletable
- [ ] **Must allow creating a COMPANY_LEVEL role** — Chunk 0 deferred building one, not the
      ability to make one
- [ ] `HelpHint` copy explaining PER_ORDER vs COMPANY_LEVEL in plain language — **the one
      concept an admin must understand.** Max's own framing is the best available copy: *"this
      is true for this company always"* vs *"this contact person type is for per order picker"*

**Resume point:** —

---

## Chunk 5 — Admin: Edit Company

**Status:** ⬜ Not started

- [ ] `CompaniesClient.tsx`: `GuidesSection` + `RepresentativesSection` (two near-identical
      ~150-line components) become **one** section rendered per active role
- [ ] Keep `PersonCodeField` (show/copy/regenerate) but render it **only when
      `company_access_codes_enabled` is on** — a live-looking control for a disabled feature is
      the H5 trap in miniature
- [ ] `companies/page.tsx`: include people + roles; **project only the fields the client needs**
      (H17)
- [ ] The three old company contact inputs come out — they are `CompanyPerson` rows now
- [ ] `companies.people.*` keys in `adminT.ts` generalised; role names come from the DB

**Resume point:** —

---

## Chunk 6 — Settings

**Status:** ⬜ Not started · **Read H7, H17**

- [ ] `company_access_codes_enabled: 'false'` in `lib/settings.ts` `SETTING_DEFAULTS`
- [ ] Toggle in `SettingsClient.tsx` + `settings/page.tsx`, copying
      `enable_enhanced_company_booking`'s wiring exactly
- [ ] **Keep it in `Setting`, not on `Tenant`** — H7 explains what that costs
- [ ] Help text stating the trade-off plainly: on = codes prove identity but colleagues stay
      private; off = one-click autofill but everyone sees the list

**Resume point:** —

---

## Chunk 7 — Booking form

**Status:** ⬜ Not started · **Read F3, H3, H13, H14, ground rule 9. Folds in Feature 201.**

- [ ] **Fix F3 first:** `app/(site)/page.tsx` sends `hasAccessCode: boolean`, never the code.
      Same on `wines/page.tsx`. One line each, closes a live leak ([[KnownBugs]] #57)
- [ ] Generalise `GuidePickerPopupView.tsx` → `ContactPickerPopupView.tsx`, role-driven. **Keep
      its `aria-label`** (H14)
- [ ] Keep "I am not on this list" — a person not yet added to the panel is otherwise stranded
      holding a valid code
- [ ] `matchedGuideId` → a `Record<roleId, personId>` map; reset it everywhere the single value
      is reset today (company change, "Not a rep", direct-code clear)
- [ ] Pickers per PER_ORDER role where `appliesTo` includes BOOKING. **Guide fields only in the
      detailed variant** (`isEnhanced`); Contact Person in both — per the original brief
- [ ] Codes on → no picker at all (decision 6)
- [ ] ⚠️ **Extend `buildBookingPayload()`, not the submit handler** (H3)
- [ ] Also closes the Feature 201 known gap: the form can now tell "has people" from "has a
      code", so a company with people but no `accessCode` stops being unreachable
- [ ] `BookingFormVisualPanel.tsx` mirrors the form ([[MaintenanceNotes]] #1) — decide whether a
      new detailed-only section needs a `FIELDS.form` entry, using that note's own test

**Resume point:** —

---

## Chunk 8 — Wine order form

**Status:** ⬜ Not started

- [ ] `WineCatalogueClient.tsx` gets the same resolver and the same picker component
- [ ] Multiple role *types* supported; still one person per role per order (decision 9)
- [ ] `WineOrder.contactName/contactPhone/contactEmail` keep being written, mirroring decision
      4's approach — the wine form requires them and payment depends on `contactEmail`
- [ ] This path has no company dropdown — confirm the picker appears at the right moment in
      *that* flow, not the booking one's

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
- [ ] `orders/new/NewOrderForm.tsx` gains per-role pickers. It picks a company today and has no
      contact picker at all — a gap under the one-of-each-per-order rule
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
- [ ] `onboarding.ts` / `CompaniesStep.tsx`: the wizard still does not prompt for people,
      consistent with price tiers being a Companies-page concern

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
