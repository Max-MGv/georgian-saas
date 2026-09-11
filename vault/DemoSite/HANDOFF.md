---
tags: [handoff, demo, vineworks]
---

# Handoff — Chunk 2 of the demo flow fixes

**How to use this:** copy the block below into a fresh Claude Code session. It is written to
be self-contained — a session with no memory of Chunk 1 can start work from it.

**Supersedes** the Chunk 1 handoff (Chunk 1 is ✅, shipped `9959711`, verified on production
2026-09-11). Written 2026-09-11.

**The shape works for every chunk.** To produce the prompt for Chunk N, swap the task line,
replace the "what you don't need to re-derive" section with that chunk's recorded findings,
and re-check the ship route in the plan's status table — it differs per chunk and is not a
guess.

**⚠️ The one thing that changed between Chunk 1 and Chunk 2:** Chunk 1 was demo-only and went
straight to `master`. **Chunk 2 is a shared file and needs the `staging` pass.** That is the
single biggest difference and the prompt below leads with it.

---

## The prompt

```
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). Continue the public
sales demo fixes at demo.vineworks.ge. Chunk 1 is done and shipped; you are starting Chunk 2.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git) and Rule 8 (confirm before editing) both
   apply. Rule 0 matters much more this time than it did for Chunk 1 — see ship route below.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md
   — THE TASK TRACKER. Read the status table, the ground rules, "Decisions already made",
   then Chunk 1's "Notes / decisions" section IN FULL, and then Chunk 2 in full. Chunk 1's
   notes are not history — they contain the finding that Chunk 2's premise was built on.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §4
   — the localhost / DEFAULT_TENANT_ID trap. You WILL hit this, because task 2.1 requires
   working locally in dev mode.

YOUR TASK: Chunk 2 only — "The hydration mismatch (React #418)".
Max has approved Chunk 2 specifically. Implement it, then STOP and report back. Do not start
Chunk 3; chunks are strictly sequential by Max's instruction.

THE SHIP ROUTE IS DIFFERENT THIS TIME — READ THIS TWICE:
Chunk 1 touched demo-only files, so it went straight to master. CHUNK 2 DOES NOT. The
offending code is shared — the bug is confirmed on Staging Winery, so it lives in a file every
tenant renders. That means the full staging pass from ClaudeInstructions Rule 0:
  push to `staging` → verify on the staging preview URL (reads the DEV database) → only merge
  staging → master after Max confirms.
Do not merge to master on your own judgement. There is only ONE deployment: demo.vineworks.ge
and nikalasmarani.vercel.app are the same code and the same production database, distinguished
only by which tenant the domain resolves to. Pushing to master ships to Nikalas Marani's real
site with his real customer bookings at the same instant it ships to the demo.

WHAT YOU DON'T NEED TO RE-DERIVE (all already measured and written down):
- The error is React #418, minified, with arguments `args[]=text`. So it is a TEXT NODE
  mismatch — not an attribute and not a structural one. That narrowing is already done.
- It fires on EVERY route checked: /, /wines, /admin/orders, /admin/statistics, /live.
- It is NOT demo-specific. Confirmed on Staging Winery, where no demo component renders at
  all. It affects real tenants.
- Prime suspects: values formatted at render time from `new Date()` or a locale-dependent
  formatter, where the server (UTC, region fra1) and the browser disagree. This app renders
  dates, times and ₾ amounts on every screen.
- **It is NOT the cause of the live mirror's landing-moment bug.** Chunk 1 measured that and
  disproved it. The mirror was marking a `display:none` copy of the orders list; the admin
  pane is a 691px iframe, below Tailwind's 768px `md` breakpoint, so /admin/orders was showing
  its card list while the code marked its hidden table. The fixed highlight now holds for its
  full 20s window on production WHILE #418 is still firing on that same page. Do not re-open
  this. It is written up in Chunk 1's "Notes / decisions".

RULES THAT ACTUALLY BITE ON THIS CHUNK:
- Task 2.1 is not optional and it is not a formality: REPRODUCE LOCALLY IN DEV MODE, where
  React prints the exact mismatching text side by side. Chasing this in production is what
  made it cost three sessions already. Production has only the minified error.
- Task 2.2 is the actual deliverable: NAME the offending text node. Three sessions have failed
  to name it. A fix without a named node is a guess, and this plan has already been burned once
  by a plausible guess that measurement falsified.
- Regression-check Staging Winery (cmrxb85wo0000vlc0d964nzf8) before shipping, per ground rule
  2 — this is a shared file, so a real tenant is the check.
- Task 2.4's "re-check that Chunk 1's outline survives" is now a REGRESSION check, not a hope.
  The outline already works. Confirm your fix didn't break it.
- Verify against PRODUCTION timings after deploy, not dev. Dev passing is not evidence — four
  separate bugs in the previous plan came from assuming a render had finished.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10). Unlikely to come
  up here, but it fails silently when it does.

WHEN YOU FINISH:
1. Tick the boxes in Plan-DemoFlowFixes.md, set Chunk 2's Status to Done, rewrite its Resume
   point and the Overall resume point.
2. Record the offending text node in Chunk 2's "Notes / decisions" — this is the thing three
   sessions have failed to name, so it must be written down even if the fix is one line.
3. Update SessionLog.md, FeatureLog.md and KnownBugs.md per ClaudeInstructions Rule 1. For
   KnownBugs, task 2.5 is explicit: close the "Hydration mismatch on public site pages"
   section properly, not just a status flip. Note that section already carries a 2026-09-11
   correction from Chunk 1 — keep it, it records why this bug was mis-prioritised.
4. Report to Max, then wait for approval before Chunk 3.

DON'T:
- Don't push to master yourself. Staging first, then Max confirms.
- Don't redesign the demo chrome palette — decided ("cellar dark"), it belongs to Chunk 5.
- Don't fix the tour, the feature rail, or the duplicate bug-report button. Chunks 3, 4 and 6.
- Don't touch the mobile layout. Desktop-first is a recorded decision.
- Don't re-open decisions in the plan's "Decisions already made" section. The one exception is
  flagged in that section itself: the note on the hydration bug's PRIORITY was a bet on what
  Chunk 1 would find, and Chunk 1 found otherwise. Max has since confirmed Chunk 2 keeps its
  slot, so just do the work.

HOUSEKEEPING, IF STILL PRESENT:
Chunk 1's verification left a real test booking in the live demo data — "Luka Testashvili",
4 guests, 20 Oct 2026. The 03:00 UTC nightly reseed should have cleared it. If it is still
there, ask Max whether to delete it rather than deleting it yourself; it is a production write.
```
