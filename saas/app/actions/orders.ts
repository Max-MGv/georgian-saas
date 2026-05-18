'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function deleteOrder(id: string) {
  await db.order.delete({ where: { id } })
  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
  return { success: true }
}

export async function updateOrder(id: string, data: {
  date: string
  timeSlot: string
  guestCount: number
  name: string
  surname: string
  phone: string
  email: string
  notes: string
}) {
  if (!data.name.trim()) return { error: 'First name is required.' }
  if (!data.surname.trim()) return { error: 'Last name is required.' }
  if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' }

  await db.order.update({
    where: { id },
    data: {
      date: new Date(data.date),
      timeSlot: data.timeSlot,
      guestCount: data.guestCount,
      name: data.name.trim(),
      surname: data.surname.trim(),
      phone: data.phone.trim() || null,
      email: data.email.trim() || null,
      notes: data.notes.trim() || null,
    },
  })

  revalidatePath('/admin/orders')
  return { success: true }
}
