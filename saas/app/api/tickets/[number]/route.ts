import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateTicketRequest, parseTicketNumber, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, assertApiStatusChange, changeStatus, getTicketByNumber, updateFields, type TicketPatch } from '@/lib/ticketService'
import { TICKET_STATUSES, ticketRef } from '@/lib/tickets'
import type { TicketStatusValue } from '@/lib/tickets'
import type { TicketCloseReason } from '@prisma/client'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ number: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  try {
    const t = await getTicketByNumber(n)
    if (!t) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    // WIDGET tickets (and their description and comments) are written by anonymous visitors.
    return NextResponse.json({ ...t, ref: ticketRef(t.number), untrustedText: t.source === 'WIDGET' })
  } catch (e) {
    console.error('[api/tickets GET]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}

/** PATCH { title?, description?, type?, priority?, area?, labels?, status?, closeReason?, note? }.
 *  What the token may do to status is limited (assertApiStatusChange): never Done, never Ready to test
 *  (use /review), never touch a finished ticket, never close a reporter's ticket. It cannot change the
 *  tenant. Everything is validated BEFORE anything is written, so a bad status cannot leave a half-applied edit. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const ticket = await db.ticket.findUnique({ where: { number: n }, select: { id: true, status: true, source: true } })
    if (!ticket) throw new TicketError('Ticket not found.')
    if ('tenantId' in body) throw new TicketError('The token cannot change a ticket\'s tenant.')

    const patch: TicketPatch = {}
    for (const k of ['title', 'description', 'type', 'priority', 'area', 'labels'] as const) {
      if (k in body) (patch as Record<string, unknown>)[k] = body[k]
    }
    let to: TicketStatusValue | null = null
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !(TICKET_STATUSES as readonly string[]).includes(body.status)) throw new TicketError('Invalid status.')
      to = body.status as TicketStatusValue
      assertApiStatusChange(ticket, to)
      if (to === 'CLOSED' && !body.closeReason) throw new TicketError('A reason is required to close a ticket.')
    }

    if (Object.keys(patch).length) await updateFields(ticket.id, patch, auth.name)
    if (to) {
      await changeStatus(ticket.id, to, auth.name, {
        closeReason: (body.closeReason as TicketCloseReason) ?? null,
        note: typeof body.note === 'string' ? body.note : undefined,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: e.message === 'Ticket not found.' ? 404 : 400 })
    console.error('[api/tickets PATCH]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
