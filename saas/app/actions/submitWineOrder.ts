'use server'

import { db } from '@/lib/db'

export type WineSelection = {
  id: string
  name: string
  quantity: number
}

export async function submitWineOrder(formData: FormData) {
  const businessName = formData.get('businessName') as string
  const llcName = formData.get('llcName') as string | null
  const llcId = formData.get('llcId') as string | null
  const address = formData.get('address') as string
  const workingHours = formData.get('workingHours') as string | null
  const contactName = formData.get('contactName') as string
  const contactPhone = formData.get('contactPhone') as string
  const winesJson = formData.get('wines') as string

  if (!businessName || !address || !contactName || !contactPhone || !winesJson) {
    return { error: 'Please fill in all required fields.' }
  }

  const wines: WineSelection[] = JSON.parse(winesJson)
  const selectedWines = wines.filter(w => w.quantity > 0)

  if (selectedWines.length === 0) {
    return { error: 'Please select at least one wine.' }
  }

  try {
    await db.wineOrder.create({
      data: {
        businessName,
        llcName: llcName || null,
        llcId: llcId || null,
        address,
        workingHours: workingHours || null,
        contactName,
        contactPhone,
        wines: selectedWines,
      },
    })
    return { success: true }
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}
