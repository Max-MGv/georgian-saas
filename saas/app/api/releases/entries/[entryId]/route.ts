import { NextResponse } from 'next/server'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { deleteEntry, updateEntry, type EntryInput } from '@/lib/releaseService'
import { assertDraftEntry, releaseErrorResponse } from '@/lib/releaseApi'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ entryId: string }> }

/** PATCH any entry field (see POST /api/releases/[id]/entries) - DRAFT releases only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const entryId = (await params).entryId
    await assertDraftEntry(entryId)
    await updateEntry(entryId, body as EntryInput)
    return NextResponse.json({ ok: true })
  } catch (e) { return releaseErrorResponse(e, 'PATCH entry') }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  try {
    const entryId = (await params).entryId
    await assertDraftEntry(entryId)
    await deleteEntry(entryId)
    return NextResponse.json({ ok: true })
  } catch (e) { return releaseErrorResponse(e, 'DELETE entry') }
}
