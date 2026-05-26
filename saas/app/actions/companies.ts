'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createCompany(name: string, identificationCode?: string) {
  if (!name.trim()) return { error: 'Name is required.' }
  await db.company.create({ data: { name: name.trim(), identificationCode: identificationCode?.trim() || null } })
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function updateCompany(id: string, name: string, identificationCode?: string) {
  if (!name.trim()) return { error: 'Name is required.' }
  await db.company.update({ where: { id }, data: { name: name.trim(), identificationCode: identificationCode?.trim() || null } })
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function deleteCompany(id: string) {
  await db.company.delete({ where: { id } })
  revalidatePath('/admin/companies')
  return { success: true }
}
