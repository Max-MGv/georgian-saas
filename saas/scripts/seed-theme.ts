import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const result = await db.tenant.updateMany({
    where: { domain: 'nikalasmarani.ge' },
    data: { theme: { primaryColor: '#7c1d23', primaryHover: '#9b2429' } },
  })
  console.log(`Updated ${result.count} tenant(s) with Nikalas Marani theme`)
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
