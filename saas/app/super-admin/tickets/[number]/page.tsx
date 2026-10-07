import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getTenantOptions, getTicket } from '@/app/actions/tickets'
import { environmentFromHost, ticketRef } from '@/lib/tickets'
import TicketDetailClient from './TicketDetailClient'

export const dynamic = 'force-dynamic'

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params
  const n = Number(number.replace(/^t-/i, ''))
  if (!Number.isInteger(n) || n < 1) notFound()
  const [ticket, tenants] = await Promise.all([getTicket(n), getTenantOptions()])
  if (!ticket) notFound()
  const env = environmentFromHost((await headers()).get('host'))

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link href="/super-admin/tickets" style={{ color: '#64748b', fontSize: 14 }}>← Tickets</Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>{ticketRef(ticket.number)}</span>
      </div>
      <TicketDetailClient ticket={ticket} tenants={tenants} env={env} />
    </div>
  )
}
