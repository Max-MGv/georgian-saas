import { NextResponse } from 'next/server'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { deleteRelease, getRelease, updateRelease } from '@/lib/releaseService'
import { assertDraftRelease, releaseErrorResponse } from '@/lib/releaseApi'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  try {
    const r = await getRelease((await params).id)
    return r ? NextResponse.json(r) : NextResponse.json({ error: 'Release not found.' }, { status: 404 })
  } catch (e) { return releaseErrorResponse(e, 'GET id') }
}

/** DELETE a DRAFT (and its screenshots) - e.g. a test's clean-up. A published release is Max's: refused. */
export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  try {
    const id = (await params).id
    await assertDraftRelease(id)
    await deleteRelease(id)
    return NextResponse.json({ ok: true })
  } catch (e) { return releaseErrorResponse(e, 'DELETE') }
}

/** PATCH { releasedOn?, summary?, summaryKa? } on a DRAFT. Publishing / showing to clients is Max's, in Super Admin. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  if ('status' in body || 'clientVisible' in body) {
    return NextResponse.json({ error: 'Only Max publishes a release or shows it to clients (Super Admin -> Releases).' }, { status: 403 })
  }
  try {
    const id = (await params).id
    await assertDraftRelease(id)
    await updateRelease(id, { releasedOn: body.releasedOn as string | undefined, summary: body.summary as string | undefined, summaryKa: body.summaryKa as string | undefined })
    return NextResponse.json({ ok: true })
  } catch (e) { return releaseErrorResponse(e, 'PATCH') }
}
