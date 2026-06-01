---
tags: [plan, security]
---

# Plan — Security & Bug Fixes

Findings from code inspection on 2026-06-01. Work through in priority order — Criticals first.

---

## Critical — Fix First

### 1. ~~Admin routes have no auth redirect~~ — NOT AN ISSUE

`saas/proxy.ts` is the middleware entry point (Next.js 16 renamed `middleware.ts` to `proxy.ts`). It correctly checks auth on every `/admin/*` request and redirects to `/admin/login` if no session exists. Admin routes are properly protected. Initial finding was wrong.

---

### 2. Server actions have no auth guard

**Files:** `saas/app/actions/siteContent.ts`, `settings.ts`, `blockedDates.ts`

`saveContent`, `deleteContent`, `updateSetting`, `addBlockedDate`, `removeBlockedDate` are `'use server'` functions. Next.js exposes these as HTTP POST endpoints. The proxy correctly blocks unauthenticated page visits, but server actions can be called directly without going through a page at all — anyone who discovers the endpoint URL can mutate site content, settings, and closed-day calendars without logging in.

Supabase RLS on the DB does NOT help here because Prisma uses the service-role key and bypasses RLS entirely.

**Fix — add to the top of each write action:**
```ts
import { createClient } from '@/lib/supabase/server'

// inside each write action:
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) throw new Error('Unauthorized')
```

Actions that need guarding:
- `saveContent` — siteContent.ts
- `deleteContent` — siteContent.ts
- `saveContentSection` — siteContent.ts
- `updateSetting` — settings.ts
- `addBlockedDate` — blockedDates.ts
- `removeBlockedDate` — blockedDates.ts
- All order/company/wine/etc. write actions should be audited the same way

---

## Medium — Pricing Loopholes

### 3. Masterclass price trusted from client

**File:** `saas/app/actions/createBooking.ts:62-64`

The server accepts `pricePerUnit` from the browser when calculating masterclass totals:
```ts
const masterclassAmt = (data.masterclassLines ?? []).reduce(
  (s, l) => s + l.quantity * l.pricePerUnit, 0   // pricePerUnit comes from client!
)
```
A user could POST with `pricePerUnit: 0` on every line and pay nothing.

**Fix:** fetch actual prices from DB in `createBooking`:
```ts
const masterclassIds = (data.masterclassLines ?? []).map(l => l.masterclassItemId)
const masterclassItems = await db.masterclassItem.findMany({
  where: { id: { in: masterclassIds } },
  select: { id: true, pricePerUnit: true },
})
const priceMap = Object.fromEntries(masterclassItems.map(i => [i.id, i.pricePerUnit]))

const masterclassAmt = (data.masterclassLines ?? []).reduce(
  (s, l) => s + l.quantity * (priceMap[l.masterclassItemId] ?? 0), 0
)
```

---

### 4. Enhanced booking skips min-guest validation

**File:** `saas/app/actions/createBooking.ts:54-56`

The min-guest check uses `data.guestCount`, but for enhanced company bookings the paying headcount is `tastingGuestCount + lunchGuestCount`. A company booking could pass with `guestCount=20` (validation passes) but `tastingGuestCount=0, lunchGuestCount=0` (zero paying guests, totalPrice = 0).

**Fix:**
```ts
const effectiveGuestCount = isEnhanced
  ? (data.tastingGuestCount ?? 0) + (data.lunchGuestCount ?? 0)
  : guestCount

if (effectiveGuestCount < minGuests) {
  return { success: false, error: `Minimum ${minGuests} guests required for this visit type.` }
}
```

Note: intentional zero-paying-guest scenarios (tour guide only, all free guests) may need a special flag rather than bypassing the check entirely.

---

## Minor — Polish / Robustness

### 5. `hasDbValue` false-negative on empty-string saves

**File:** `saas/components/EditableText.tsx:36`

```ts
const hasDbValue = !!(children)
```
If an admin saves an empty string, the DB row exists but `children === ''` → `hasDbValue = false` → reset badge never appears.

**Fix:** pass an explicit `hasDbValue` prop from the parent:
```tsx
// in ContentClient/VisualMode, pass hasDbValue={!!c[f.key]} to EditableText
// update EditableText Props to accept: hasDbValue?: boolean
// change line 36 to: const hasValue = hasDbValueProp ?? !!(children)
```

---

### 6. No `revalidatePath` after content save/delete

**File:** `saas/app/actions/siteContent.ts`

Public pages are force-dynamic so they are fine for now, but `/admin/content` (a server component) won't reflect edits if navigated away and back. If any site page ever loses `force-dynamic`, old content will be cached.

**Fix:** add to `saveContent` and `deleteContent`:
```ts
revalidatePath('/admin/content')
revalidatePath('/', 'layout')
```

---

### 7. EditableText outer div wrapper breaks inline HTML semantics

**File:** `saas/components/EditableText.tsx:99`

When `as="span"`, the outer container is still a `<div>`. Rendering this inside a `<p>` would be invalid HTML. Currently safe in all existing usages, but is a latent trap.

**Fix:** conditionally use a `<span>` outer wrapper when Tag is an inline element (`span`, `a`, `em`, `strong`), or accept an `outerAs` prop.

---

## Checklist

- [x] ~~#1 — Auth redirect in admin layout~~ (not an issue — proxy.ts handles it)
- [x] #2 — Auth guard on all write server actions (lib/requireAdmin.ts, 12 action files)
- [ ] #3 — Fetch masterclass prices from DB in createBooking
- [ ] #4 — Enhanced booking min-guest check on paying headcount
- [ ] #5 — `hasDbValue` prop on EditableText
- [ ] #6 — `revalidatePath` in saveContent / deleteContent
- [ ] #7 — EditableText outer wrapper inline fix
