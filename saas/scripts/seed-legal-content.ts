// Backfill for #128 — seeds the default Terms/Privacy/Returns text (both
// locales) for every EXISTING tenant. New tenants created via the super-admin
// panel get this automatically (see createTenant() in app/actions/superAdmin.ts);
// this script only covers tenants that existed before that hook was added.
// Create-only — never overwrites a row a tenant admin may have already edited.
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

import { LEGAL_CONTENT_EN, LEGAL_CONTENT_KA, LEGAL_LABELS } from '../lib/legalContent'

const db = new PrismaClient()

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } })
  const byLocale = { en: LEGAL_CONTENT_EN, ka: LEGAL_CONTENT_KA } as const
  const keys = Object.keys(LEGAL_CONTENT_EN) as (keyof typeof LEGAL_CONTENT_EN)[]

  let created = 0
  let skipped = 0

  for (const tenant of tenants) {
    for (const locale of ['en', 'ka'] as const) {
      for (const key of keys) {
        const existing = await db.siteContent.findUnique({
          where: { key_locale_tenantId: { key, locale, tenantId: tenant.id } },
        })
        if (existing) { skipped++; continue }
        await db.siteContent.create({
          data: { key, section: 'legal', label: LEGAL_LABELS[key], locale, value: byLocale[locale][key], tenantId: tenant.id },
        })
        created++
      }
    }
    console.log(`✔ ${tenant.name}`)
  }

  console.log(`\nDone. ${created} rows created, ${skipped} already existed (left untouched).`)
}

main().finally(() => db.$disconnect())
