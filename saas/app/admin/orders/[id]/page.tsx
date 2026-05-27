import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import OrderDetail from './OrderDetail'

const C = { wine: '#7c1d23', faint: '#a89070' }

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [order, menuItems, masterclassItems] = await Promise.all([
    db.order.findUnique({
      where: { id },
      include: {
        company: { include: { prices: true } },
        masterclassLines: {
          include: { masterclassItem: true },
          orderBy: { id: 'asc' },
        },
        extras: { orderBy: { id: 'asc' } },
      },
    }),
    db.menuItem.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    }),
    db.masterclassItem.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  if (!order) notFound()

  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: C.wine }}
      >
        ← Back to orders
      </Link>

      <OrderDetail
        order={{
          id: order.id,
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
