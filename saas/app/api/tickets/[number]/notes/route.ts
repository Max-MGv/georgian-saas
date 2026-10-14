import { NextResponse } from 'next/server'
import { authenticateTicketRequest, parseTicketNumber, readJsonObject } from '@/lib/ticketApiAuth'
import { TicketError, addDecision, answerQuestion, askQuestion, findIdByNumber } from '@/lib/ticketService'

export const dynamic = 'force-dynamic'

/**
 * POST (Plan-TicketsV2 2.2) - one of:
 *   { kind: 'QUESTION', text, options?: string[] }      a question for Max, optionally with answer buttons
 *   { kind: 'ANSWER', questionId, choice?, text? }     record an answer Max gave elsewhere (chat)
 *   { kind: 'DECISION', text }                         a decision taken elsewhere, so it is not lost in comments
 */
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const n = parseTicketNumber((await params).number)
  if (!n) return NextResponse.json({ error: 'Invalid ticket number.' }, { status: 400 })
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const id = await findIdByNumber(n)
    const text = typeof body.text === 'string' ? body.text : ''
    let ev: { id: string }
    if (body.kind === 'QUESTION') ev = await askQuestion(id, text, body.options, auth.name)
    else if (body.kind === 'ANSWER') {
      if (typeof body.questionId !== 'string') throw new TicketError('questionId is required.')
      ev = await answerQuestion(id, body.questionId, { choice: typeof body.choice === 'string' ? body.choice : undefined, text }, auth.name)
    } else if (body.kind === 'DECISION') ev = await addDecision(id, text, auth.name)
    else throw new TicketError('kind must be QUESTION, ANSWER or DECISION.')
    return NextResponse.json({ ok: true, id: ev.id }, { status: 201 })
  } catch (e) {
    if (e instanceof TicketError) return NextResponse.json({ error: e.message }, { status: e.message === 'Ticket not found.' ? 404 : 400 })
    console.error('[api/tickets notes]', e)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
