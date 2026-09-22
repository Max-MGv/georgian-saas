---
tags: [handoff, contacts]
---

# Handoff — Contact Roles, chunk 7 onward

**Written 2026-09-22.** Paste the block below into a fresh Claude session with no prior context.
Everything above the block is for Max; everything inside it is the prompt.

---

## The prompt — copy from here down

> You are picking up a half-finished feature on a multi-tenant winery SaaS. Read this whole
> message, then read the vault files it names, then start work. Do not write code before reading
> them — the plan contains decisions that will look wrong until you see the reasoning.
>
> ### Where things are
>
> Repo root: `C:\Users\Max\Desktop\claude-projects\georgian-saas`
> App: `saas/` (Next.js **16.2.6**, React 19.2, Prisma 6, Supabase Postgres)
> Branch: **`staging`**, HEAD **`f9a8b73`** — everything committed and pushed, working tree clean.
>
> ### Read these first, in this order
>
> 1. `vault/ClaudeInstructions.md` — how to behave on this project. Rules 0, 8 and 10 matter most.
> 2. `vault/Plan-ContactRoles.md` — **the live task tracker.** In particular:
>    - **§1** is Max's original brief, verbatim. If an implementation decision seems to conflict
>      with it, §1 wins and the plan is wrong.
>    - **§2** decisions (ten of them) — settled, do not re-open without Max.
>    - **§4b** — four forms, one implementation. This is decision 10 and it governs chunks 7–10.
>    - **§5** — the four findings (F1–F4). F3 is a live security bug.
>    - **§6** — eighteen hurdles (H1–H18), each one something this project actually got wrong.
>      Read the ones each chunk header names before starting that chunk.
>    - **§7** — the chunk table and the resume point.
> 3. `vault/SessionLog.md` — the top entry (2026-09-22) is the state on exit.
> 4. `vault/MaintenanceNotes.md` — coupled components. #1, #9, #10, #22, #23, #24, #26, #27, #28
>    are the ones this feature touches.
> 5. `vault/KnownBugs.md` — **#56** (fixed on dev, not production) and **#57** (open, live on
>    `master`).
>
> ### What has been built — chunks 0–6 of 14
>
> Three contact concepts became one role-driven model:
>
> ```
> Company.contactName/contactPhone/contactEmail  ─┐
> CompanyGuide                                    ├─→ ContactRole + CompanyPerson
> CompanyRepresentative                          ─┘
> Order.guideId                                   ──→ OrderContact (with detail snapshots)
> ```
>
> - **Chunk 1** — migration `20260922101500_contact_roles`, hand-written, **applied to the dev
>   database only**. Production still has the old tables.
> - **Chunk 2** — three RLS policies + `saas/scripts/test-contact-roles-rls.ts` (19 assertions).
> - **Chunk 3** — `lib/contactResolution.ts` holds `resolveCompanyContactsFor()`, which replaced
>   four overlapping functions. `app/actions/companyPeople.ts` replaced `companyGuides.ts` (ten
>   functions became five). New `app/actions/contactRoles.ts`.
>   `saas/scripts/test-contact-resolution.ts` (22 assertions).
> - **Chunks 4–6** — the Contact types admin panel, the `person_codes_enabled` toggle, and the
>   Edit Company people list (two hardcoded sections became one rendered per role).
>
> ### ⚠️ Read this before you try to run anything
>
> **The app does not compile, and no page renders at all.** 54 TypeScript errors, every one in a
> file owned by chunks 7–12. `components/BookingForm.tsx` still imports three symbols chunk 3
> deleted, and Turbopack resolves exports across the whole module graph, so that single file
> **500s every route — including `/admin/login`**. Nothing is openable in a browser until you
> fix it, which is chunk 7's first job.
>
> **Do not "fix the build" ahead of the chunk that owns each file.** The error count going down
> is not the goal; the chunks are sequenced so that each file is rewritten once, by the chunk
> that understands it.
>
> **Chunks 4, 5 and 6 have never been rendered.** They typecheck, their data shapes were verified
> against the real dev database, and their tests pass — but no screen has been looked at. Walk
> all three once chunk 7 makes the app run. Note also that opening an admin screen needs an admin
> login, and **typing a password into a form is off-limits for you** — either Max does that
> click-through, or the chunk 13 Playwright specs do it with their own credentials. Say so
> plainly rather than claiming a screen works.
>
> ### Your next task — chunk 7
>
> `vault/Plan-ContactRoles.md` → "Chunk 7 — Shared picker + public booking form". It builds the
> two shared client pieces that chunks 8 and 10 then consume, so resist making anything in them
> booking-specific. Its first checkbox is the fix for **KnownBugs #57**, a live leak on
> production: `app/(site)/page.tsx` currently ships every company's access code to the browser
> because it passes whole `Company` rows into a client component. Send `hasAccessCode: boolean`
> instead — one line, same on `app/(site)/wines/page.tsx`.
>
> Follow the plan's chunk order. Update the plan's checkboxes and Status lines as you go, and
> record anything you find that contradicts the plan **in the plan** — its own §6 H1 says the
> file list is a starting point, not a fact, because the previous version of this plan was
> confidently wrong in four places.
>
> ### Rules that will bite you if you skip them
>
> - **Rule 0** — `master` is production. Everything goes to `staging` first and is verified there.
>   Schema changes: `prisma migrate dev` against **dev**, then `migrate deploy` to production as
>   its own deliberate step, only with Max's go-ahead. **Never push to `master` without asking.**
> - **Rule 8** — state the plan for a chunk and get a go-ahead before editing. Max often says
>   "continue", which counts.
> - **Rule 10** — stop the dev server before any `prisma migrate dev` / `generate`, or on Windows
>   the client silently fails to regenerate and the pool exhausts.
> - **H6 / MaintenanceNotes #10** — a green `check-rls.ts` proves nothing; it only checks a policy
>   exists. New tenanted tables need a real two-tenant test.
> - **H18** — `setup-rls.ts` has *two* table lists. A table in `writableTables` but not
>   `tenantedTables` gets RLS enabled with no policy, which makes Postgres deny every row
>   silently while every check still reports green.
> - **H3 / MaintenanceNotes #1** — `buildBookingPayload()` in `BookingForm.tsx` is the only place
>   a booking field may be added. A field added outside it is silently dropped by the "New
>   Company?" submit path. This has already happened once.
> - **MaintenanceNotes #24** — a `'use server'` file may only export async functions; not even a
>   type re-export survives. That is why the resolver's types live in `lib/contactResolution.ts`.
> - **`saas/AGENTS.md`** — this is Next.js 16.2, not the Next.js you remember. Read the relevant
>   guide in `saas/node_modules/next/dist/docs/` before writing component or routing code.
> - When scripting edits to a vault file, **write to a temp file and swap after a size check**.
>   A script that opened a plan for writing and then threw mid-way truncated it to zero once.
>
> ### Verifying your work
>
> ```bash
> cd saas
> npx tsc --noEmit                                   # expect only later chunks' files
> npx tsx scripts/check-i18n-parity.ts               # must stay at parity, EN + KA
> npx tsx scripts/test-contact-roles-rls.ts          # 19/19
> npx tsx scripts/test-contact-resolution.ts         # 22/22
> ```
>
> If `tsc` suddenly reports errors only in `.next/dev/types/*`, that generated file is corrupt
> (a dev server killed mid-write). `rm -rf saas/.next/dev` and re-run — syntax errors there make
> tsc bail out of semantic checking and hide every real error.
>
> Max is non-technical. Explain errors in plain language — what caused it and what the fix does,
> two or three sentences — alongside the fix, not instead of it.

## End of prompt

---

## Notes for Max, not part of the prompt

- The four commits are `9516d94`, `6e81f1c`, `b5862b2`, `f9a8b73`, all on `staging`.
- Nothing has reached production. When chunk 14 asks for the `staging` → `master` merge, that is
  the step that also needs `prisma migrate deploy` against the production database.
- Two things are waiting on you personally: the admin click-through once chunk 7 lands, and a
  tidy-up of the duplicate `contact_person` rows the migration created for companies whose old
  contact was also a representative (visible in the Edit Company panel; nothing is lost).
