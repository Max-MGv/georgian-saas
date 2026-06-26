/**
 * Sets displayName and logoUrl on the Nikalas Marani tenant row.
 * Run: npx tsx scripts/seed-branding.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DOMAIN = 'nikalasmarani.ge'

async function main() {
  const tenant = await db.tenant.findUnique({ where: { domain: DOMAIN } })
  if (!tenant) {
    console.error(`Tenant not found for domain: ${DOMAIN}`)
    process.exit(1)
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      displayName: 'Nikalas Marani',
      logoUrl: '/icons/logo-dark.svg',
      logoAlt: 'Nikalas Marani',
    },
  })

  console.log(`✓ Seeded branding for tenant ${tenant.id} (${DOMAIN})`)
}

main().catch(console.error).finally(() => db.$disconnect())
