import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import OrderDetail from './OrderDetail'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'

const C = { wine: 'var(--color-brand)', faint: 'var(--site-secondary)' }

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [tenantId, h] = await Promise.all([getTenantId(), headers()])
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'

  const [order, companies, menuItems, masterclassItems, recipientName, personalNumber, bankName, bankCode, iban, invoiceDetailed, adminLanguage] = await Promise.all([
    withTenantDb(tenantId, tx => tx.order.findFirst({
      where: { id, tenantId },
      include: {
        company: { include: { prices: true } },
        masterclassLines: {
          include: { masterclassItem: true },
          orderBy: { id: 'asc' },
        },
        extras: { orderBy: { id: 'asc' } },
        contacts: { include: { role: true }, orderBy: { role: { sortOrder: 'asc' } } },
        invoicesSent: { orderBy: { sentAt: 'desc' } },
        // How the money actually arrived, for the Paid indicator below — the
        // live (settled, not reversed) payment row, newest first in case a
        // reversed one was ever replaced by a second.
        payments: {
          where: { settledAt: { not: null }, reversedAt: null },
          orderBy: { settledAt: 'desc' },
          take: 1,
          select: { method: true },
        },
      },
    })),
    // For the "link this to a company" control (Feature 180) — the
    // isIndividual row is a pricing-tier container, never a real company to
    // link an order to (see createBooking.ts's own comment on the same row).
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId, isIndividual: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({
      where: { active: true, tenantId },
      orderBy: { sortOrder: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({
      where: { active: true, tenantId },
      orderBy: { sortOrder: 'asc' },
    })),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
    getSetting('invoice_detailed'),
    getSetting('admin_language'),
  ])

  if (!order) notFound()
  const locale = adminLanguage || 'en'
  // The fulfilment vocabulary for the flow-line and the status dropdown.
  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: C.wine }}
      >
        {adminT(locale, 'orderDetail.backToOrders')}
      </Link>

      <OrderDetail
        payment={{ recipientName, personalNumber, bankName, bankCode, iban }}
        detailed={invoiceDetailed === 'true'}
        displayName={displayName}
        locale={locale}
        companies={companies}
        order={{
          id: order.id,
          stage: order.stage,
          createdAt: order.createdAt,
          confirmedAt: order.confirmedAt,
          completedAt: order.completedAt,
          invoiceSentAt: order.invoiceSentAt,
          paidAt: order.paidAt,
          paymentMethod: order.payments[0]?.method ?? null,
          date: order.date,
          timeSlot: order.timeSlot,
          bookingType: order.bookingType,
          visitType: order.visitType,
          guestCount: order.guestCount,
          tastingGuestCount: order.tastingGuestCount,
          lunchGuestCount: order.lunchGuestCount,
          freeGuestCount: order.freeGuestCount,
          hotDishVegetable: order.hotDishVegetable,
          hotDishMeat: order.hotDishMeat,
          foodNotes: order.foodNotes,
          name: order.name,
          surname: order.surname,
          email: order.email,
          phone: order.phone,
          notes: order.notes,
          totalPrice: order.totalPrice,
          // The rates this order was sold at. Fetched all along (the query uses
          // `include`) but never passed down, which is why OrderDetail could not
          // tell what the order cost and invented ₾50 instead (#50/#52).
          tastingRateSnapshot: order.tastingRateSnapshot,
          lunchRateSnapshot: order.lunchRateSnapshot,
          registrationFeeSnapshot: order.registrationFeeSnapshot,
          requestedCompanyName: order.requestedCompanyName,
          company: order.company
            ? {
                id: order.company.id,
                name: order.company.name,
                identificationCode: order.company.identificationCode,
                prices: order.company.prices.map(p => ({
                  id: p.id,
                  minGuests: p.minGuests,
                  maxGuests: p.maxGuests,
                  pricePerPerson: p.pricePerPerson,
                  tastingLunchPricePerPerson: p.tastingLunchPricePerPerson,
                  registrationPrice: p.registrationPrice,
                })),
              }
            : null,
          masterclassLines: order.masterclassLines.map(l => ({
            id: l.id,
            masterclassItemId: l.masterclassItemId,
            quantity: l.quantity,
            pricePerUnit: l.pricePerUnit,
            masterclassItem: {
              id: l.masterclassItem.id,
              name: l.masterclassItem.name,
              unitType: l.masterclassItem.unitType,
              pricePerUnit: l.masterclassItem.pricePerUnit,
              active: l.masterclassItem.active,
            },
          })),
          extras: order.extras.map(e => ({
            id: e.id,
            label: e.label,
            amount: e.amount,
          })),
          contacts: order.contacts.map(c => ({
            roleLabelEn: c.role.labelEn,
            roleLabelKa: c.role.labelKa,
            name: c.nameSnapshot,
            phone: c.phoneSnapshot,
            email: c.emailSnapshot,
          })),
          invoicesSent: order.invoicesSent.map(i => ({
            id: i.id,
            sentAt: i.sentAt,
            recipientEmail: i.recipientEmail,
            totalPrice: i.totalPrice,
          })),
        }}
        menuItems={menuItems.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
        }))}
        masterclassItems={masterclassItems.map(i => ({
          id: i.id,
          name: i.name,
          unitType: i.unitType,
          pricePerUnit: i.pricePerUnit,
          active: i.active,
        }))}
      />
    </div>
  )
}
