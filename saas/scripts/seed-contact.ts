import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DOMAIN = 'nikalasmarani.ge'
const VALUES: Record<string, string> = {
  contact_email:     'nikalasmarani@gmail.com',
  contact_phone:     '+995 599 96 33 17',
  contact_address:   'Kardanakhi, Gurjaani',
  contact_facebook:  'https://www.facebook.com/nikalasmarani/',
  contact_instagram: 'https://www.instagram.com/nikalas_marani/',
}

async function main() {
  const tenant = await db.tenant.findUnique({ where: { domain: DOMAIN } })
  if (!tenant) { console.error('Tenant not found'); process.exit(1) }

  for (const [key, value] of Object.entries(VALUES)) {
    await db.setting.upsert({
      where: { key_tenantId: { key, tenantId: tenant.id } },
      update: { value },
      create: { key, value, tenantId: tenant.id },
    })
    console.log(`  ✓ ${key} = ${value}`)
  }

  console.log(`\n✅ Seeded contact info for ${DOMAIN}`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
