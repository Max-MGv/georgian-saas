---
tags: [playwright, test, tier3, tickets]
---

# 19. Internal tickets (super-admin) — Feature 222

**Status:** ✅ Passing 4/4 on the dev server and on a production build (2026-10-07).
**Tier:** 3 — admin smoke, localhost (dev DB).
**File:** `saas/tests/tier3-admin-smoke/tickets.spec.ts`
**Helpers:** `auth.ts` (super-admin login), `credentials.ts` → `getTicketsDevToken()` (reads `TICKETS_TOKEN_DEV` from `credentials.txt`).
**Run with:** `npx playwright test tests/tier3-admin-smoke/tickets.spec.ts --workers=1`

## What the four tests check

1. **API refuses a missing or wrong token** — `/api/tickets` returns 401 without a bearer token and with a bad one.
2. **Token API guard rails** — create, comment and hand over for review work; and the things a token must NOT do are refused: move to Done / Review, touch a finished ticket, close a widget ticket, change the tenant.
3. **UI lifecycle** — board → quick add → review card → "Send back" needs a note → Verified → closing needs a reason (modal dialog, Escape closes it).
4. **Public widget report becomes a ticket** — a visitor report on a second browser context shows up as a Widget-source ticket with the tenant resolved and the text marked untrusted.

Every test creates `ZZ…`-prefixed tickets and closes them at the end; nothing else is touched.

## Selector and timing traps (each cost a failed run once)

- `getByText('Verified')` also matches the **button** — it raced the state change. Wait on the outcome text (`Ready to test → Done`) instead.
- `getByLabel('Title')` also matches "New ticket title" — use an exact label.
- `getByRole('alert')` also matches Next's route announcer — scope to the app container.
- First run after a dev-server start compiles the ticket routes cold: timeouts are 150 s, and the server should be warmed with one visit first.
- Closing a Widget-source ticket in the UI needs the reason dialog; the API deliberately refuses it for tokens.
