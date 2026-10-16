import { NextResponse } from 'next/server'
import { authenticateTicketRequest, readJsonObject } from '@/lib/ticketApiAuth'
import { createRelease, listReleases } from '@/lib/releaseService'
import { releaseErrorResponse } from '@/lib/releaseApi'

export const dynamic = 'force-dynamic'

/** GET - every release (newest first) with counts. */
export async function GET(request: Request) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  try { return NextResponse.json({ releases: await listReleases() }) } catch (e) { return releaseErrorResponse(e, 'GET') }
}

/** POST { releasedOn: "2026-10-15", summary?, summaryKa? } - a new DRAFT release. */
export async function POST(request: Request) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  const body = await readJsonObject(request)
  if (!body) return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  try {
    const r = await createRelease({ releasedOn: String(body.releasedOn ?? ''), summary: body.summary as string, summaryKa: body.summaryKa as string }, auth.name)
    return NextResponse.json({ id: r.id, status: r.status }, { status: 201 })
  } catch (e) { return releaseErrorResponse(e, 'POST') }
}
