---
tags: [plan, companies, auth]
---

# Plan: Company Access Codes (Soft Auth)

**Status:** In progress  
**Roadmap slot:** v1.7  
**Session started:** 2026-06-22

---

## Goal

Tour companies get a short access code (e.g. `MARANI42`). When they select their company name on the booking or wine order form, a popup asks for the code. Correct code → form auto-fills with their stored profile. Wrong code → inline error. Admin manages everything from the Companies page.

---

## New DB fields on Company

| Field | Type | Purpose |
|---|---|---|
| `contactName` | `String?` | Contact person full name — auto-fills booking form name fields |
| `contactPhone` | `String?` | Contact phone — auto-fills phone field |
| `contactEmail` | `String?` | Contact email — auto-fills email field |
| `address` | `String?` | Company address — auto-fills wine order address field |
| `accessCode` | `String?` | The soft-auth code (e.g. `MARANI42`); null = no code set, form works as before |

---

## Steps

### Step 1 — DB schema + migration
- Add 5 new nullable fields to Company model in `schema.prisma`
- Run `prisma db push`

### Step 2 — Server actions
- `updateCompany` — extend to accept all new profile fields
- `verifyCompanyCode(companyId, code)` — public action (no requireAdmin); returns `{ contactName, contactPhone, contactEmail, identificationCode, address }` on match, `{ error }` on mismatch
- `regenerateAccessCode(companyId)` — admin action; generates new 8-char alphanumeric, saves, returns new code
- `generateCode()` utility — 8-char uppercase alphanumeric (e.g. `XK9F2M48`)

### Step 3 — Admin: Companies slide-over panel
- Replace inline edit (current 2-field inline) with a full slide-over side panel (same pattern as order quick-edit)
- Panel fields: Company name, ID code, Contact name, Contact phone, Contact email, Address, Access code
- Access code row: shows current code (obscured by default), show/hide toggle, copy button, Regenerate button
- On company creation: auto-generate a code immediately
- All existing price tier functionality stays in the expandable row as-is

### Step 4 — Booking form: code popup
- When user selects a company AND that company has an `accessCode` → show modal popup
- Popup UI: title "Enter your company code", password-style input with show/hide toggle, "Remember this device" checkbox (default checked), Confirm button, small "I'm not a company rep" link at bottom
- On correct code: close popup, auto-fill firstName + lastName (split contactName on first space), phone, email from company profile; fields remain editable
- On wrong code: inline error "Incorrect code — please try again or contact the winery"; input stays, user can retry
- No attempt limits (soft auth)
- localStorage key: `company_auth_{tenantId}_{companyId}` → `{ expiry: Date+30days }`; on page load, if valid entry exists → skip popup, auto-fill directly
- If company has no accessCode set → no popup, form works as today

### Step 5 — Wine orders form: company selector
- Add company dropdown at top of `WineCatalogueClient.tsx` (above the existing manual fields)
- Same popup flow as booking form
- Auto-fills: contactName → contactName field, contactPhone → contactPhone field, identificationCode → llcId field, address → address field
- If no company selected → all fields manual as today
- Companies list fetched server-side in `wines/page.tsx`, passed as prop

### Step 6 — Vault updates
- Update `SessionLog.md`, `FeatureLog.md`, `Roadmap.md`

---

## Key decisions

- Code format: 8-char uppercase alphanumeric, auto-generated; admin can overwrite to anything (e.g. `MARANI42`)
- Plain-text storage: this is soft auth (prevent accidental impersonation, not security hardening); no hashing needed
- Session memory: localStorage per company per tenant, 30-day expiry, user-controllable via "Remember this device" checkbox
- Escape hatch: "I'm not a company rep" link dismisses popup and resets booking type to INDIVIDUAL
- No code = no popup: old companies without a code keep working exactly as before

---

## Files to change

| File | Change |
|---|---|
| `saas/prisma/schema.prisma` | Add 5 fields to Company model |
| `saas/app/actions/companies.ts` | Extend `updateCompany`; add `verifyCompanyCode`, `regenerateAccessCode` |
| `saas/app/admin/companies/CompaniesClient.tsx` | Replace inline edit with slide-over panel |
| `saas/components/BookingForm.tsx` | Code popup + auto-fill logic + localStorage |
| `saas/app/(site)/wines/WineCatalogueClient.tsx` | Add company dropdown + same popup + auto-fill |
| `saas/app/(site)/wines/page.tsx` | Fetch companies, pass as prop |
