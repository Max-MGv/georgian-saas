---
tags: [handoff, demo, vineworks]
---

# Handoff prompt — demo site redesign

Copy the block below into a new Claude session to continue this work. It is written to be
read cold, with no memory of the session that produced it.

**Keep this file current.** When a phase is finished, update the "Where things stand"
line so the next handoff is accurate.

---

```
Continue the Vineworks demo site redesign.

Start by reading, in this order:
1. vault/ClaudeInstructions.md — standing rules. Rule 0 (staging-before-master git
   workflow) matters most here: demo.vineworks.ge is production, and master also
   deploys Nikalas Marani's real customer-facing site.
2. vault/DemoSite/DemoSite-README.md — index of everything about the demo site.
3. vault/DemoSite/Plan-DemoRedesign.md — THE LIVE TASK TRACKER. Phases 0–4 with
   checkboxes and a "Resume point" line per phase. Start wherever it says to.
4. vault/DemoSite/DemoDirections.md — the design rationale behind the plan, so you
   understand *why* each phase exists rather than just executing tasks.

Context in one paragraph: demo.vineworks.ge is live and technically works — a real
tenant cloned from Nikalas Marani, rebranded as "VineWorks Estate", with a
Customer View ↔ Winery Admin View role switcher and a small checklist overlay. But it
doesn't sell. A cold visitor sees an unexplained winery website, and the admin panel
they're meant to be impressed by is completely empty ("No orders found", 0₾ revenue)
with a "Finish setting up your account" banner across the top. Max reviewed a design
proposal on 2026-09-10 and approved all four directions in it, to be built in the order
laid out in Plan-DemoRedesign.md.

Where things stand: nothing in Plan-DemoRedesign.md has been started. Begin at Phase 0
(seed the demo tenant with ~18 months of realistic trading data + suppress the setup
banner) — every other phase dead-ends on an empty admin panel until that's done.

How Max wants this run:
- Work in resumable chunks. Update Plan-DemoRedesign.md's checkboxes, phase Status and
  "Resume point" lines AS YOU GO, not at the end — so if a session runs out of context,
  the next one picks up cleanly.
- Follow the git workflow strictly: build locally → push to `staging` → verify → get
  Max's explicit go-ahead → merge to `master`. Never push straight to master.
- Max is non-technical. When something breaks, explain the cause in plain language in
  2–3 sentences alongside the fix (ClaudeInstructions Rule 2).
- Confirm the plan before editing (Rule 8), unless he's already said go.
- Keep the vault updated after meaningful work (Rule 1): SessionLog.md, FeatureLog.md,
  KnownBugs.md, and the DemoSite folder's own docs.

Two traps worth knowing before you touch anything:
- localhost resolves to whatever DEFAULT_TENANT_ID is in saas/.env (currently Staging
  Winery). To preview the DEMO tenant locally you temporarily point it at
  cmtvgl6e60000vl6w9se65t86, then REVERT before committing. See MaintenanceNotes §4.
- There are two demo tenants — dev (cmtvgl6e60000vl6w9se65t86) and prod
  (cmtvi582n0000vl7kjq44ir5p). Never hardcode either; read NEXT_PUBLIC_DEMO_TENANT_ID
  through saas/lib/demoTenant.ts. Scripts should look the tenant up by slug
  ("vineworks-demo") so they work against either database.

The published design review, with mockups drawn on top of the real production UI:
https://claude.ai/code/artifact/8775d152-5e9a-44d4-9380-e334b305cc7f
(Its source is saved at vault/DemoSite/demo-directions.html — edit and re-publish that
rather than rebuilding it. To update the published page in place, pass that URL as the
`url` argument to the Artifact tool.)
```

---

## Notes for whoever writes the *next* handoff

- Update the "Where things stand" paragraph — it's the line most likely to go stale.
- If a phase is half-finished, say so explicitly and point at the phase's Resume point
  rather than describing the state twice.
- If the artifact gets re-published, the URL stays the same — no need to change it.
