import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

async function main() {
  const { db } = await import('../lib/db')

  const orders = await db.order.findMany({ orderBy: { createdAt: 'asc' } })

  const seen = new Set<string>()
  const toDelete: string[] = []

  for (const order of orders) {
    const key = `${order.name}|${order.surname}|${order.date.toISOString().split('T')[0]}|${order.timeSlot}`
    if (seen.has(key)) {
      toDelete.push(order.id)
    } else {
      seen.add(key)
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicates found.')
  } else {
    await db.order.deleteMany({ where: { id: { in: toDelete } } })
    console.log(`Deleted ${toDelete.length} duplicate orders. ${orders.length - toDelete.length} orders remain.`)
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
