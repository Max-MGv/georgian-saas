---
tags: [meta, claude]
---

# Claude Working Instructions

Rules for how Claude should behave on this project. Read at the start of every session.

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

## 7. Handoff preparation

When Max says "prepare for handoff," update:
1. `vault/SessionLog.md` — full detail of what was done, pending user tests, what's next
2. `vault/FeatureLog.md` — all statuses current
3. `vault/Roadmap.md` — all checkboxes current

These vault files are the handoff. No separate handoff doc needed.
