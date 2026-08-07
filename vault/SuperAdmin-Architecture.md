# Super-Admin Panel — Architecture & Reference

**Route:** `/super-admin`  
**Who can access:** Only `max.mghvdliashvili@gmail.com` (or any account with `role: super_admin` in Supabase)  
**What it is:** A separate platform-management layer above all tenant admin panels. Dark indigo-themed, completely isolated from tenant-specific data.

---

## How Access Control Works

There are two layers of protection, both must pass:

### Layer 1 — Proxy (edge, before the page loads)
File: `saas/proxy.ts`

```
User visits /super-admin
    ↓
Proxy calls supabase.auth.getUser()
    ↓
Not logged in?          → redirect to /admin/login
Logged in, not super?   → redirect to /admin
Logged in, super_admin? → let through ✓
```

### Layer 2 — Layout (server component, double-check)
File: `saas/app/super-admin/layout.tsx`

Even if someone bypasses the proxy somehow, the layout calls `supabase.auth.getUser()` again and redirects to `/admin` if the role check fails.

### How the role is set
A user's role is stored in Supabase `app_metadata`:
```json
{ "role": "super_admin" }
```

To set this, run from the `saas/` folder:
```bash
npm run set-admin -- --email your@email.com --super
```

After running the script, sign out and back in so the new session token reflects the change.

---

## File Structure

```
saas/
├── lib/
│   └── requireSuperAdmin.ts          # Auth helper — throws if not super_admin
│
├── app/
│   ├── actions/
│   │   └── superAdmin.ts             # All server actions (tenant CRUD + user management)
│   │
│   └── super-admin/
│       ├── layout.tsx                # Dark layout + auth guard + nav
│       ├── page.tsx                  # Redirects to /super-admin/tenants
│       ├── ColorPicker.tsx           # Reusable color wheel component
│       │
│       ├── tenants/
│       │   ├── page.tsx              # Server: fetch all tenants + stats
│       │   ├── TenantsClient.tsx     # Client: tenant list with edit/delete
│       │   ├── TenantFormClient.tsx  # Client: shared add/edit form
│       │   ├── new/
│       │   │   └── page.tsx          # "New Tenant" page shell
│       │   └── [id]/
│       │       └── page.tsx          # "Edit Tenant" page — fetches tenant by ID
│       │
│       └── users/
│           ├── page.tsx              # Server: fetch all Supabase users + tenants
│           └── UsersClient.tsx       # Client: user list + role management + create
```

---

## Pages

### `/super-admin/tenants` — Tenant List

Shows all tenants in the database as cards:
- Brand color swatch (with glow effect matching the color)
- Tenant name + domain
- Slug (monospace badge)
- Order count + company count (fetched live)
- Created date
- Edit button → goes to `/super-admin/tenants/[id]`
- Delete button (only visible if tenant has 0 orders AND 0 companies — safety guard)

### `/super-admin/tenants/new` — Add Tenant

Form fields:
- **Name** — the winery/business name (e.g. "Nikalas Marani")
- **Domain** — the custom domain they'll use (e.g. "nikalasmarani.ge")
- **Slug** — short URL-safe ID, auto-fills from name while untouched (e.g. "nikalas-marani")
- **Primary color** — brand color picker (opens color wheel)
- **Hover color** — slightly darker shade for hover states

Live preview panel on the right updates in real time as you pick colors — shows a mock nav bar, buttons, and accent text in the chosen brand color.

On save: creates a row in the `tenants` table with the theme JSON.

### `/super-admin/tenants/[id]` — Edit Tenant

Same form as above, pre-filled with the existing tenant's data. Save calls `updateTenant` which updates the DB row and clears the proxy's tenant cache (so new colors take effect on next request).

### `/super-admin/users` — User Management

Lists **all Supabase auth users** (not just admins — all accounts). Each row shows:
- Avatar initial
- Email address
- "you" badge if it's your own account
- Join date + last sign-in date
- Role badge:
  - **Indigo** → `super_admin`
  - **Green** → tenant admin (shows the tenant name)
  - **Gray** → no admin access

