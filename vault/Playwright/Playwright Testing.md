---
tags: [research, testing, playwright]
---

# Playwright Testing — Issue #137

**Status: 🚧 Researching.** No test code, no config, nothing installed yet. This note is where we gather understanding and decisions before writing a single script — per Max's explicit instruction not to implement anything until the concept is fully understood.

Linked from `FeatureLog.md` row #137.

---

## Why this exists

Max asked (2026-07-23) whether now — right after the `staging` → `master` workflow ([[../Plan-DevProdEnvironments|Plan-DevProdEnvironments]]) went live — is a good time to start thinking about Playwright. Rather than jump to implementation, he wants a real understanding first:

- What Playwright actually is and how it works
- What it can and can't test — deep understanding, not a surface answer
- Pros/cons of letting AI (Claude) write the tests, run the tests, and have them gate the flow
- Whether tests should run automatically on each feature addition before Max verifies

## Open questions (unresolved — decide later, not today)

- [ ] Do we adopt Playwright at all, or stay with manual browser verification each session?
- [ ] If yes: what's the first slice of coverage? (booking flow, tenant isolation, admin login are the leading candidates)
- [ ] Where do tests run — against `staging` (real deploy, real dev DB) or a local dev server?
- [ ] Do tests gate the `staging` → `master` merge (must pass before Max approves), or just run informationally?
- [ ] Who "reviews" AI-written tests, and how, given Max is non-technical?
- [ ] How do we handle the staging DB going stale (per [[../Plan-DevProdEnvironments|Plan-DevProdEnvironments]], the staging tenant snapshot drifts and needs manual re-clone) — tests need stable seed data to not be flaky.

## Research log

### 2026-07-23 — initial explainer (chat only, no code written)

Covered in chat, not reproduced in full here (see session transcript / `SessionLog.md` if it gets logged): what Playwright is (Microsoft's browser-automation/E2E framework, drives real Chromium/Firefox/WebKit), how it works (scripted actions + assertions against the real rendered DOM, auto-waiting, network interception, trace/video/screenshot capture on failure), where it would slot into our flow (a scripted, repeatable replacement/supplement for the manual browser-checks Claude already does every session), pros/cons of AI authoring tests (fast coverage of the codebase Claude already knows vs. risk of encoding the same wrong assumptions into both the feature and its test, brittle selectors, false confidence), and what it structurally cannot verify (subjective visual/UX quality, real email delivery, real payment gateways, true load/performance, genuine cross-device quirks, whether the business logic is *conceptually* right vs. just unchanged).

## Decisions made

- **Scope is admin-first, not public-site-first.** Max: most of the real functionality lives in `/admin` (filters, navigation, editors) — the public booking flow matters too, but coverage should weight toward admin.
- **Effort constraint:** cover as much as reasonable, not exhaustively — breadth (does it load, do filters work, do editors save) across most of the admin surface, depth only on areas with real bug history (booking price calc, tenant isolation, i18n toggles).

## Next steps

Full phased build plan drafted: [[Plan-PlaywrightTesting]]. Waiting on Max to confirm the open decisions listed there (target environment, data hygiene against the dev DB, phase order) before Phase 0 starts.
