// One-time backfill: rewrites tenant.theme rows from the pre-preset shape
// ({ primaryColor, primaryHover }) into the explicit preset shape
// ({ v: 1, presetId, primaryColorOverride }), mapped onto the "cream" preset
// so no tenant's live site changes. Safe to re-run — rows already in the new
// shape are skipped. Reads already tolerate the old shape (see
// lib/themePresets.ts resolveTenantTheme), so this is cleanup, not a fix.
//
// Run: npx tsx scripts/migrate-theme-shape.ts

import { PrismaClient } from '@prisma/client'
import { parseTenantTheme, DEFAULT_PRESET_ID } from '../lib/themePresets'

const db = new PrismaClient()

function alreadyMigrated(theme: unknown): boolean {
  return !!theme && typeof theme === 'object' && 'presetId' in (theme as Record<string, unknown>)
}

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, theme: true } })
  let migrated = 0

  for (const t of tenants) {
    if (alreadyMigrated(t.theme)) continue
    const { presetId, primaryColorOverride } = parseTenantTheme(t.theme)
    await db.tenant.update({
      where: { id: t.id },
      data: { theme: { v: 1, presetId, primaryColorOverride } },
    })
    console.log(`Migrated "${t.name}" -> preset ${presetId}${primaryColorOverride ? ` (override ${primaryColorOverride})` : ''}`)
    migrated++
  }

  console.log(`Done. ${migrated}/${tenants.length} tenant(s) migrated (default preset: ${DEFAULT_PRESET_ID}).`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
