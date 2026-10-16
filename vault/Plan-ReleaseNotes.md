---
tags: [plan, super-admin, releases]
---

# Plan — Release notes ("What's new")

**Status: ✅ ON PRODUCTION since 2026-10-16** (Chunks 1–7; bucket `release-images` created on prod). Nothing is visible to clients until Max publishes a release and turns on "Show to clients".
Builds on [[Plan-TicketsV2]].

Max: "we are now working on features that actually impact users — a section in super-admin for release notes, with screenshots
where applicable, so me and users can track the progress of the website and see the differences in screenshots and use cases."

## Decisions (Max, 2026-10-15)
1. **Start in Super Admin; Max toggles whether clients see it.** Release notes describe *production*, so the real ones live on the
   **production** board/DB and are toggled there. Staging has the same screens with test entries (toggling there affects nobody).
2. **No per-winery targeting.** Everything clients see goes to all wineries. (Per-*entry* "clients see this" exists only to keep
   internal items — e.g. the ticket tool — out of the client page.)
3. **Before/after screenshots taken by Claude**, on the test/demo winery only — never real customer data.
4. **History:** write entries for the last few production updates so the page is not empty on day one (a production write → on Max's go).

## Design
- **Release** = one production update: date, short summary (EN + KA), status **Draft / Published**, **Show to clients** (off by default).
- **Entry** = one change: title, what changed, how to use it (steps), "Take me there" admin path, linked tickets (T-/P- refs),
  **Clients see this** (on by default), images. Text in English + Georgian (Claude drafts KA, Max checks).
- **Images**: before/after pairs (desktop or phone) shown side by side with a slider, or single images; private bucket
  `release-images` (both Supabase projects — KnownBugs #71 lesson), shown through signed links.
- **Super Admin → Releases**: list + editor (reorder entries, edit EN/KA, paste/drop images, publish, show to clients, preview as client).
- **Client page** `/admin/whats-new`: appears in the admin menu only when at least one release is published *and* shown to
  clients; a dot until the user has seen the newest one. Language follows the admin language. No emails.
- **Drafting at release time (Claude):** the "Next release" tickets → one entry each in plain client language → before/after
  screenshots (`scripts/release-shots.ts`: same page, same test tenant, old vs new build) → uploaded as a Draft on production with
  the production token, as a step of the release Max approved. Max edits, publishes, flips "Show to clients".
- Not built: comments, likes, emails/newsletters, version numbers, per-winery targeting.

## Build order (all on `staging` + dev DB; production = runbook, Max's go)
| # | Chunk |
|---|---|
| 1 | Schema + migration (Release, ReleaseEntry, ReleaseImage, ReleaseView; RLS on, no policy, revoke) + bucket `release-images` (dev) |
| 2 | Service + super-admin actions + token API (`/api/releases…`) |
| 3 | Super Admin → Releases (list, editor, images, publish/show, preview) |
| 4 | Client "What's new" page + menu item + unseen dot (EN/KA) |
| 5 | `tix release …` (draft from Next release tickets, add entry, upload image) + `scripts/release-shots.ts` |
| 6 | Tests (Playwright + scripted checks), screenshots, vault |
| 7 | Production (with the ticket tool's runbook): migration, bucket, then history entries + first real release — **each on Max's go** |

## Redesign after Max's first look (2026-10-15)
Max: *"the release section looks terrible and unreadable"* and *"without including the last release I can't even assess it"*.
- **Editor = the release itself.** The Super Admin page now shows the release exactly as clients read it (light, client colours),
  each change with a small toolbar (↑ ↓, eye = internal, ✎). ✎ opens only that change in a clean white form with its screenshots
  shown large; the summary/date has its own ✎. The old wall of dark form boxes is gone.
- **Readable screenshots:** cropped to the part that changed (`--focus`), 2× pixels, 1100px desktop width. Phone before/after pairs
  are shown **side by side**; a desktop pair uses the **wipe slider only when both pictures have the same shape**, otherwise they
  are **stacked** (Before above After). Every picture opens full size in the viewer.
- **Real content to judge it by:** draft releases for the last production updates — **7 Oct 2026** (8 client changes + 1 internal:
  orders on the phone's first screen, settings fit, Pack on phone, calendar tap, unpaid chip, New Order contact fields,
  QR payment link, 4 MB uploads) and **9 Oct 2026** (home-screen icons) — EN + KA, with before/after pairs taken from the
  **2 Oct build vs the production build**, both run locally on the dev DB. These ARE the planned "history entries"; on staging
  for now (dev DB) — they get re-created on production with the first release, on Max's go.
- Known: the test data shows test names in screenshots (e.g. "ZZ Wine Integrity Off…") — clean those test orders before
  taking the production pictures.

## Views (Max, 2026-10-15: "change the default to client view — we are also users — and make it changeable to edit and developer view")
- **Releases** opens in **Read** (`ReleaseTimeline.tsx`): **collapsed by default** for a macro overview (Max, 2026-10-15) — counts
  on top (releases · published/drafts, shown to clients, changes for clients + internal, screenshots), simple filters (All /
  Published / Drafts, Shown to clients, search in EN + KA text), each release = date + summary + one line per change (📷 count);
  a click opens that change, "Expand" a release, "Expand all / Collapse all". **Manage** = the list with status, counts and "New release".
- **A release** opens in **Client view** (default): exactly the clients' page — internal changes left out, no buttons on the changes,
  the Publish / Show-to-clients bar hidden (status pills stay at the top). **Edit** = the editor (✎ per change, reorder, internal,
  add, Publish / Show to clients, delete draft). **Developer** = all changes incl. internal + a box per change: clients see it,
  tickets (links to the board), "take me there", EN/KA completeness, screenshot details, ids; plus release status/dates/counts.
  The view is in the URL (`?mode=edit`, `?mode=dev`).
- The token may now **delete drafts** (`DELETE /api/releases/[id]`; published → refused) so a failed test cleans up after itself.

## How a release is drafted (Claude's routine, after Max approves a production merge)
1. `tix release draft-from-next --date YYYY-MM-DD --prod --yes-prod` — one entry per "Next release" ticket (internal areas marked internal).
2. Rewrite each entry for clients: `tix release edit <entryId> "Title" --body .. --howto "a\nb" --link /admin/.. --title-ka .. --body-ka ..`.
3. Screenshots on the **dev DB only**: `git worktree add --detach <scratchpad>/wt-before <old master>` and `…/wt-after <new master>`,
   copy `saas/.env` (dev DB) into each, `npm ci` + `npx prisma generate` (real node_modules — **no junctions**), run `npx next dev
   --port 3001/3002` in each, then e.g. `npx tsx scripts/release-shots.ts --path /admin/settings --before http://localhost:3001
   --after http://localhost:3002 --viewport phone --focus "Payment Details"` (also `--click "Pack"`, `--select "<company>"`);
   the script refuses non-local addresses. Upload with `tix release image <entryId> <file> --kind before|after --pair N --viewport ..`.
   Cleanup: stop both servers, `find <wt> -type l` (Turbopack leaves a link inside `.next` pointing into the same checkout — remove
   it), then `git worktree remove --force` and check the main `saas/node_modules` is intact (lesson: [[feedback_windows_junction_delete]]).
4. Max reads it in Super Admin → Releases (Preview as client, EN/KA), presses **Publish**, and flips **Show to clients** when he wants.
5. Git Bash note: run tix/shots with `MSYS_NO_PATHCONV=1`, or `/admin/...` arguments are rewritten into Windows paths.

## Verification (2026-10-15)
22 scripted UI checks (desktop + phone): Show-to-clients locked until published, preview = client page (internal entries hidden,
before/after slider, keyboard slider), publish + show, menu item + unseen dot, dot cleared after reading, "Take me there",
viewer, unpublish hides it again, delete draft. Token API: publish/show refused (403), outside links / bad dates refused (400),
bad token 401, published releases closed to the token. `releases.spec.ts` 1/1 + `tickets.spec.ts` 6/6 (one cold-server failure
of the ticket API test in the first run — not reproduced alone or in a second full run). i18n parity 1244/1244.
Found and fixed while testing: the "Show to clients" switch snapped back until the refresh landed (now moves at once);
screenshots showed the super-admin "Platform" button (now hidden by the script).
