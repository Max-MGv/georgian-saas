import { NextResponse } from 'next/server'
import { authenticateTicketRequest, parseTicketNumber, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, addComment, findIdByNumber } from '@/lib/ticketService'

export const dynamic = 'force-dynamic'

/** POST { body: "text" } - adds a timeline comment attributed to the token's name. */
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    await addComment(await findIdByNumber(n), String(body.body ?? ''), auth.name)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: e.message === 'Ticket not found.' ? 404 : 400 })
    console.error('[api/tickets comment]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
