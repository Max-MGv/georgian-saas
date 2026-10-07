import { NextResponse } from 'next/server'
import { authenticateTicketRequest, parseTicketNumber, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, findIdByNumber, postReview } from '@/lib/ticketService'

export const dynamic = 'force-dynamic'

/** POST { changed, howToTest, leftOver?, commit? } - hands the work to Max: the ticket moves to "Ready to test". */
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    await postReview(await findIdByNumber(n), {
      changed: String(body.changed ?? ''), howToTest: String(body.howToTest ?? ''),
      leftOver: typeof body.leftOver === 'string' ? body.leftOver : undefined,
      commit: typeof body.commit === 'string' ? body.commit : undefined,
    }, auth.name)
    return NextResponse.json({ ok: true, status: 'REVIEW' }, { status: 201 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: e.message === 'Ticket not found.' ? 404 : 400 })
    console.error('[api/tickets review]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
