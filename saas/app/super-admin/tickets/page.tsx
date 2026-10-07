import { headers } from 'next/headers'
import { getTenantOptions, getTickets } from '@/app/actions/tickets'
import { environmentFromHost } from '@/lib/tickets'
import TicketsClient from './TicketsClient'

export const dynamic = 'force-dynamic'

export default async function TicketsPage() {
  const h = await headers()
  const env = environmentFromHost(h.get('host'))
  const [tickets, tenants] = await Promise.all([getTickets(), getTenantOptions()])
  return <TicketsClient tickets={tickets} tenants={tenants} env={env} />
}
