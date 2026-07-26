---
tags: [meta, claude]
---

# Claude Working Instructions

Rules for how Claude should behave on this project. Read at the start of every session.

---

## 0. GIT WORKFLOW — STAGING FIRST, MASTER AFTER (strict, since #79, 2026-07-23)

**`master` is production.** It deploys straight to `nikalasmarani.vercel.app` — the real site, with Nikalas Marani's real customer bookings. Nothing goes there without being checked first.

**The rule, no exceptions:**
1. Every code change is committed and pushed to the **`staging`** branch first — never push a change directly to `master`.
2. `staging` auto-deploys to a preview URL (`georgian-saas-git-staging-...vercel.app`) that reads from the **dev** Supabase database, not the real one. Verify the change there.
3. Only merge `staging` → `master` (and push) once Max has confirmed the staging check is good. This merge is the one action that actually ships to real customers — treat it with the same care as any other risky/hard-to-reverse action per the standing safety rules.

**Database schema changes follow the same shape:** run `prisma migrate dev` against the **dev** database first (never `prisma db push` — see Rule 10), verify on staging, and only then run `prisma migrate deploy` against **production** as its own deliberate, separate step.

**Local development always points at the dev database** (`saas/.env`) — never at production credentials. This is what makes "break things locally" safe.

**Practical guardrails:**
- Check the current branch (`git branch --show-current`) before committing if there's any doubt — never assume.
- After merging `staging` → `master` and pushing, switch back to `staging` for the next round of work, so the next commit doesn't land on `master` by accident.
- Never force-push either branch.

Full reference, environment map, and the exact commands: `vault/Plan-DevProdEnvironments.md`.

---

## 1. Always update the vault

After any meaningful work (feature built, decision made, architecture changed), update the relevant vault file:
- `SessionLog.md` — log what was done, what's next
- `FeatureLog.md` — update status, Claude tested, user tested columns
- `Roadmap.md` — tick off completed items
- `KnownBugs.md` — add new bugs, mark resolved ones

The vault is the source of truth. Claude memory files are pointers only.

---

## 2. Explain errors when fixing them

When the user pastes an error, always explain in plain language **before or alongside the fix**:
- What caused the error (root reason, not just the symptom)
- What the fix does and why it works

Keep it to 2–3 sentences max. Max is non-technical and wants to understand, not just have things silently fixed.

---

## 3. Dashboard panel description style

When writing content for Architecture.md nodes or roadmap panels in the React Flow dashboard, use this format:
- What this thing does (1–2 sentences, no jargon)
- What to watch for if it breaks
- How to verify it's working

---

## 4. Feature tracking

After every feature or meaningful change, update `vault/FeatureLog.md`.

Columns: Feature | Area | Status | Claude tested | User tested

Status values: ✅ Done / 🚧 In progress / ❌ Broken
Tested values: ✅ Yes / ❌ No

Update a row when:
- Feature is started → Status: 🚧
- Feature is finished → Status: ✅, Claude tested: ✅
- Max confirms it works → User tested: ✅

This is part of the definition of "done." Never skip it.

---

## 5. Always use full absolute paths

When referencing files (in chat, in code, anywhere), always use the full Windows absolute path — never relative paths. They don't resolve correctly in Claude Code.

Base path: `C:\Users\Max\Desktop\claude-projects\georgian-saas\`

Examples:
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\app\admin\orders\page.tsx`
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\Roadmap.md`

---

## 6. Read MaintenanceNotes before non-trivial changes

Before making any non-trivial change to the booking form, admin site-content editor, or public-site layout — read `vault/MaintenanceNotes.md`. It lists structural dependencies between components that must be kept in sync. Skipping this risks silent breakage in coupled files.

---

## 8. Confirm before editing

Before making any code or file changes, state the plan clearly and wait for Max to confirm. Do not start editing immediately after proposing an approach — "yes" or explicit approval is required first.

Exceptions (no confirmation needed):
- Max explicitly says to go ahead (e.g. "do it", "yes", "go")
- The change is a direct follow-on to something already approved in the same turn (e.g. fixing a typo spotted during an approved edit)

---

## 9. Feature notes for complex features

When a feature (or any process) is complex enough that its design is non-trivial, create a dedicated note for it in `vault/features/`. Name the file `Feature NNN - Feature Name.md` (or `Feature NNN-NNN - Feature Name.md` for features built together).

A feature note should cover:
- What the feature does (user-facing description)
- Key design decisions (why this approach was chosen)
- Files touched and what changed in each
- Edge cases handled
- What to test

Link the note from `FeatureLog.md` in the feature's row.

**When to create a note:** when the feature touches 3+ files, involves new server actions, has non-obvious state logic, or is likely to be referenced when building related features in the future.

Simple one-file changes (e.g. a label swap) do not need a note.

---

## 10. Stop dev server before `prisma db push` / `prisma migrate dev`

On Windows, running `prisma db push`, `prisma migrate dev`, (or `prisma generate`) while the dev server is running will fail silently — schema pushes but the Prisma client is NOT regenerated (EPERM on the DLL rename). This leaves the client broken and causes connection pool exhaustion.

> **Since #79 (2026-07-23): schema changes use `prisma migrate dev` (against the dev DB) instead of `db push` — see `Plan-DevProdEnvironments.md` for the full dev→staging→prod workflow. This rule applies identically.**

**Before any `prisma db push` / `prisma migrate dev`:**
1. Tell Max to stop the dev server, OR kill the node process yourself
2. Run `prisma db push`
3. Verify output ends with `✔ Generated Prisma Client`
4. Tell Max to restart the dev server

See `vault/MaintenanceNotes.md` section 3 for the full explanation.

---

## 7. Handoff preparation

When Max says "prepare for handoff," update:
1. `vault/SessionLog.md` — full detail of what was done, pending user tests, what's next
2. `vault/FeatureLog.md` — all statuses current
3. `vault/Roadmap.md` — all checkboxes current

These vault files are the handoff. No separate handoff doc needed.
