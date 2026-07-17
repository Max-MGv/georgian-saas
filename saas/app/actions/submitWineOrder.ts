'use server'

import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'

export type WineSelection = {
  vintageId: string
  name: string
  year: number
  quantity: number
  price: number
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
  const companyId = (formData.get('companyId') as string | null)?.trim() || null
  const discountPercentRaw = formData.get('discountPercent') as string | null
  const discountPercent = discountPercentRaw ? parseFloat(discountPercentRaw) : null

  if (!businessName || !address || !contactName || !contactPhone || !winesJson) {
    return { error: 'Please fill in all required fields.' }
  }

  const wines: WineSelection[] = JSON.parse(winesJson)
  const selectedWines = wines.filter(w => w.quantity > 0)

  if (selectedWines.length === 0) {
    return { error: 'Please select at least one wine.' }
  }

  const subtotal = selectedWines.reduce((sum, w) => sum + w.quantity * w.price, 0)
  const totalAmount = discountPercent && discountPercent > 0
    ? Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100
    : subtotal
  const tenantId = await getTenantId()

  try {
    await withTenantDb(tenantId, async (tx) => {
      const order = await tx.wineOrder.create({
        data: {
          businessName,
          llcName: llcName || null,
          llcId: llcId || null,
          address,
          workingHours: workingHours || null,
          contactName,
          contactPhone,
          totalAmount,
          discountPercent: discountPercent || null,
          tenantId,
          companyId: companyId || null,
        },
      })
      await tx.wineOrderItem.createMany({
        data: selectedWines.map(w => ({
          wineOrderId: order.id,
          wineVintageId: w.vintageId,
          wineNameSnapshot: w.name,
          vintageYearSnapshot: w.year,
          priceSnapshot: w.price,
          quantity: w.quantity,
        })),
      })
    })
    return { success: true }
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}
