---
tags: [feature]
---

# Feature 246 — Wine photo picker: one shared photo window (T-302)

Built 2026-10-28 on Max's go (client report from the public widget, "it will get overloaded … unclear what photos are what wine"). Code-only, **no migration**. FeatureLog row #246. **On staging (`c26283b`), NOT on production.** Ticket T-302 is "Ready to test" on the staging board.

## What it does

- Wines admin: each wine (Wine Details tab) and each vintage (small photo on its row, and inside its edit form) shows **only its own photo** and a **Change photo** button. A vintage without its own photo shows the product photo faded with the chip "Uses the product photo"; "Give it its own photo" / "Use product photo" switch between the two.
- **Change photo** opens one popup (`WinePhotoPicker.tsx`): search (file name, wine, vintage), tabs All / Unused / In use, larger photos each labelled with the wine or vintage using it ("Saperavi 2022 +1 more") or "Unused", **Upload photos** tile (several files, 4 MB each, converted to WebP), a bin on every uploaded photo, and a footer showing what is selected and which other wines already use it.
- **Deleting a photo clears it from every wine and vintage that used it** (the warning lists them first). Before this, deleting a photo only cleared the wine you were in and left a dead link on the others (public site showed a broken image).
- Five **generic default bottles** (red, white, amber, rosé, sparkling — `saas/public/images/defaults/bottle-*.svg`) are offered to every winery. They are plain files, stored as `imagePath` like any other path; not deletable.
- The six older product photos (`/images/products/george.png` etc., Nikalas's test photos) are listed **only while a wine still points at one** (Max: they must not be a default for every winery). A wine moved off one cannot be moved back through the popup.
- The library listing no longer stops at 200 files: newest first, up to 1000.

## Key decisions

- Mockup first (published artifact, Product and Vintage detail levels), approved by Max, then built once (Rule 12).
- No schema change: usage ("who uses this photo") is computed in the browser from the wines already loaded; the library is still "files in the `wine-photos/<tenantId>/` folder".
- Option B (keep the original file name / a display name per upload) was **not** built — it needs a table or metadata and would be a second release. Option C (photo owned by the wine) rejected for now.
- A vintage's own photo counts as "usage" at either detail level (the public site shows `vintage photo ?? product photo` regardless of `wineDetailLevel`).

## Files

- `saas/app/admin/(panel)/wines/WinePhotoPicker.tsx` (new) — the popup. Uploads through the existing `uploadWineImage`; assignment is done by the parent.
- `saas/app/admin/(panel)/wines/WinesClient.tsx` — `ImagePickerGrid` removed; `photoField()`, `buildLibrary()`, `photoUsers()`, `handleDeletePhoto()`, `DEFAULT_BOTTLES`, vintage row thumbnail. `handleAssign*Image` now take the exact new path (no toggle).
- `saas/app/actions/uploadImage.ts` — `deleteWineImage` also nulls `Wine.imagePath` / `WineVintage.imagePath` of the tenant for that URL (inside `withTenantDb`), then removes the file, then revalidates `/wines` and `/admin/wines`.
- `saas/app/admin/(panel)/wines/page.tsx` — list limit 1000, newest first.
- `saas/lib/adminT.ts` — `wines.photo.*` keys EN + KA (**Georgian wording is Claude's**); nine dead keys of the old picker removed.
- `saas/public/images/defaults/*.svg` (new).

## Edge cases handled / seen

- Delete of a photo shared by product + vintage: both cleared, file removed, library count drops (checked in the DB).
- Upload inside the popup: new photo is marked "New" and selected automatically.
- Phone width: no sideways scroll; bins always visible on touch screens.
- Onboarding "N wines still need full details" counts wines with no photo, so deleting a shared photo moves those wines back into that count (consistent, not a bug).
- Dev-only gotcha seen twice today: the local server kept serving old code after an edit → stop server, remove the two junctions in `saas/.next/dev/node_modules` with `rmdir`, delete `.next`, restart (see `playwright/KNOWN-ISSUES.md`).

## What to test (also on the ticket)

Upload 2–3 photos; set a product photo and a vintage photo; "Use product photo"; give two wines the same photo, delete it and check both lost it and `/wines` shows no broken image; try a default bottle; Georgian wording; phone width.

## Not done / open

- Not run against Nikalas's production data (does he use only the six old photos or also uploads?).
- No Playwright spec for the picker (none existed for the old one either).
- Release note for clients not drafted yet — draft it with the production merge, with before/after shots and where it is (Wines → Change photo) (Rule 12.4).

## Phone pass (2026-10-28, after the staging push — it should have been done on localhost first)

Max: "do phone checks to optimize for phone; this should have been done on localhost first before shipping to staging" (ClaudeInstructions Rule 12.2 now says so explicitly). Done on localhost at 375 px, English and Georgian, measured with `getBoundingClientRect`. Found and fixed (commit follows `c26283b`):

- **Tap targets too small:** "Change photo" 28 px, "Remove" / "Use product photo" 16 px, tabs 26 px, bin 24 px, footer buttons 34 px, vintage-row thumbnail 28 × 36 → now 40 / 40 / 34 / 32 / 42 / 40 × 52. (Desktop gets the same larger sizes; no `sm:` variants, see the Tailwind note below.)
- **Popup height** `92vh` → `92dvh` (a phone's address bar made it overflow); the page behind the popup is locked while it is open and the grid uses `overscroll-behavior: contain` (a swipe inside the grid used to scroll the page).
- **Delete warning** now shows a thumbnail of the photo it is about (before, nothing said which photo).
- Search box is a flex item (`flex: 1 1 200px`): own row on a phone, next to the tabs on a wide screen.
- Checked OK: no sideways scroll, product field, vintage rows, vintage edit form, popup grid (2 columns), Georgian text (tabs wrap to two rows, nothing overflows).
- **Not mine, seen on the way:** in the collapsed wine rows at phone width the wine NAME is squeezed out by the toggles/icons (the header row was not touched by T-302). Not fixed (not asked).
- **Local dev gotcha (Tailwind):** after edits the dev server often serves stale JS **and stale CSS** — new utility classes such as `h-13`, `sm:flex-1`, `overscroll-contain` were simply missing from the generated CSS until a full restart, and sometimes still after one. Verify layout changes by measuring, and prefer inline styles or classes already used elsewhere for anything that must be right locally. Fix routine: stop server, remove the two junctions in `.next/dev/node_modules` with `rmdir`, delete `.next`, restart, navigate again (the pane re-opens `/` after a restart).
