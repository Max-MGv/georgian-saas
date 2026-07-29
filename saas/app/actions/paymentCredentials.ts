'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

/**
 * Tenant-admin access to the Flitt merchant credentials.
 *
 * These live on Tenant, not Setting, precisely so they can't ride along in
 * getAllSettings() (MaintenanceNotes §9). That also means the admin UI can't
 * use the generic settings actions — hence this file.
 *
 * The secret key is WRITE-ONLY from the browser's perspective: reads return
 * whether one is set, never the value. There is no legitimate admin-panel
 * reason to display it back, and a value that never leaves the server can't
 * end up serialised into page HTML.
 */

export type PaymentCredentialsView = {
  merchantId: string
  /** True when a secret is stored. The secret itself never crosses to the client. */
  secretKeySet: boolean
  moduleEnabled: boolean
}

export async function getPaymentCredentials(): Promise<PaymentCredentialsView> {
  await requireAdmin()
  const tenantId = await getTenantId()
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { flittMerchantId: true, flittSecretKey: true, modulesOnlinePayment: true },
  })
  return {
    merchantId: t?.flittMerchantId ?? '',
    secretKeySet: Boolean(t?.flittSecretKey),
    moduleEnabled: t?.modulesOnlinePayment ?? false,
  }
}

export async function updatePaymentCredentials(input: {
  merchantId: string
  /** Empty string = keep the stored secret; the form field is a set-only input. */
  secretKey?: string
}): Promise<{ success: boolean }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      flittMerchantId: input.merchantId.trim() || null,
      ...(input.secretKey ? { flittSecretKey: input.secretKey } : {}),
    },
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')
  return { success: true }
}

/** Explicit removal — distinct from "left the field blank while editing". */
export async function clearPaymentSecretKey(): Promise<{ success: boolean }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  await db.tenant.update({ where: { id: tenantId }, data: { flittSecretKey: null } })
  revalidatePath('/admin/settings')
  revalidatePath('/')
  return { success: true }
}
