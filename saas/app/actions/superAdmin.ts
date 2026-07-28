'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Prisma } from '@prisma/client'
import { parseTenantTheme, resolveTenantTheme, type PresetId } from '@/lib/themePresets'
import { LEGAL_CONTENT_EN, LEGAL_CONTENT_KA, LEGAL_LABELS } from '@/lib/legalContent'

function friendlyUniqueConstraintError(e: unknown): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = (e.meta?.target as string[] | undefined)?.[0]
    const field = target === 'domain' ? 'domain' : target === 'slug' ? 'slug' : 'domain or slug'
    return new Error(`That ${field} is already used by another tenant. Choose a different one.`)
  }
  return e instanceof Error ? e : new Error('Something went wrong')
}

// ── Tenant actions ───────────────────────────────────────────────

export async function getTenants() {
  await requireSuperAdmin()
  const tenants = await db.tenant.findMany({ orderBy: { createdAt: 'asc' } })

  const stats = await Promise.all(
    tenants.map(async t => {
      const [orderCount, companyCount, wineOrderCount] = await Promise.all([
        db.order.count({ where: { tenantId: t.id } }),
        db.company.count({ where: { tenantId: t.id, isIndividual: false } }),
        db.wineOrder.count({ where: { tenantId: t.id } }),
      ])
      return { tenantId: t.id, orderCount, companyCount, wineOrderCount }
    })
  )

  return tenants.map(t => {
    const s = stats.find(s => s.tenantId === t.id)!
    return {
      id: t.id,
      name: t.name,
      domain: t.domain,
      slug: t.slug,
      createdAt: t.createdAt.toISOString(),
      primaryColor: resolveTenantTheme(t.theme).brand,
      orderCount: s.orderCount,
      companyCount: s.companyCount,
      wineOrderCount: s.wineOrderCount,
    }
  })
}

export async function getTenant(id: string) {
  await requireSuperAdmin()
  const t = await db.tenant.findUnique({ where: { id } })
  if (!t) return null
  const { presetId, primaryColorOverride } = parseTenantTheme(t.theme)
  return {
    id: t.id,
    name: t.name,
    domain: t.domain,
    slug: t.slug,
    presetId,
    primaryColorOverride,
    logoUrl: t.logoUrl ?? null,
    logoAlt: t.logoAlt ?? '',
    faviconUrl: t.faviconUrl ?? null,
    displayName: t.displayName ?? '',
    modulesBooking: t.modulesBooking,
    modulesWineOrders: t.modulesWineOrders,
    modulesPublicSite: t.modulesPublicSite,
    modulesLegalPages: t.modulesLegalPages,
  }
}

export async function createTenant(data: {
  name: string
  domain: string
  slug: string
  presetId: PresetId
  primaryColorOverride?: string
  logoUrl?: string | null
  logoAlt?: string
  faviconUrl?: string | null
  displayName?: string
  modulesBooking: boolean
  modulesWineOrders: boolean
  modulesPublicSite: boolean
  modulesLegalPages: boolean
}) {
  await requireSuperAdmin()
  let tenant
  try {
    tenant = await db.tenant.create({
      data: {
        name: data.name,
        domain: data.domain.toLowerCase().trim(),
        slug: data.slug.toLowerCase().trim(),
        theme: { v: 1, presetId: data.presetId, primaryColorOverride: data.primaryColorOverride },
        logoUrl: data.logoUrl ?? null,
        logoAlt: data.logoAlt ?? null,
        faviconUrl: data.faviconUrl ?? null,
        displayName: data.displayName ?? null,
        modulesBooking: data.modulesBooking,
        modulesWineOrders: data.modulesWineOrders,
        modulesPublicSite: data.modulesPublicSite,
        modulesLegalPages: data.modulesLegalPages,
      },
    })
  } catch (e) {
    throw friendlyUniqueConstraintError(e)
  }
  // Seed default legal text (both locales) so a brand-new tenant never shows a
  // blank/English-only Georgian toggle for Terms/Privacy/Returns — see #128.
  await Promise.all(
    (Object.keys(LEGAL_CONTENT_EN) as (keyof typeof LEGAL_CONTENT_EN)[]).flatMap(key => [
      db.siteContent.create({ data: { key, section: 'legal', label: LEGAL_LABELS[key], locale: 'en', value: LEGAL_CONTENT_EN[key], tenantId: tenant.id } }),
      db.siteContent.create({ data: { key, section: 'legal', label: LEGAL_LABELS[key], locale: 'ka', value: LEGAL_CONTENT_KA[key], tenantId: tenant.id } }),
    ])
  )
  revalidatePath('/super-admin/tenants')
  return { id: tenant.id }
}

