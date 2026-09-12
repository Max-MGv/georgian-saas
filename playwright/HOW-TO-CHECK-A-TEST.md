---
tags: [playwright, guide, max]
---

# How to check what the tests are doing (Max's guide)

This is a non-technical guide for actually looking at what a Playwright test run did — not just taking Claude's word for "tests passed." Written for someone who doesn't code, just wants to click around and see for themselves.

There are three ways to check a run, from easiest to most detailed:

1. **The report** — pass/fail list, one click to open, always available
2. **The video** — literally watch the browser do the test, only saved for failed tests
3. **The trace viewer** — a scrubbable timeline with screenshots of every step, also only for failed tests

You don't need all three every time. Most sessions, the report is enough.

---

## 1. The HTML report (always check this first)

After any test run, open:

```
C:\Users\Max\Desktop\claude-projects\georgian-saas\playwright\playwright-report\index.html
```

Just double-click it — it opens in your browser. No server needed to look at it.

What you'll see:
- A list of every test, green (passed) or red (failed)
- Click any test to expand it and see each step it took
- If something failed, the error message is right there in plain-ish English (e.g. "Timed out waiting for element" or "Expected text X, got Y")

This is the "did everything work" summary. If it's all green, you're done — no need to dig further.

## 2. Watching a video of a test

**Videos only exist for tests that failed** (this was just turned on — see below for why). If a test passed, there's no video, on purpose — recording every single passing run would pile up disk space for no benefit.

To find a video:
1. Open the report (step 1 above) and click the failed test.
2. There's an attachment link right there in the report — click it, or:
3. Look in `C:\Users\Max\Desktop\claude-projects\georgian-saas\playwright\test-results\` — each failed test gets its own folder, and inside it there's a `.webm` video file. Any video player (or just dragging it into Chrome/Edge) will play it.

The video shows the actual browser window doing the test — clicking buttons, filling forms, navigating pages — exactly as it happened.

## 3. The trace viewer (for digging into *why* something failed)

More detailed than a video: a step-by-step timeline with a screenshot at every single action, plus what the network requests were doing at that moment. Overkill for a quick sanity check, but useful if a video isn't enough to tell what went wrong.

To open a trace:
1. Find the `trace.zip` file next to the failed test's video in `playwright\test-results\<test-folder>\`.
2. Run this from a terminal in the `saas` folder:
   ```bash
   npx playwright show-trace "../playwright/test-results/<test-folder>/trace.zip"
   ```
3. This opens a browser tool where you can scrub through every step like a video timeline, with the exact page state at each point.

You'll probably never need this one yourself — mention it to Claude if a video isn't clear enough and you want a deeper look.

---

## Running the tests yourself (optional — Claude usually does this)

If you want to trigger a run without asking Claude:

1. Make sure the dev server is running (`npm run dev` in the `saas` folder), or just let Playwright start it — it does this automatically if it's not already up.
2. In a terminal, from the `saas` folder:
   ```bash
   npx playwright test
   ```
3. Wait for it to finish (currently 6–8 minutes for the full suite), then open the report as in step 1.

To run just one test file instead of the whole suite:
```bash
npx playwright test tests/tier2-core-flows/booking-simple.spec.ts
```

## Simple sanity checks, no jargon required

- **Report is all green** → nothing to do, the checked flows still work.
- **Something's red** → open the report, read the plain-language error at the top of that test's expanded view. If it's not obvious, that's exactly what to paste to Claude — the error text plus which test failed is enough for Claude to investigate.
- **A video shows the browser clicking the wrong thing, or a page looking broken** → that's a real bug worth flagging, not a flaky test.
- **A test fails intermittently (passes sometimes, fails other times) with the same error each time** → check `playwright\KNOWN-ISSUES.md` first; several known flaky patterns are already documented there (e.g. slow login redirect under DB load) so you don't need to re-diagnose something already understood.

## Why video wasn't on before, and why "retain-on-failure" now

Playwright can record video of every run, but recording *everything* burns disk space fast for no benefit once a test is known to pass reliably. `retain-on-failure` is the middle ground: nothing is saved for a passing test, but the moment something breaks, you get the actual video to look at instead of just an error message. This matches what the report and trace settings already do (`trace: 'on-first-retry'`) — only pay the storage cost when something actually needs investigating.

If you ever want to watch a *passing* run too (e.g. showing someone else how the booking flow test works), tell Claude — it's a one-line change to `video: 'on'` in `saas/playwright.config.ts`, easy to flip back after.
