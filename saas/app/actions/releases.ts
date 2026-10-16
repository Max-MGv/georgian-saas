'use server'

/**
 * Release notes (vault/Plan-ReleaseNotes.md). Super-admin actions (write) + the client "What's new" reads.
 * The rules live in lib/releaseService.ts, shared with the token API.
 */

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { requireAdmin } from '@/lib/requireAdmin'
import {
  ReleaseError, addEntry, addImage, createRelease, deleteEntry, deleteImage, deleteRelease, getRelease, listClientReleases,
  listReleases, markReleasesSeen, moveEntry, updateEntry, updateRelease,
  type EntryInput, type ReleaseDetail, type ReleaseListItem, type ReleasePatch,
} from '@/lib/releaseService'
import type { ReleaseImageKind } from '@prisma/client'

const ACTOR = 'max'
export type ReleaseResult<T = unknown> = ({ ok: true } & T) | { error: string }

async function guard<T>(fn: () => Promise<T>): Promise<ReleaseResult<T>> {
  await requireSuperAdmin()
  try {
    const out = await fn()
    revalidatePath('/super-admin/releases')
    revalidatePath('/admin/whats-new')
    return { ok: true, ...(out as object) } as { ok: true } & T
  } catch (e) {
    if (e instanceof ReleaseError) return { error: e.message }
    console.error('[releases action]', e)
    return { error: 'Something went wrong. Please try again.' }
  }
}

// ── Super Admin ──────────────────────────────────────────────────────────

export async function getReleases(): Promise<ReleaseListItem[]> {
  await requireSuperAdmin()
  return listReleases()
}

export async function getReleaseDetail(id: string): Promise<ReleaseDetail | null> {
  await requireSuperAdmin()
  return getRelease(id)
}

export async function createReleaseAction(releasedOn: string, summary = ''): Promise<ReleaseResult<{ id: string }>> {
  return guard(async () => ({ id: (await createRelease({ releasedOn, summary }, ACTOR)).id }))
}

export async function updateReleaseAction(id: string, patch: ReleasePatch): Promise<ReleaseResult> {
  return guard(async () => { await updateRelease(id, patch); return {} })
}

export async function deleteReleaseAction(id: string): Promise<ReleaseResult> {
  return guard(async () => { await deleteRelease(id); return {} })
}

export async function addEntryAction(releaseId: string, input: EntryInput): Promise<ReleaseResult<{ id: string }>> {
  return guard(async () => ({ id: (await addEntry(releaseId, input)).id }))
}

export async function updateEntryAction(entryId: string, input: EntryInput): Promise<ReleaseResult> {
  return guard(async () => { await updateEntry(entryId, input); return {} })
}

export async function deleteEntryAction(entryId: string): Promise<ReleaseResult> {
  return guard(async () => { await deleteEntry(entryId); return {} })
}

export async function moveEntryAction(entryId: string, dir: -1 | 1): Promise<ReleaseResult> {
  return guard(async () => { await moveEntry(entryId, dir === -1 ? -1 : 1); return {} })
}

/** formData: `entryId`, `file`, optional `kind` (BEFORE | AFTER | IMAGE), `pair`, `viewport` (desktop | phone), `caption`. */
export async function uploadReleaseImage(formData: FormData): Promise<ReleaseResult> {
  return guard(async () => {
    const file = formData.get('file')
    if (!(file instanceof File)) throw new ReleaseError('Choose an image first.')
    await addImage(String(formData.get('entryId') ?? ''), {
      bytes: Buffer.from(await file.arrayBuffer()),
      kind: String(formData.get('kind') ?? 'IMAGE') as ReleaseImageKind,
      pair: Number(formData.get('pair') ?? 0),
      viewport: String(formData.get('viewport') ?? 'desktop'),
      caption: String(formData.get('caption') ?? ''),
    })
    return {}
  })
}

export async function deleteReleaseImageAction(imageId: string): Promise<ReleaseResult> {
  return guard(async () => { await deleteImage(imageId); return {} })
}

// ── Clients (tenant admins): What's new ───────────────────────────────────

/** The published, client-visible releases. Opening the page marks them seen (clears the dot). */
export async function getWhatsNew(): Promise<ReleaseDetail[]> {
  const user = await requireAdmin()
  const releases = await listClientReleases()
  await markReleasesSeen(user.id).catch(e => console.error('[getWhatsNew] could not mark seen', e))
  return releases
}
