'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { SETTING_DEFAULTS, type SettingsMap } from '@/lib/settings'

/**
 * Read a single setting for the current request's tenant.
 *
 * Still the right call when a page needs only one or two settings. When a page
 * needs many, use `getAllSettings()` instead — one query beats N.
 */
export async function getSetting(key: string): Promise<string> {
  const tenantId = await getTenantId()
  const row = await withTenantDb(tenantId, tx =>
    tx.setting.findUnique({ where: { key_tenantId: { key, tenantId } } })
  )
  return row?.value ?? SETTING_DEFAULTS[key] ?? ''
}

/**
 * Read ALL of a tenant's settings in a single query.
 *
 * Takes `tenantId` explicitly rather than calling `getTenantId()` internally,
 * because `getTenantId()` reads `headers()` — and Next 16 forbids touching
 * `headers()`/`cookies()` inside a cache scope. Passing it in is what makes this
 * function wrappable in `unstable_cache` later (Plan-Performance chunk 2), with
 * tenantId in the cache key.
 *
 * ⚠️ SERVER-ONLY — the result includes payment details. Read the keys you need
 * and pass those individually; never hand the whole map to a client component.
 */
export async function getAllSettings(tenantId: string): Promise<SettingsMap> {
  const rows = await withTenantDb(tenantId, tx =>
    tx.setting.findMany({ where: { tenantId }, select: { key: true, value: true } })
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export async function updateSetting(key: string, value: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.setting.upsert({
      where: { key_tenantId: { key, tenantId } },
      update: { value },
      create: { key, value, tenantId },
    })
  )
  revalidatePath('/admin', 'layout')
  revalidatePath('/admin/settings')
  revalidatePath('/admin/content')
  revalidatePath('/')
  revalidatePath('/about')
  revalidatePath('/contact')
}
