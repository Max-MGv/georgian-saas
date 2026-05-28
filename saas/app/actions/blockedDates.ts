'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function getBlockedDates() {
  const rows = await db.blockedDate.findMany({ orderBy: { date: 'asc' } })
  return rows.map(r => ({
    id: r.id,
    date: r.date.toISOString().split('T')[0],
    reason: r.reason,
  }))
}

export async function addBlockedDate(dateStr: string, reason?: string) {
  const date = new Date(dateStr)
  const row = await db.blockedDate.upsert({
    where: { date },
    update: { reason: reason ?? null },
    create: { date, reason: reason ?? null },
  })
  revalidatePath('/admin/settings')
  revalidatePath('/')
  return { id: row.id, date: row.date.toISOString().split('T')[0], reason: row.reason }
}

export async function removeBlockedDate(id: string) {
  await db.blockedDate.delete({ where: { id } })
  revalidatePath('/admin/settings')
  revalidatePath('/')
}
