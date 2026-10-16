import { NextResponse } from 'next/server'
import { authenticateTicketRequest } from '@/lib/ticketApiAuth'
import { ReleaseError, addImage } from '@/lib/releaseService'
import { assertDraftEntry, releaseErrorResponse } from '@/lib/releaseApi'
import type { ReleaseImageKind } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** POST multipart: `file` (PNG/JPEG/WebP/GIF, max 4 MB), `kind` BEFORE|AFTER|IMAGE, `pair`, `viewport` desktop|phone, `caption`. DRAFT only. */
export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const auth = await authenticateTicketRequest(request)
  if ('response' in auth) return auth.response
  try {
    const entryId = (await params).entryId
    await assertDraftEntry(entryId)
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw new ReleaseError('Send the image as multipart field "file".')
    const img = await addImage(entryId, {
      bytes: Buffer.from(await file.arrayBuffer()),
      kind: String(form!.get('kind') ?? 'IMAGE') as ReleaseImageKind,
      pair: Number(form!.get('pair') ?? 0),
      viewport: String(form!.get('viewport') ?? 'desktop'),
      caption: String(form!.get('caption') ?? ''),
    })
    return NextResponse.json({ id: img.id }, { status: 201 })
  } catch (e) { return releaseErrorResponse(e, 'POST image') }
}
