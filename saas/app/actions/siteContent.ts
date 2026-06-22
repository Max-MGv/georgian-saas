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