export async function updateTenant(id: string, data: {
  name: string
  domain: string
  slug: string
  presetId: PresetId
  primaryColorOverride?: string
  logoUrl?: string | null
  logoAlt?: string
  faviconUrl?: string | null
  displayName?: string
  modulesBooking: boolean
  modulesWineOrders: boolean
  modulesPublicSite: boolean
  modulesLegalPages: boolean
}) {
  await requireSuperAdmin()
  try {
    await db.tenant.update({
      where: { id },
      data: {
        name: data.name,
        domain: data.domain.toLowerCase().trim(),
        slug: data.slug.toLowerCase().trim(),
        theme: { v: 1, presetId: data.presetId, primaryColorOverride: data.primaryColorOverride },
        logoUrl: data.logoUrl ?? null,
        logoAlt: data.logoAlt ?? null,
        faviconUrl: data.faviconUrl ?? null,
        displayName: data.displayName ?? null,
        modulesBooking: data.modulesBooking,
        modulesWineOrders: data.modulesWineOrders,
        modulesPublicSite: data.modulesPublicSite,
        modulesLegalPages: data.modulesLegalPages,
      },
    })
  } catch (e) {
    throw friendlyUniqueConstraintError(e)
  }
  revalidatePath('/super-admin/tenants')
  revalidatePath(`/super-admin/tenants/${id}`)
}

export async function deleteTenant(id: string) {
  await requireSuperAdmin()
  const [orderCount, companyCount, wineOrderCount, wineCount] = await Promise.all([
    db.order.count({ where: { tenantId: id } }),
    db.company.count({ where: { tenantId: id } }),
    db.wineOrder.count({ where: { tenantId: id } }),
    db.wine.count({ where: { tenantId: id } }),
  ])
  if (orderCount > 0 || companyCount > 0 || wineOrderCount > 0 || wineCount > 0) {
    throw new Error(
      `Cannot delete: tenant has ${orderCount} orders, ${companyCount} companies, ${wineOrderCount} wine orders, and ${wineCount} wines. Remove all data first.`
    )
  }
  await db.tenant.delete({ where: { id } })
  revalidatePath('/super-admin/tenants')
}

export type DomainCheckResult =
  | { status: 'ok'; resolvedSlug: string }
  | { status: 'wrong-tenant'; resolvedSlug: string }
  | { status: 'no-tenant' }
  | { status: 'not-our-app'; httpStatus: number }
  | { status: 'unreachable'; message: string }

// Fetches https://{domain}/ and reads the x-resolved-tenant response header
// that proxy.ts stamps on every page, so the super-admin form can show whether
// a domain actually reaches this platform and which tenant it resolves to.
export async function checkTenantDomain(domain: string, expectedTenantId: string): Promise<DomainCheckResult> {
  await requireSuperAdmin()

  const tenant = await db.tenant.findUnique({ where: { id: expectedTenantId }, select: { slug: true } })
  if (!tenant) throw new Error('Tenant not found')

  const cleaned = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!cleaned) throw new Error('Enter a domain first')

  let res: Response
  try {
    res = await fetch(`https://${cleaned}/`, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    const message = e instanceof Error && e.name === 'TimeoutError'
      ? 'Timed out after 8s — domain may not exist or is not responding'
      : 'Could not connect — check the domain is spelled correctly and exists in Vercel'
    return { status: 'unreachable', message }
  }

  const resolved = res.headers.get('x-resolved-tenant')
  if (!resolved) return { status: 'not-our-app', httpStatus: res.status }
  if (resolved === 'none') return { status: 'no-tenant' }
  if (resolved !== tenant.slug) return { status: 'wrong-tenant', resolvedSlug: resolved }
  return { status: 'ok', resolvedSlug: resolved }
}

