/**
 * Shared bits of the release-notes token API (/api/releases/**, Plan-ReleaseNotes.md). Same bearer tokens as the
 * ticket API (scope "full"). The token DRAFTS: it may only change releases that are still drafts, and it can never
 * publish or show a release to clients - that is Max's switch.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ReleaseError } from '@/lib/releaseService'

export async function assertDraftRelease(releaseId: string) {
  const r = await db.release.findUnique({ where: { id: releaseId }, select: { status: true } })
  if (!r) throw new ReleaseError('Release not found.')
  if (r.status !== 'DRAFT') throw new ReleaseError('This release is published - only Max can change it now (unpublish it in Super Admin first).')
}

export async function assertDraftEntry(entryId: string) {
  const e = await db.releaseEntry.findUnique({ where: { id: entryId }, select: { releaseId: true } })
  if (!e) throw new ReleaseError('Change not found.')
  await assertDraftRelease(e.releaseId)
}

export function releaseErrorResponse(e: unknown, where: string) {
  if (e instanceof ReleaseError) return NextResponse.json({ error: e.message }, { status: /not found/i.test(e.message) ? 404 : 400 })
  console.error(`[api/releases ${where}]`, e)
  return NextResponse.json({ error: 'Server error.' }, { status: 500 })
}
