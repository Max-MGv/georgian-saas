/**
 * Adds the access codes, guides and representatives that `lib/demoSeed.ts` now
 * seeds, to a tenant that was filled *before* it did — without the destructive
 * re-seed that would otherwise be needed.
 *
 * **Why this exists.** Staging Winery's Playwright fixture companies
 * (`Test Company # 1`, `Wine Test Company`, `Cookie Company`) were removed by
 * the Feature 191 wipe on 2026-09-18 and the tenant was refilled from the demo
 * seed. That left five spec files pointing at companies that no longer exist —
 * including both payment specs. The fix is to point those specs at the seeded
 * companies instead, which needs those companies to carry an access code (the
 * specs deliberately exercise the code-entry popup) and, for the guide spec, a
 * company that can hold guides.
 *
 * `seedDemoTenant` now produces all of that, but applying it to Staging Winery
 * means deleting every order there first. This script reaches the same end
 * state additively, so the tenant's existing orders survive.
 *
 * **Idempotent.** An access code that is already set is left alone (never
 * overwritten — someone may have set it deliberately), and a guide or
 * representative whose code already exists in the tenant is skipped. Safe to
 * re-run.
 *
 * **Refuses the demo tenant.** Access codes must never land on
 * `vineworks-demo`: `BookingForm.tsx` shows the "Enter your company code"
 * popup for any company that has one, and a demo visitor has no way to obtain
 * a code — the booking form is the first stop on the guided tour, so a code
 * prompt there is a dead end. Same reasoning as `seedDemoTenant`'s own
 * `seedAccessCodes` gate.
 *
 * Usage, from `saas/`:
 *   npx tsx scripts/backfill-test-fixtures.ts [--slug staging-winery] [--dry-run]
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { BOOKING_COMPANIES, WINE_COMPANIES, DEMO_SLUG } from '../lib/demoSeed'

const db = new PrismaClient()

/**
 * Every guide code this seed has ever owned, including ones no longer assigned
 * to any company. Deletion is scoped to this set so the script can retract its
 * own mistakes without ever touching a guide a real admin created.
 */
