---
tags: [playwright, test, tier3, releases]
---

# 20. Release notes (Super Admin → Releases, What's new) — FeatureLog #232

**Status:** ✅ Passing 1/1 on the dev server (2026-10-15).
**File:** `saas/tests/tier3-admin-smoke/releases.spec.ts` · **Run:** `npx playwright test tests/tier3-admin-smoke/releases.spec.ts --workers=1`

One end-to-end test: the token drafts a release (refused: bad date, outside "Take me there" link, publish, show to clients);
Max publishes + shows it in the editor ("Show to clients" is disabled until published); the published release is closed to the
token; the client page shows the client change and hides the internal one; unpublishing hides it again; the draft is deleted.

**Trap:** `getByRole('button', { name: 'Publish' })` also matches "Unpublish" — always pass `exact: true`.
