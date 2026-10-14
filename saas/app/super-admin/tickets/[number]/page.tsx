import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'

// Tickets open in a side panel over the board (Plan-TicketsV2 1.1). Old links - notification emails,
// commit messages, bookmarks - still point here, so send them to the board with that ticket open.
export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  await requireSuperAdmin()
  const { number } = await params
  const n = Number(number.replace(/^t-/i, ''))
  redirect(Number.isInteger(n) && n > 0 ? `/super-admin/tickets?t=${n}` : '/super-admin/tickets')
}