const ALL_SEED_GUIDE_CODES = new Set([
  'KWRGUIDE1', 'KWRGUIDE2', 'TTCGUIDE1', 'CVTGUIDE1', 'CVTGUIDE2', 'AVTGUIDE1',
  'SRJGUIDE1', 'SRJGUIDE2',
])

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  const slug = arg('slug') ?? 'staging-winery'
  const dryRun = process.argv.includes('--dry-run')

  if (slug === DEMO_SLUG) {
    throw new Error(
      `Refusing to run against the demo tenant ('${DEMO_SLUG}'). Access codes there would ` +
      `gate the booking form behind a code no demo visitor can obtain — see this file's header.`
    )
  }

  const tenant = await db.tenant.findFirst({ where: { slug }, select: { id: true, name: true } })
  if (!tenant) throw new Error(`No tenant with slug '${slug}'.`)
  console.log(`Tenant: ${tenant.name} (${slug})${dryRun ? '  [DRY RUN — nothing will be written]' : ''}\n`)

  // Guides and representatives are both CompanyPerson rows now (Plan-ContactRoles
  // Chunk 1) — 'guide' and 'contact_person' are the two system roles every tenant
  // has, seeded once and never deleted. Fail loudly if they're missing rather than
  // silently writing people nobody's picker will ever show.
  const [guideRole, contactPersonRole] = await Promise.all([
    db.contactRole.findFirst({ where: { tenantId: tenant.id, key: 'guide' } }),
    db.contactRole.findFirst({ where: { tenantId: tenant.id, key: 'contact_person' } }),
  ])
  if (!guideRole || !contactPersonRole) {
    throw new Error(`Tenant '${slug}' is missing its 'guide'/'contact_person' ContactRole rows.`)
  }

  let codesSet = 0, guidesAdded = 0, guidesUpdated = 0, repsAdded = 0, skipped = 0

  for (const spec of BOOKING_COMPANIES) {
    const company = await db.company.findFirst({
      where: { tenantId: tenant.id, name: spec.name },
      select: { id: true, name: true, accessCode: true },
    })
    if (!company) {
      console.log(`  ⚠ ${spec.name} — not on this tenant, skipped`)
      skipped++
      continue
    }

    console.log(`  ${company.name}`)

    if (company.accessCode) {
      console.log(`      code: already set (${company.accessCode}) — left alone`)
    } else {
      console.log(`      code: ${spec.accessCode}  ← setting`)
      if (!dryRun) {
        await db.company.update({ where: { id: company.id }, data: { accessCode: spec.accessCode } })
      }
      codesSet++
    }

    // The code pool is global across Company.accessCode and CompanyPerson.code
    // (see MaintenanceNotes #26 / the unique indexes in the Chunk 1 migration),
    // so a clash lookup by code alone is enough — no need to also filter by role.
    for (const g of spec.guides) {
      const clash = await db.companyPerson.findFirst({ where: { code: g.code, company: { tenantId: tenant.id } } })
      if (clash) {
        // Reconcile, don't just skip. The code is the identity; the name and phone
        // are attributes that can be corrected in the spec later — as one was on
        // 2026-09-19, when a seeded guide turned out to share a name with its own
        // company's contact person, making the "I am not on this list" fallback
        // impossible to tell apart from picking that guide. Without this branch the
        // spec change could never reach a tenant that had already been backfilled.
        if (clash.name !== g.name || (clash.phone ?? null) !== (g.phone ?? null)) {
          console.log(`      guide ${g.code}: updating "${clash.name}" -> "${g.name}"`)
          if (!dryRun) {
            await db.companyPerson.update({ where: { id: clash.id }, data: { name: g.name, phone: g.phone ?? null } })
          }
          guidesUpdated++
        } else {
          console.log(`      guide ${g.code}: exists — skipped`)
        }
        continue
      }
      console.log(`      guide ${g.code} (${g.name})  ← adding`)
      if (!dryRun) {
        await db.companyPerson.create({ data: { companyId: company.id, roleId: guideRole.id, name: g.name, phone: g.phone ?? null, code: g.code } })
      }
      guidesAdded++
    }

    for (const r of spec.representatives) {
      const clash = await db.companyPerson.findFirst({ where: { code: r.code, company: { tenantId: tenant.id } } })
      if (clash) { console.log(`      rep ${r.code}: exists — skipped`); continue }
      console.log(`      rep ${r.code} (${r.name})  ← adding`)
      if (!dryRun) {
        await db.companyPerson.create({
          data: { companyId: company.id, roleId: contactPersonRole.id, name: r.name, email: r.email ?? null, phone: r.phone ?? null, code: r.code },
        })
      }
      repsAdded++
    }
  }

  // Wine-order companies take an access code too. They have no guides and
  // never can (guides/reps are scoped to the booking flow), so there is no
  // retire-the-code hazard here — the wine flow resolves codes through
  // findCompanyByCode() alone.
  for (const spec of WINE_COMPANIES) {
    const company = await db.company.findFirst({
      where: { tenantId: tenant.id, name: spec.name },
      select: { id: true, name: true, accessCode: true },
    })
    if (!company) {
      console.log(`  ! ${spec.name} - not on this tenant, skipped`)
      skipped++
      continue
    }
    console.log(`  ${company.name}`)
    if (company.accessCode) {
      console.log(`      code: already set (${company.accessCode}) - left alone`)
    } else {
      console.log(`      code: ${spec.accessCode}  <- setting`)
      if (!dryRun) {
        await db.company.update({ where: { id: company.id }, data: { accessCode: spec.accessCode } })
      }
      codesSet++
    }
  }

  // Converge, don't just add. The first run of this script (2026-09-19) seeded
  // guides onto every booking company, which silently retired every company
  // access code — `verifyBookingCode()` falls back to the company code only
  // when a company has zero guides (Plan-CompanyGuidesAndReps Chunk 1 & 5).
  // Four specs use that path and broke at once. So a guide whose code belongs
  // to this seed's own namespace, but is no longer assigned in the spec, is
  // removed. Only seed-owned codes are ever deleted — a guide someone added by
  // hand is never touched.
  const current = new Set(BOOKING_COMPANIES.flatMap(c => c.guides.map(g => g.code)))
  const staleSeeded = (await db.companyPerson.findMany({
    where: { roleId: guideRole.id, company: { tenantId: tenant.id } },
    select: { id: true, code: true, name: true, company: { select: { name: true } } },
  })).filter(g => g.code !== null && ALL_SEED_GUIDE_CODES.has(g.code) && !current.has(g.code))

  for (const g of staleSeeded) {
    console.log(`  ${g.company.name}`)
    console.log(`      guide ${g.code} (${g.name})  <- removing (no longer in the seed spec)`)
    if (!dryRun) await db.companyPerson.delete({ where: { id: g.id } })
  }

  console.log(
    `\n${dryRun ? 'Would set' : 'Set'} ${codesSet} access code(s), ` +
    `${dryRun ? 'add' : 'added'} ${guidesAdded} guide(s) and ${repsAdded} representative(s)` +
    (guidesUpdated ? `, ${dryRun ? 'would update' : 'updated'} ${guidesUpdated} guide(s)` : '') +
    (staleSeeded.length ? `, ${dryRun ? 'would remove' : 'removed'} ${staleSeeded.length} stale seeded guide(s)` : '') +
    (skipped ? `; ${skipped} company(ies) not present on this tenant.` : '.')
  )
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) }).finally(() => db.$disconnect())