// ── User actions (Supabase Admin API) ───────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const authHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

type SupabaseUser = {
  id: string
  email: string
  app_metadata: { role?: string; tenantId?: string }
  created_at: string
  last_sign_in_at?: string
}

export async function listAdminUsers(): Promise<SupabaseUser[]> {
  await requireSuperAdmin()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: authHeaders,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch users')
  const body = await res.json() as { users: SupabaseUser[] }
  return body.users
}

export async function setUserTenant(userId: string, tenantId: string) {
  await requireSuperAdmin()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ app_metadata: { tenantId, role: null } }),
  })
  if (!res.ok) throw new Error(`Failed to update user: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

export async function setUserSuperAdmin(userId: string) {
  await requireSuperAdmin()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ app_metadata: { role: 'super_admin', tenantId: null } }),
  })
  if (!res.ok) throw new Error(`Failed to update user: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

export async function removeUserAdminRole(userId: string) {
  await requireSuperAdmin()
  // Guard: don't allow demoting yourself
  const supabase = await createClient()
  const { data: { user: me } } = await supabase.auth.getUser()
  if (me?.id === userId) throw new Error('You cannot remove your own admin access.')

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ app_metadata: { role: null, tenantId: null } }),
  })
  if (!res.ok) throw new Error(`Failed to update user: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

export async function setUserPassword(userId: string, newPassword: string) {
  await requireSuperAdmin()
  if (newPassword.length < 6) throw new Error('Password must be at least 6 characters.')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ password: newPassword }),
  })
  if (!res.ok) throw new Error(`Failed to set password: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

export async function createAdminUser(data: {
  email: string
  password: string
  mode: 'super' | 'tenant'
  tenantId?: string
}) {
  await requireSuperAdmin()
  const appMetadata = data.mode === 'super'
    ? { role: 'super_admin' }
    : { tenantId: data.tenantId }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: appMetadata,
    }),
  })
  if (!res.ok) throw new Error(`Failed to create user: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

// ── Cross-tenant orders/bookings activity (read-only) ────────────
// Deliberately bypasses withTenantDb — same pattern as getTenants() stats above.
// `db` connects as the Postgres superuser, which is exempt from RLS by design.
// No write actions here on purpose: edit/delete/status-change stay on each
// tenant's own /admin pages, which the RLS architecture is built around.

export async function getAllBookings() {
  await requireSuperAdmin()
  const [orders, tenants] = await Promise.all([
    db.order.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 500,
    }),
    db.tenant.findMany({ select: { id: true, name: true, domain: true } }),
  ])
  const tenantMap = new Map(tenants.map(t => [t.id, t]))

  return orders.map(o => {
    const tenant = o.tenantId ? tenantMap.get(o.tenantId) : undefined
    return {
      id: o.id,
      status: o.status,
      date: o.date.toISOString(),
      timeSlot: o.timeSlot,
      bookingType: o.bookingType,
      visitType: o.visitType,
      guestCount: o.guestCount,
      name: o.name,
      surname: o.surname,
      totalPrice: o.totalPrice,
      companyName: o.company?.name ?? null,
      tenantName: tenant?.name ?? 'Unknown',
      tenantDomain: tenant?.domain ?? null,
    }
  })
}

export async function getAllWineOrders() {
  await requireSuperAdmin()
  const [orders, tenants] = await Promise.all([
    db.wineOrder.findMany({
      include: { wineItems: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    db.tenant.findMany({ select: { id: true, name: true, domain: true } }),
  ])
  const tenantMap = new Map(tenants.map(t => [t.id, t]))

  return orders.map(o => {
    const tenant = o.tenantId ? tenantMap.get(o.tenantId) : undefined
    const displayTotal = o.totalAmount ?? o.wineItems.reduce((sum, i) => sum + i.quantity * i.priceSnapshot, 0)
    const bottleCount = o.wineItems.reduce((sum, i) => sum + i.quantity, 0)
    return {
      id: o.id,
      businessName: o.businessName,
      contactName: o.contactName,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      displayTotal: Math.round(displayTotal),
      bottleCount,
      tenantName: tenant?.name ?? 'Unknown',
      tenantDomain: tenant?.domain ?? null,
    }
  })
}
