import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireBookingModule(redirectTo = '/admin/companies') {
  const h = await headers()
  if (h.get('x-tenant-modules-booking') === 'false') redirect(redirectTo)
}

export async function requireWineOrdersModule(redirectTo = '/admin/companies') {
  const h = await headers()
  if (h.get('x-tenant-modules-wine-orders') !== 'true') redirect(redirectTo)
}
