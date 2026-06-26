'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ── Tenant actions ───────────────────────────────────────────────

export async function getTenants() {
  await requireSuperAdmin()
  const tenants = await db.tenant.findMany({ orderBy: { createdAt: 'asc' } })

  const stats = await Promise.all(
    tenants.map(async t => {
      const [orderCount, companyCount] = await Promise.all([
        db.order.count({ where: { tenantId: t.id } }),
        db.company.count({ where: { tenantId: t.id, isIndividual: false } }),
      ])
      return { tenantId: t.id, orderCount, companyCount }
    })
  )

  return tenants.map(t => {
    const s = stats.find(s => s.tenantId === t.id)!
    const theme = (t.theme as { primaryColor?: string; primaryHover?: string } | null) ?? {}
    return {
      id: t.id,
      name: t.name,
      domain: t.domain,
      slug: t.slug,
      createdAt: t.createdAt.toISOString(),
      primaryColor: theme.primaryColor ?? '#7c1d23',
      primaryHover: theme.primaryHover ?? '#9b2429',
      orderCount: s.orderCount,
      companyCount: s.companyCount,
    }
  })
}

export async function getTenant(id: string) {
  await requireSuperAdmin()
  const t = await db.tenant.findUnique({ where: { id } })
  if (!t) return null
  const theme = (t.theme as { primaryColor?: string; primaryHover?: string } | null) ?? {}
  return {
    id: t.id,
    name: t.name,
    domain: t.domain,
    slug: t.slug,
    primaryColor: theme.primaryColor ?? '#7c1d23',
    primaryHover: theme.primaryHover ?? '#9b2429',
    logoUrl: t.logoUrl ?? null,
    logoAlt: t.logoAlt ?? '',
    faviconUrl: t.faviconUrl ?? null,
    displayName: t.displayName ?? '',
  }
}

export async function createTenant(data: {
  name: string
  domain: string
  slug: string
  primaryColor: string
  primaryHover: string
  logoUrl?: string | null
  logoAlt?: string
  faviconUrl?: string | null
  displayName?: string
}) {
  await requireSuperAdmin()
  const tenant = await db.tenant.create({
    data: {
      name: data.name,
      domain: data.domain.toLowerCase().trim(),
      slug: data.slug.toLowerCase().trim(),
      theme: { primaryColor: data.primaryColor, primaryHover: data.primaryHover },
      logoUrl: data.logoUrl ?? null,
      logoAlt: data.logoAlt ?? null,
      faviconUrl: data.faviconUrl ?? null,
      displayName: data.displayName ?? null,
    },
  })
  revalidatePath('/super-admin/tenants')
  return { id: tenant.id }
}

export async function updateTenant(id: string, data: {
  name: string
  domain: string
  slug: string
  primaryColor: string
  primaryHover: string
  logoUrl?: string | null
  logoAlt?: string
  faviconUrl?: string | null
  displayName?: string
}) {
  await requireSuperAdmin()
  await db.tenant.update({
    where: { id },
    data: {
      name: data.name,
      domain: data.domain.toLowerCase().trim(),
      slug: data.slug.toLowerCase().trim(),
      theme: { primaryColor: data.primaryColor, primaryHover: data.primaryHover },
      logoUrl: data.logoUrl ?? null,
      logoAlt: data.logoAlt ?? null,
      faviconUrl: data.faviconUrl ?? null,
      displayName: data.displayName ?? null,
    },
  })
  revalidatePath('/super-admin/tenants')
  revalidatePath(`/super-admin/tenants/${id}`)
}

export async function deleteTenant(id: string) {
  await requireSuperAdmin()
  const [orderCount, companyCount] = await Promise.all([
    db.order.count({ where: { tenantId: id } }),
    db.company.count({ where: { tenantId: id } }),
  ])
  if (orderCount > 0 || companyCount > 0) {
    throw new Error(`Cannot delete: tenant has ${orderCount} orders and ${companyCount} companies. Remove all data first.`)
  }
  await db.tenant.delete({ where: { id } })
  revalidatePath('/super-admin/tenants')
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
    body: JSON.stringify({ app_metadata: { tenantId, role: undefined } }),
  })
  if (!res.ok) throw new Error(`Failed to update user: ${await res.text()}`)
  revalidatePath('/super-admin/users')
}

export async function setUserSuperAdmin(userId: string) {
  await requireSuperAdmin()
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ app_metadata: { role: 'super_admin', tenantId: undefined } }),
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
    body: JSON.stringify({ app_metadata: {} }),
  })
  if (!res.ok) throw new Error(`Failed to update user: ${await res.text()}`)
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
