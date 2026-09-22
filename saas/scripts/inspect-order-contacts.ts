/**
 * What contacts did an order actually end up with?
 *
 * A manual-testing aid, not part of the suite. Walking a form tells you what the screen did;
 * this tells you what the database got, which is the only thing that survives the session.
 *
 * Usage:
 *   npx tsx scripts/inspect-order-contacts.ts                 # the 10 most recently created
 *   npx tsx scripts/inspect-order-contacts.ts <orderId>       # one booking
 *   npx tsx scripts/inspect-order-contacts.ts --wine          # recent wine orders
 */
import { db } from '@/lib/db'

function row(label: string, value: unknown) {
  console.log(`    ${label.padEnd(16)} ${value === null || value === undefined ? '—' : String(value)}`)
}

async function showContacts(where: { orderId: string } | { wineOrderId: string }) {
  const contacts = await db.orderContact.findMany({
    where,
    select: {
      tenantId: true, personId: true, nameSnapshot: true, phoneSnapshot: true,
      emailSnapshot: true, role: { select: { key: true, labelEn: true } },
    },
    orderBy: { role: { sortOrder: 'asc' } },
  })
  if (contacts.length === 0) {
    console.log('    contacts        (none)')
    return
  }
  for (const c of contacts) {
    console.log(
      `    ${c.role.labelEn.padEnd(15)} ${c.nameSnapshot.padEnd(22)}` +
      ` ph=${String(c.phoneSnapshot ?? '—').padEnd(20)} em=${String(c.emailSnapshot ?? '—').padEnd(36)}` +
      ` link=${c.personId ? 'yes' : 'no '} tenant=${c.tenantId ? 'set' : 'NULL'}`
    )
  }
}

async function main() {
  const arg = process.argv[2]

  if (arg === '--wine') {
    const orders = await db.wineOrder.findMany({
      orderBy: { createdAt: 'desc' }, take: 5,
      select: {
        id: true, createdAt: true, businessName: true, contactName: true, contactPhone: true,
        contactEmail: true, company: { select: { name: true } },
      },
    })
    for (const o of orders) {
      console.log(`\n▸ wine order ${o.id}  ${o.createdAt.toISOString().slice(0, 16)}`)
      row('business', o.businessName)
      row('company', o.company?.name)
      row('columns', `${o.contactName} / ${o.contactPhone} / ${o.contactEmail ?? '—'}`)
      await showContacts({ wineOrderId: o.id })
    }
    return
  }

  // Seeded demo orders carry future `createdAt` values, so "most recent" is not the one you
  // just made. Passing a name fragment finds it regardless.
  const where = arg
    ? (arg.startsWith('c') && arg.length > 20
        ? { id: arg }
        : { OR: [{ name: { contains: arg, mode: 'insensitive' as const } }, { surname: { contains: arg, mode: 'insensitive' as const } }] })
    : {}
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: arg ? 5 : 10,
    select: {
      id: true, createdAt: true, bookingType: true, guestCount: true, date: true,
      name: true, surname: true, phone: true, email: true,
      company: { select: { name: true } },
    },
  })
  for (const o of orders) {
    console.log(`\n▸ ${o.id}  ${o.createdAt.toISOString().slice(0, 16)}  ${o.bookingType}  ${o.company?.name ?? 'no company'}`)
    row('visit', `${o.date.toISOString().slice(0, 10)} · ${o.guestCount} guests`)
    row('columns', `${o.name} ${o.surname} / ${o.phone ?? '—'} / ${o.email ?? '—'}`)
    await showContacts({ orderId: o.id })
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
