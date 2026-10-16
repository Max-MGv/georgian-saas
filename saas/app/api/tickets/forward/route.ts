import { NextResponse } from 'next/server'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError } from '@/lib/ticketService'
import { receiveForwarded } from '@/lib/ticketForward'

export const dynamic = 'force-dynamic'

/**
 * POST - production copies one client report here (Plan-TicketsV2 3.5). Accepts the "forward" token (production's)
 * and Claude's "full" token (for testing and catch-up). Idempotent: sending the same production ticket again returns
 * the existing P-ticket with 200 instead of 201.
 */
export async function POST(request: Request) {
  const auth = await authenticateTicketRequest(request, ['forward', 'full'])
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const r = await receiveForwarded(body, auth.name)
    return NextResponse.json({ ref: r.ref, number: r.number }, { status: r.created ? 201 : 200 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('[api/tickets/forward]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
