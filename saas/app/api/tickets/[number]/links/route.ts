import { NextResponse } from 'next/server'
import { authenticateTicketRequest, parseTicketNumber, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, addLink, findIdByNumber, removeLink } from '@/lib/ticketService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ number: string }> }

async function handle(request: Request, { params }: Ctx, remove: boolean) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const id = await findIdByNumber(n)
    if (remove) await removeLink(id, body, auth.name)
    else await addLink(id, body, auth.name)
    return NextResponse.json({ ok: true }, { status: remove ? 200 : 201 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: e.message === 'Ticket not found.' ? 404 : 400 })
    console.error('[api/tickets links]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}

/** POST { kind: 'plan'|'commit'|'bug'|'ticket'|'url', ref, label? } adds a link (Plan-TicketsV2 2.3); a related ticket links back. */
export const POST = (request: Request, ctx: Ctx) => handle(request, ctx, false)
/** DELETE { kind, ref } removes it. */
export const DELETE = (request: Request, ctx: Ctx) => handle(request, ctx, true)
