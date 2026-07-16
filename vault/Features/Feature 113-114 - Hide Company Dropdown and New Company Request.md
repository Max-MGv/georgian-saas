---
tags: [feature, public-site, settings]
---

# Feature 113–114 — Hide Company Dropdown + New Company Request

**Status:** 🚧 In progress

## What it does

### Feature 113 — Hide company dropdown
A new toggle in Settings → Booking: **"Hide company dropdown (use access code instead)"** (`hide_company_dropdown`, default OFF).

When ON, both the booking form and wine orders form replace the company `<select>` dropdown with a direct code input:
- User types their company access code → clicks Confirm
- Valid code → company name chip appears, all profile fields auto-fill
- Invalid / not found → "Code not recognised."

### Feature 114 — "New Company?" registration request
When `hide_company_dropdown` is ON, a **"New Company? →"** button appears above the code input area.

Clicking opens a popup with:
- Company Name (required)
- Your Name (required)
- Phone Number (required)
- Email (optional)

On submit: sends a notification email to the winery's `contact_email` via Resend. No DB record is created — admin creates the company manually.

Customer sees: "Request received! We'll be in touch to set up your account."

## Key design decisions

- When `hide_company_dropdown=false` (default): existing behavior is completely unchanged — the company `<select>` and popup code flow still works exactly as before.
- When ON: `findCompanyByCode(code)` server action searches tenant's companies by access code (case-insensitive). Returns company + profile in one call — no need for a second `verifyCompanyCode` call.
- The existing `useEffect` that watches `companyId` and shows the old popup is gated on `!hideCompanyDropdown` so it doesn't fire in the new flow.
- `companyId` is still set from the code lookup result (needed for BookingForm submission to `createBooking`).
- In WineCatalogueClient, `companyId` is not needed for submission (the wine form uses plain form fields), but the company chip still uses a local `directCompanyName` state.
- The "New Company?" email uses the same Resend sandbox pattern as other emails — sends to `max.mghvdliashvili@gmail.com` until domain is verified.

## Files changed

| File | What changed |
|------|-------------|
| `saas/app/actions/companies.ts` | Added `findCompanyByCode(code)` — public action, searches by access code |
| `saas/app/actions/notifyNewCompany.ts` | NEW — sends new company request email via Resend |
| `saas/app/admin/(panel)/settings/SettingsClient.tsx` | Added `hide_company_dropdown` toggle state + UI row |
| `saas/app/admin/(panel)/settings/page.tsx` | Fetches + passes `hide_company_dropdown` setting |
| `saas/components/BookingForm.tsx` | Added `hideCompanyDropdown` prop, direct code state, new company popup |
| `saas/app/(site)/wines/WineCatalogueClient.tsx` | Same changes as BookingForm |
| `saas/app/(site)/page.tsx` | Fetches `hide_company_dropdown`, passes to BookingForm |
| `saas/app/(site)/wines/page.tsx` | Fetches `hide_company_dropdown`, passes to WineCatalogueClient |

## State added to BookingForm / WineCatalogueClient

```
directCode           string        — raw code text being typed
directCodeLoading    boolean       — spinner while checking
directCodeError      string        — "Code not recognised." or empty
directCompanyName    string        — shown in chip after successful lookup
showNewCompanyPopup  boolean       — controls new company form overlay
newCoName/Contact/Phone/Email  string — new company request fields
newCoStatus          idle|submitting|sent|error
```

## Edge cases

- User enters code then clicks × to clear → `companyId`, profile fields, and chip are all cleared
- Company type selected but no code verified → form submit blocked with "Please enter and confirm your company code."
- New company request: all three required fields must be filled before Send is enabled
- The Resend sandbox restriction (only delivers to verified owner email) applies here too — same `isDomainVerified = false` pattern

## What to test

1. Turn ON `hide_company_dropdown` in Settings → Booking
2. Go to home page → select "Tour Company" booking type → verify dropdown is gone, code input appears
3. Click "New Company? →" → verify popup opens with 4 fields → fill and submit → verify "Request received!" message
4. Enter wrong code → verify "Code not recognised." appears
5. Enter correct company code → verify company chip appears + all form fields auto-fill
6. Click × on chip → verify chip clears, fields clear, code input returns
7. Try submitting with Tour Company selected but no code entered → verify error
8. Go to `/wines` → verify same behavior in the wine form
9. Turn OFF setting → verify dropdown returns on both forms
