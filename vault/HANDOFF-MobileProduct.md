---
tags: [handoff, mobile, product]
---

# Handoff — the product's mobile pass

**How to use this:** copy the block below into a fresh Claude Code session. Written 2026-09-12,
after the demo's own mobile half shipped.

**What this is NOT.** The *demo's* mobile problems are already fixed and live (`bc3a7bd`): the
front door fits one phone screen, the demo chrome's tap targets clear 40 px, and `/live` is on
the right palette. This handoff is the **shared product** — the pages every winery and every
guest actually uses. Different files, different ship route, much wider blast radius.

**The single most useful thing already known:** a measured audit at iPhone size found **no
horizontal overflow on any screen**. The layout is not broken. What is wrong is smaller and more
specific, and it is listed below with numbers. Do not start by rebuilding layouts.

---

## The prompt

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). The task is a mobile
pass on the PRODUCT — the shared pages every tenant renders. The demo's own mobile issues are
already done and shipped; do not redo them.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave here. Rule 0 (git: staging before master for SHARED files) is the one that
   bites on this task: essentially every file you touch is shared, so essentially everything
   takes the staging pass. Rule 8: confirm the plan before editing.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md — all of it is
   short. §12 (data-tour anchors), §15 (the demo palette module) and §16 (/admin/onboarding's
   second layout) are the ones a layout change can silently break.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\SessionLog.md — the 2026-09-12
   entries carry the audit this task starts from.

MEASURED STARTING POINT (2026-09-12, live site, iPhone 13 viewport 390x664).
Do not re-derive this; do re-run it to confirm nothing has moved.

  Horizontal overflow: ZERO on /, /wines, /live, /admin/orders and /admin/onboarding.
  The layout is not broken. Resist the urge to rebuild it.

  Tap targets under 32px tall, all of them SHARED components:
    - HelpHint "?" trigger ................ 17x17   components/HelpHint.tsx
    - Public nav "Menu" button ............ 30x30   the (site) header
    - Date picker "Open calendar" ......... 15x15   components/DateInput.tsx
    - Footer links Terms/Privacy/Returns .. ~40x20  the (site) footer
    - Wine filter chips All/Red/Amber ..... ~45x30  app/(site)/wines/WineCatalogueClient.tsx
    - Admin Sign out / Table / Calendar ... ~60x30  admin (panel) layout + orders ViewToggle
    - Admin status dropdowns .............. ~90x26  app/admin/(panel)/orders/OrdersTable.tsx

  One structural thing worth a decision rather than a patch: on /admin/orders the admin nav
  links run to x=865 on a 390px viewport. The page itself does not scroll sideways, so the nav
  is scrolling internally — that is intentional, but nine links in a 390px scroller is a poor
  way to navigate a back office on a phone. Whether that becomes a drawer, a "more" menu, or
  stays as is, is a design decision for Max, not a fix to apply quietly.

WHAT MAX HAS AND HAS NOT ASKED FOR:
He asked for "mobile layout for the demo", which is done. He has NOT yet approved changing
shared components — I flagged the list above to him and he has not answered. So: START BY
CONFIRMING SCOPE. The honest framing for him is that making the "?" hint or the date picker
bigger changes the app for every winery and every guest, and a booking form is the one screen
where a mis-sized control costs real money.

SUGGESTED ORDER, IF HE APPROVES:
1. The GUEST side first, and within it the booking form. It is the only screen on this platform
   that takes money from a stranger's phone, so it is where a 15x15 date-picker trigger actually
   costs something. Everything else is a winery owner who can reach for a laptop.
2. The wine shop (/wines) second — quantity steppers and filter chips.
3. The admin panel last, and only as far as Max wants. A winery owner doing data entry on a
   phone is a real but secondary case, and the orders table is genuinely desktop work.

RULES THAT ACTUALLY BITE HERE:
- Shared files take the `staging` pass. Push to `staging`, check the preview
  (georgian-saas-git-staging-mg-productions-projects.vercel.app) against Staging Winery, and
  only then fast-forward `master`. Max has approved merges to master in the past but ASK each
  time — that merge ships to Nikalas Marani's real customers.
- MEASURE THE BEFORE-STATE. This project's own ground rule 5, and it has now caught four
  separate wrong premises. The most recent: the Orders table was scoped as "hide two columns",
  and measuring showed the one-line truncation did the work while the hiding was cosmetic. Take
  the number, change the thing, take the number again.
- SCREENSHOTS ON THIS MACHINE: both browser panes fail — the Browser pane collapses to a ~45px
  sliver and Chrome reports zero width. Drive Playwright directly instead, from the `saas/`
  directory so `@playwright/test` resolves:
      node ./some-script.mjs      // chromium.launch(), devices['iPhone 13']
  It controls its own viewport and is the only reliable way to see anything here. Delete the
  script afterwards. The demo signs in with a one-click button, so no password is ever typed —
  but note that is the DEMO tenant; Staging Winery's admin needs a real login, which Claude may
  not perform. Ask Max to look at admin screens on a real tenant.
- localhost resolves to DEFAULT_TENANT_ID in saas/.env, currently Staging Winery
  (cmrxb85wo0000vlc0d964nzf8). That is the RIGHT tenant for this task — you want a real tenant,
  not the demo. Only switch to the dev demo tenant (cmtvgl6e60000vl6w9se65t86) if you need to
  see demo chrome, and REVERT before committing.
- Restart the dev server after changing .env; it does not reliably pick the change up.
- There is an existing `lib/useIsNarrow.ts` hook (matchMedia, `max-width: 767px`). Use it rather
  than writing a fourth copy — three hand-written copies of one measurement is how the tour's
  anchoring bug happened. It returns false on the first render ON PURPOSE: the server has no
  matchMedia, and branching on the real value during hydration is a mismatch. Prefer plain CSS
  media queries (Tailwind's sm:/md:) wherever the component is not already inline-styled; the
  hook exists for components that are.
- Do NOT touch the demo components (components/Demo*.tsx, app/live/, lib/demoTheme.ts,
  lib/demoThemePreview.ts). They are done and they ship on a different route.

DEFINITION OF DONE:
Every changed screen re-measured at 390x664, before-and-after numbers in the commit message,
Staging Winery regression-checked on the preview, and vault updated per ClaudeInstructions
Rule 1 (SessionLog, FeatureLog, Roadmap, KnownBugs as applicable).

CONTEXT YOU MAY WANT BUT SHOULD NOT ASSUME:
- KnownBugs.md has exactly one open item, #19 — a 200-connection database ceiling at roughly
  100-150 simultaneous visitors. It is unrelated to this task, it is the only bug that can take
  the real site down, and nobody has started it.
- Two things are waiting on Max from earlier sessions: pressing the new super-admin "Reset demo
  now" button, and eyeballing Staging Winery's /admin/orders, /admin/statistics and
  /admin/companies. If he has not done them, remind him rather than trying to do them yourself.
~~~

---

## Why this handoff is shaped the way it is

**It opens by ruling things out.** The demo's mobile work is done, and the layout is not broken.
A session that starts by rebuilding responsive layouts will burn its context on the wrong
problem — the measured audit says the faults are small, specific and listed.

**It makes the scope question explicit and first.** Max asked for the demo, not the product.
Every item on the list changes what a real winery's customers see, and the booking form is the
one screen where a mis-sized control costs money. That is his call, and a session should not
quietly make it by starting to type.

**It carries the machine's quirks.** Screenshots do not work through either browser pane here,
and a session that does not know that will waste several attempts discovering it — as this one
did.
