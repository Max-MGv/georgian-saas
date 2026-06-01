'use server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/requireAdmin'

export async function getContent(key: string, fallback: string, locale = 'en'): Promise<string> {
  const row = await db.siteContent.findUnique({ where: { key_locale: { key, locale } } })
  return row?.value ?? fallback
}

export async function getContentSection(section: string, locale = 'en') {
  return db.siteContent.findMany({ where: { section, locale } })
}

export async function getContentMap(section: string, locale = 'en'): Promise<Record<string, string>> {
  const rows = await db.siteContent.findMany({ where: { section, locale } })
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export async function saveContent(key: string, value: string, section: string, label: string, locale = 'en') {
  await requireAdmin()
  await db.siteContent.upsert({
    where: { key_locale: { key, locale } },
    update: { value },
    create: { key, value, section, label, locale },
  })
}

export async function saveContentSection(
  rows: { key: string; value: string; section: string; label: string; locale?: string }[]
) {
  await requireAdmin()
  await Promise.all(rows.map(r => saveContent(r.key, r.value, r.section, r.label, r.locale ?? 'en')))
}

export async function deleteContent(key: string, locale = 'en') {
  await requireAdmin()
  await db.siteContent.deleteMany({ where: { key, locale } })
}
