import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'

// The flat inbox was replaced by the ticket board (Plan-Tickets.md). Widget reports
// still arrive - as tickets with source "Widget" - and old links/bookmarks land here.
export default async function BugReportsPage() {
  await requireSuperAdmin()
  redirect('/super-admin/tickets')
}
