import { NextResponse } from 'next/server'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { addEntry, type EntryInput } from '@/lib/releaseService'
import { assertDraftRelease, releaseErrorResponse } from '@/lib/releaseApi'

export const dynamic = 'force-dynamic'

/** POST { title, titleKa?, body?, bodyKa?, howTo?, howToKa?, linkPath?, clientVisible?, ticketRefs? } - adds a change to a DRAFT. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const id = (await params).id
    await assertDraftRelease(id)
    const e = await addEntry(id, body as EntryInput)
    return NextResponse.json({ id: e.id }, { status: 201 })
  } catch (e) { return releaseErrorResponse(e, 'POST entry') }
}
