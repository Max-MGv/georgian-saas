---
tags: [plan]
---

# Plan: Page Background Image Customization

Admin can pick which image to use as the background for each public page section, then adjust position and zoom — with a live preview — without touching code.

---

## Reversibility first

This feature is designed to be fully reversible with a single `git revert`:

- **No new DB models.** All settings stored in the existing `Setting` table as key/value strings (e.g., `home_hero_bg_path = /images/slider1.jpg`, `home_hero_bg_position = 40% 60%`, `home_hero_bg_size = 120%`). These keys are just ignored if the feature is removed.
- **No new API routes.** Uses existing `getSetting` / `updateSetting` actions.
- **No file uploads.** Images come from `public/images/` which already exists. No Supabase Storage, no upload UI, no S3.
- **Public pages degrade gracefully.** If the setting key is missing or empty, the page falls back to the current hardcoded image. No change to public page behavior unless the admin explicitly sets a value.

To cancel: `git revert <commit-hash>`. The Setting rows remain in DB but are simply never read — harmless.

---

## What it does

Three controls per page section (home hero, about hero, contact hero):

| Control | What it does |
|---|---|
| **Image picker** | Grid of thumbnails from `public/images/`; click to select |
| **Position sliders** | X% and Y% sliders (0–100); maps to CSS `background-position` |
| **Zoom slider** | 100–200% zoom; maps to CSS `background-size` |
| **Live preview** | Small preview panel (300×200px) updates in real-time as you drag sliders |

---

## Setting keys (all stored in `Setting` table)

| Key | Example value | Meaning |
|---|---|---|
| `home_hero_bg_path` | `/images/slider1.jpg` | Image file for home hero |
| `home_hero_bg_position` | `40% 60%` | CSS background-position |
| `home_hero_bg_size` | `130%` | CSS background-size (as %) |
| `about_hero_bg_path` | `/images/vineyard.jpg` | Image file for about hero |
| `about_hero_bg_position` | `50% 30%` | — |
| `about_hero_bg_size` | `110%` | — |
| `contact_hero_bg_path` | `/images/winery.jpg` | Image file for contact hero |
| `contact_hero_bg_position` | `50% 50%` | — |
| `contact_hero_bg_size` | `100%` | — |

---

## Implementation plan

### Step 1 — Admin UI (`/admin/content` or `/admin/settings`)

Create `BackgroundImageEditor` client component:
- Fetches current settings (passed as props from server)
- Shows image picker grid (hardcoded list of filenames from `public/images/`)
- Shows X/Y position sliders (0–100, labeled "Move left/right" and "Move up/down")
- Shows zoom slider (100–200, labeled "Zoom")
- Live preview box updates CSS `background-image`, `background-position`, `background-size` as sliders move
- "Save" button calls `updateSetting` for all three keys
- "Reset to default" clears all three keys

Place it as a new **"Backgrounds"** tab in `/admin/content` (alongside the existing Text / Visual tabs).

### Step 2 — Public pages read settings

In each public page server component, call `getSetting` for the three keys:

```ts
const heroBgPath     = await getSetting('home_hero_bg_path')
const heroBgPosition = await getSetting('home_hero_bg_position')
const heroBgSize     = await getSetting('home_hero_bg_size')
```

Apply to the hero div:
```tsx
style={{
  backgroundImage: `url(${heroBgPath || '/images/slider1.jpg'})`,
  backgroundPosition: heroBgPosition || '50% 50%',
  backgroundSize: heroBgSize ? `${heroBgSize}%` : 'cover',
}}
```

If the setting is empty/missing → falls back to current hardcoded values. Zero visible change until admin explicitly sets something.

### Step 3 — Wire up

Pages to update: `app/(site)/page.tsx`, `app/(site)/about/page.tsx`, `app/(site)/contact/page.tsx`

Each already uses `getSetting` (for min guests etc.) so the pattern is established.

---

## What's NOT included (to keep it reversible)

- No file upload — images must already be in `public/images/`
- No true cropping — CSS position/zoom covers 90% of real adjustments
- No per-component backgrounds (only page-level hero sections)
- No image deletion or renaming from admin

These can be added later as a separate, independent feature.

---

## Files to create/modify

| File | Change |
|---|---|
| `saas/app/admin/content/BackgroundImageEditor.tsx` | NEW: image picker + sliders + preview |
| `saas/app/admin/content/ContentClient.tsx` | Add "Backgrounds" tab |
| `saas/app/(site)/page.tsx` | Read 3 setting keys, apply to hero |
| `saas/app/(site)/about/page.tsx` | Read 3 setting keys, apply to hero |
| `saas/app/(site)/contact/page.tsx` | Read 3 setting keys, apply to hero |

No migrations. No new models. No new actions. No new routes.

---

## Rollback procedure

```bash
git revert <commit-hash>   # reverts all 5 file changes
git push origin master     # Vercel redeploys in ~2 min
```

The Setting rows (`home_hero_bg_path`, etc.) stay in DB but are never read — they're inert. If desired, they can be deleted manually in Supabase dashboard, but it's not required.
