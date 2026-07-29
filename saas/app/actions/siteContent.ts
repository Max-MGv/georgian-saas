'use server'
import { db, withTenantDb } from '@/lib/db'
import { requireAdmin } from '@/lib/requireAdmin'
import { revalidatePath } from 'next/cache'
import { getTenantId } from '@/lib/tenant'

export async function getContent(key: string, fallback: string, locale = 'en'): Promise<string> {
  const tenantId = await getTenantId()
  const row = await withTenantDb(tenantId, tx =>
    tx.siteContent.findUnique({ where: { key_locale_tenantId: { key, locale, tenantId } } })
  )
  return row?.value ?? fallback
}

export async function getContentSection(section: string, locale = 'en') {
  const tenantId = await getTenantId()
  return withTenantDb(tenantId, tx =>
    tx.siteContent.findMany({ where: { section, locale, tenantId } })
  )
}

export async function getContentMap(section: string, locale = 'en'): Promise<Record<string, string>> {
  const tenantId = await getTenantId()
  const rows = await withTenantDb(tenantId, tx =>
    tx.siteContent.findMany({ where: { section, locale, tenantId } })
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

/**
 * Read ALL of a tenant's site content for one locale, grouped by section, in a
 * single query — replacing N separate `getContentMap()` calls on pages that
 * need more than one section.
 *
 * Takes `tenantId` and `locale` explicitly (rather than resolving the tenant
 * from `headers()` internally) so this can be wrapped in `unstable_cache` later
 * — Next 16 forbids `headers()`/`cookies()` inside a cache scope, and both
 * values need to be part of the cache key anyway. See Plan-Performance chunk 3.
 *
 * Returns `{ [section]: { [key]: value } }`. A section with no rows is simply
 * absent, so callers must handle `undefined` — use `contentSection()` below.
 */
export async function getAllContent(
  tenantId: string,
  locale = 'en'
): Promise<Record<string, Record<string, string>>> {
  const rows = await withTenantDb(tenantId, tx =>
    tx.siteContent.findMany({
      where: { locale, tenantId },
      select: { section: true, key: true, value: true },
    })
  )
  const bySection: Record<string, Record<string, string>> = {}
  for (const r of rows) {
    ;(bySection[r.section] ??= {})[r.key] = r.value
  }
  return bySection
}

export async function saveContent(key: string, value: string, section: string, label: string, locale = 'en') {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.siteContent.upsert({
      where: { key_locale_tenantId: { key, locale, tenantId } },
      update: { value },
      create: { key, value, section, label, locale, tenantId },
    })
  )
  revalidatePath('/', 'layout')
}

export async function saveContentSection(
  rows: { key: string; value: string; section: string; label: string; locale?: string }[]
) {
  await requireAdmin()
  await Promise.all(rows.map(r => saveContent(r.key, r.value, r.section, r.label, r.locale ?? 'en')))
}

export async function deleteContent(key: string, locale = 'en') {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.siteContent.deleteMany({ where: { key, locale, tenantId } })
  )
  revalidatePath('/', 'layout')
}