Actions per user:
- **Change role** — opens an inline form to either assign to a tenant or make super_admin
- **Remove access** — clears their `app_metadata` (disabled for your own account)

**Create new admin user** button opens a form:
- Email
- Password (you set it — they can change it later)
- Access level: Tenant admin (pick tenant from dropdown) or Super admin
- Creates the Supabase account AND sets `app_metadata` in one step

This fully replaces the `npm run set-admin` terminal script for day-to-day use.

---

## Color Picker Component

File: `saas/app/super-admin/ColorPicker.tsx`

A click-to-open popover containing:
1. `HexColorPicker` from `react-colorful` — a proper color wheel with saturation/brightness area and hue slider
2. Hex text input for manual entry (`#rrggbb` format)
3. A color preview strip at the bottom

Closes on outside click. Updates the parent in real time as you drag the picker.

---

## Server Actions (`superAdmin.ts`)

All actions call `requireSuperAdmin()` first — they throw `Forbidden` if the caller isn't super_admin.

### Tenant actions

| Function | What it does |
|---|---|
| `getTenants()` | Returns all tenants with order + company counts |
| `getTenant(id)` | Returns one tenant by ID |
| `createTenant(data)` | Inserts a new tenant row with theme JSON |
| `updateTenant(id, data)` | Updates tenant row + revalidates pages |
| `deleteTenant(id)` | Deletes tenant — **blocks if tenant has any orders or companies** |

### User actions (Supabase Admin REST API)

| Function | What it does |
|---|---|
| `listAdminUsers()` | Fetches all Supabase users via admin API |
| `setUserTenant(userId, tenantId)` | Sets `app_metadata: { tenantId }` |
| `setUserSuperAdmin(userId)` | Sets `app_metadata: { role: 'super_admin' }` |
| `removeUserAdminRole(userId)` | Clears `app_metadata: {}` — blocks self-demotion |
| `createAdminUser(data)` | Creates Supabase user + sets metadata in one call |

These functions call the Supabase Admin REST API directly (`/auth/v1/admin/users`) using the `SUPABASE_SERVICE_ROLE_KEY` from `.env`. Same approach as the existing `set-admin-metadata.ts` script, just exposed as server actions callable from the UI.

---

## How Onboarding a New Client Works (with this panel)

1. Go to `/super-admin/tenants` → click **+ New Tenant**
2. Enter: client name, their domain, a slug, their brand color
3. Save → tenant row created in DB
4. Go to `/super-admin/users` → click **+ New Admin User**
5. Enter their email + a temporary password + assign to the tenant you just created
6. Share the password with them — they log in at their domain's `/admin/login`
7. Add their domain to Vercel (Settings → Domains) and have them point DNS at Vercel
8. Their instance is live — from here, `/admin/onboarding` walks them through filling in their own business data (companies, wines, payment/IBAN, contact info, menu items, masterclasses, per whichever modules are on); see [[Plan-OnboardingFlow]] (#127)

This replaces all the manual DB inserts and terminal script steps previously required.

---

## Proxy Changes Summary

Added to `saas/proxy.ts`:

```typescript
const isSuperAdmin = user?.app_metadata?.role === 'super_admin'
const isSuperAdminRoute = request.nextUrl.pathname.startsWith('/super-admin')

if (isSuperAdminRoute) {
  if (!user) return redirect('/admin/login')
  if (!isSuperAdmin) return redirect('/admin')
}
```

The existing `/admin` guard was also simplified — `isSuperAdmin` is now computed once at the top and reused across all checks.

---

## Admin Nav Link

In `saas/app/admin/layout.tsx`, a **"⬡ Platform"** indigo button appears in the top-right corner of the regular admin nav — but **only when you're logged in as super_admin**. Regular tenant admins never see it.

---

## Dependencies Added

| Package | Version | Why |
|---|---|---|
| `react-colorful` | latest | Color wheel UI component |
