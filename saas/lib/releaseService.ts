/**
 * Release notes (vault/Plan-ReleaseNotes.md) - the ONLY place that changes them. Super-admin actions and the token
 * API both come here. No auth in this file: callers own it. Plain `db`: these tables are outside tenant RLS (they are
 * platform-wide; clients see what is published) and locked from the REST API by their migration.
 *
 * Who may do what: Claude (the token) drafts - creates releases and entries, uploads screenshots. Only Max publishes
 * a release or shows it to clients (Max, 2026-10-15), so those two switches are refused for the token by the API.
 */

import { db } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import { ALLOWED_IMAGE_TYPES, sniffImageType } from '@/lib/tickets'
import type { Prisma, ReleaseImageKind, ReleaseStatus } from '@prisma/client'

export class ReleaseError extends Error {}

export const RELEASE_BUCKET = 'release-images'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_TEXT = 4000
const MAX_TITLE = 140
const MAX_IMAGES_PER_ENTRY = 12

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** "Take me there" may only point inside the admin panel - never an outside address. */
export function cleanAdminPath(v: unknown): string | null {
  const s = clean(v, 200)
  if (!s) return null
  if (!/^\/admin(?:\/[\w\-./]*)?(?:\?[\w\-=&%.]*)?$/.test(s) || s.includes('..')) throw new ReleaseError('"Take me there" must be an admin page, like /admin/settings.')
  return s
}

function cleanDay(v: unknown): Date {
  const s = clean(v, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ReleaseError('The release date must look like 2026-10-15.')
  const d = new Date(`${s}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new ReleaseError('That is not a real date.')
  return d
}

// ── Releases ─────────────────────────────────────────────────────────────

export async function createRelease(input: { releasedOn: string; summary?: string; summaryKa?: string }, actor: string) {
  return db.release.create({
    data: { releasedOn: cleanDay(input.releasedOn), summary: clean(input.summary, MAX_TEXT), summaryKa: clean(input.summaryKa, MAX_TEXT), createdBy: actor },
  })
}

export type ReleasePatch = { releasedOn?: string; summary?: string; summaryKa?: string; status?: ReleaseStatus; clientVisible?: boolean }

export async function updateRelease(id: string, patch: ReleasePatch) {
  const data: Prisma.ReleaseUpdateInput = {}
  if (patch.releasedOn !== undefined) data.releasedOn = cleanDay(patch.releasedOn)
  if (patch.summary !== undefined) data.summary = clean(patch.summary, MAX_TEXT)
  if (patch.summaryKa !== undefined) data.summaryKa = clean(patch.summaryKa, MAX_TEXT)
  if (patch.status !== undefined) {
    if (patch.status !== 'DRAFT' && patch.status !== 'PUBLISHED') throw new ReleaseError('Invalid status.')
    data.status = patch.status
  }
  if (patch.clientVisible !== undefined) data.clientVisible = !!patch.clientVisible
  return db.$transaction(async tx => {
    const r = await tx.release.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } })
    if (!r) throw new ReleaseError('Release not found.')
    const status = (data.status as ReleaseStatus | undefined) ?? r.status
    if (status === 'PUBLISHED' && r._count.entries === 0) throw new ReleaseError('Add at least one change before publishing.')
    if (data.status === 'PUBLISHED' && r.status !== 'PUBLISHED') data.publishedAt = new Date()
    // Going back to draft also hides it from clients: a draft is never visible to them.
    if (data.status === 'DRAFT') data.clientVisible = false
    if (data.clientVisible === true && status !== 'PUBLISHED') throw new ReleaseError('Publish the release before showing it to clients.')
    return tx.release.update({ where: { id }, data })
  })
}

/** Only drafts can be deleted (a published release may already have been read by clients). */
export async function deleteRelease(id: string) {
  const r = await db.release.findUnique({ where: { id }, include: { entries: { include: { images: true } } } })
  if (!r) throw new ReleaseError('Release not found.')
  if (r.status === 'PUBLISHED') throw new ReleaseError('Unpublish it first - only drafts can be deleted.')
  const paths = r.entries.flatMap(e => e.images.map(i => i.storagePath))
  await db.release.delete({ where: { id } })
  if (paths.length) await createServiceClient().storage.from(RELEASE_BUCKET).remove(paths).catch(() => {})
}

// ── Entries ──────────────────────────────────────────────────────────────

export type EntryInput = {
  title?: string; titleKa?: string; body?: string; bodyKa?: string; howTo?: string; howToKa?: string
  linkPath?: string | null; clientVisible?: boolean; ticketRefs?: string[]
}

function entryData(input: EntryInput): Prisma.ReleaseEntryUpdateInput {
  const d: Prisma.ReleaseEntryUpdateInput = {}
  if (input.title !== undefined) { const t = clean(input.title, MAX_TITLE); if (!t) throw new ReleaseError('A change needs a title.'); d.title = t }
  for (const k of ['titleKa'] as const) if (input[k] !== undefined) d[k] = clean(input[k], MAX_TITLE)
  for (const k of ['body', 'bodyKa', 'howTo', 'howToKa'] as const) if (input[k] !== undefined) d[k] = clean(input[k], MAX_TEXT)
  if (input.linkPath !== undefined) d.linkPath = cleanAdminPath(input.linkPath)
  if (input.clientVisible !== undefined) d.clientVisible = !!input.clientVisible
  if (input.ticketRefs !== undefined) {
    d.ticketRefs = Array.isArray(input.ticketRefs)
      ? [...new Set(input.ticketRefs.map(r => clean(r, 12).toUpperCase()).filter(r => /^[TP]-\d{1,9}$/.test(r)))].slice(0, 20)
      : []
  }
  return d
}

export async function addEntry(releaseId: string, input: EntryInput) {
  if (!clean(input.title, MAX_TITLE)) throw new ReleaseError('A change needs a title.')
  const r = await db.release.findUnique({ where: { id: releaseId }, select: { id: true } })
  if (!r) throw new ReleaseError('Release not found.')
  const last = await db.releaseEntry.findFirst({ where: { releaseId }, orderBy: { position: 'desc' }, select: { position: true } })
  return db.releaseEntry.create({
    data: { ...(entryData(input) as Prisma.ReleaseEntryCreateWithoutReleaseInput), title: clean(input.title, MAX_TITLE), releaseId, position: (last?.position ?? -1) + 1 },
  })
}

export async function updateEntry(entryId: string, input: EntryInput) {
  const e = await db.releaseEntry.findUnique({ where: { id: entryId }, select: { id: true } })
  if (!e) throw new ReleaseError('Change not found.')
  return db.releaseEntry.update({ where: { id: entryId }, data: entryData(input) })
}

export async function deleteEntry(entryId: string) {
  const e = await db.releaseEntry.findUnique({ where: { id: entryId }, include: { images: true } })
  if (!e) throw new ReleaseError('Change not found.')
  await db.releaseEntry.delete({ where: { id: entryId } })
  if (e.images.length) await createServiceClient().storage.from(RELEASE_BUCKET).remove(e.images.map(i => i.storagePath)).catch(() => {})
}

/** Moves an entry one place up (-1) or down (+1) by swapping positions with its neighbour. */
export async function moveEntry(entryId: string, dir: -1 | 1) {
  await db.$transaction(async tx => {
    const e = await tx.releaseEntry.findUnique({ where: { id: entryId } })
    if (!e) throw new ReleaseError('Change not found.')
    const all = await tx.releaseEntry.findMany({ where: { releaseId: e.releaseId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
    const i = all.findIndex(x => x.id === entryId)
    const j = i + dir
    if (j < 0 || j >= all.length) return
    ;[all[i], all[j]] = [all[j], all[i]]
    for (let k = 0; k < all.length; k++) if (all[k].position !== k) await tx.releaseEntry.update({ where: { id: all[k].id }, data: { position: k } })
  })
}

// ── Images ───────────────────────────────────────────────────────────────

export async function addImage(entryId: string, file: { bytes: Buffer; kind?: ReleaseImageKind; pair?: number; viewport?: string; caption?: string }) {
  if (file.bytes.length === 0) throw new ReleaseError('Choose an image first.')
  if (file.bytes.length > MAX_IMAGE_BYTES) throw new ReleaseError('Image is too large (max 4 MB).')
  const mime = sniffImageType(file.bytes)
  if (!mime || !ALLOWED_IMAGE_TYPES[mime]) throw new ReleaseError('Only PNG, JPEG, WebP or GIF images.')
  const kind: ReleaseImageKind = file.kind === 'BEFORE' || file.kind === 'AFTER' ? file.kind : 'IMAGE'
  const entry = await db.releaseEntry.findUnique({ where: { id: entryId }, include: { _count: { select: { images: true } } } })
  if (!entry) throw new ReleaseError('Change not found.')
  if (entry._count.images >= MAX_IMAGES_PER_ENTRY) throw new ReleaseError(`At most ${MAX_IMAGES_PER_ENTRY} images per change.`)
  const path = `${entry.releaseId}/${entryId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ALLOWED_IMAGE_TYPES[mime]}`
  const { error } = await createServiceClient().storage.from(RELEASE_BUCKET).upload(path, file.bytes, { contentType: mime, upsert: false })
  if (error) { console.error('[release addImage]', error); throw new ReleaseError('Upload failed. Please try again.') }
  return db.releaseImage.create({
    data: {
      entryId, kind, pair: Number.isInteger(file.pair) ? Math.max(0, Math.min(99, file.pair!)) : 0,
      viewport: file.viewport === 'phone' ? 'phone' : 'desktop', caption: clean(file.caption, 200),
      storagePath: path, mimeType: mime, sizeBytes: file.bytes.length,
    },
  })
}

export async function deleteImage(imageId: string) {
  const img = await db.releaseImage.findUnique({ where: { id: imageId } })
  if (!img) throw new ReleaseError('Image not found.')
  await db.releaseImage.delete({ where: { id: imageId } })
  await createServiceClient().storage.from(RELEASE_BUCKET).remove([img.storagePath]).catch(() => {})
}

// ── Reads ────────────────────────────────────────────────────────────────

export type ReleaseImageView = { id: string; kind: ReleaseImageKind; pair: number; viewport: string; caption: string; url: string | null }
export type ReleaseEntryView = {
  id: string; position: number; title: string; titleKa: string; body: string; bodyKa: string; howTo: string; howToKa: string
  linkPath: string | null; clientVisible: boolean; ticketRefs: string[]; images: ReleaseImageView[]
}
export type ReleaseDetail = {
  id: string; releasedOn: string; summary: string; summaryKa: string; status: ReleaseStatus; clientVisible: boolean
  publishedAt: string | null; createdBy: string | null; updatedAt: string; entries: ReleaseEntryView[]
}
export type ReleaseListItem = Omit<ReleaseDetail, 'entries'> & { entryCount: number; imageCount: number; hiddenEntries: number }

async function signImages(images: { id: string; kind: ReleaseImageKind; pair: number; viewport: string; caption: string; storagePath: string }[]): Promise<ReleaseImageView[]> {
  if (images.length === 0) return []
  const { data } = await createServiceClient().storage.from(RELEASE_BUCKET).createSignedUrls(images.map(i => i.storagePath), 60 * 60)
    .catch(() => ({ data: null as null | { signedUrl: string | null }[] }))
  return images.map((i, k) => ({ id: i.id, kind: i.kind, pair: i.pair, viewport: i.viewport, caption: i.caption, url: data?.[k]?.signedUrl ?? null }))
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export async function listReleases(): Promise<ReleaseListItem[]> {
  const rows = await db.release.findMany({
    orderBy: [{ releasedOn: 'desc' }, { createdAt: 'desc' }],
    include: { entries: { select: { clientVisible: true, _count: { select: { images: true } } } } },
  })
  return rows.map(r => ({
    id: r.id, releasedOn: day(r.releasedOn), summary: r.summary, summaryKa: r.summaryKa, status: r.status, clientVisible: r.clientVisible,
    publishedAt: r.publishedAt?.toISOString() ?? null, createdBy: r.createdBy, updatedAt: r.updatedAt.toISOString(),
    entryCount: r.entries.length, hiddenEntries: r.entries.filter(e => !e.clientVisible).length,
    imageCount: r.entries.reduce((n, e) => n + e._count.images, 0),
  }))
}

export async function getRelease(id: string): Promise<ReleaseDetail | null> {
  const r = await db.release.findUnique({
    where: { id },
    include: { entries: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { images: { orderBy: [{ pair: 'asc' }, { createdAt: 'asc' }] } } } },
  })
  if (!r) return null
  return toView(r)
}

async function toView(r: Prisma.ReleaseGetPayload<{ include: { entries: { include: { images: true } } } }>): Promise<ReleaseDetail> {
  const signed = await signImages(r.entries.flatMap(e => e.images))
  const byId = new Map(signed.map(s => [s.id, s]))
  return {
    id: r.id, releasedOn: day(r.releasedOn), summary: r.summary, summaryKa: r.summaryKa, status: r.status, clientVisible: r.clientVisible,
    publishedAt: r.publishedAt?.toISOString() ?? null, createdBy: r.createdBy, updatedAt: r.updatedAt.toISOString(),
    entries: r.entries.map(e => ({
      id: e.id, position: e.position, title: e.title, titleKa: e.titleKa, body: e.body, bodyKa: e.bodyKa, howTo: e.howTo, howToKa: e.howToKa,
      linkPath: e.linkPath, clientVisible: e.clientVisible, ticketRefs: e.ticketRefs, images: e.images.map(i => byId.get(i.id)!),
    })),
  }
}

/** What clients see: published + shown releases, only their client-visible entries, newest first. */
export async function listClientReleases(): Promise<ReleaseDetail[]> {
  const rows = await db.release.findMany({
    where: { status: 'PUBLISHED', clientVisible: true },
    orderBy: [{ releasedOn: 'desc' }, { publishedAt: 'desc' }],
    take: 50,
    include: { entries: { where: { clientVisible: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { images: { orderBy: [{ pair: 'asc' }, { createdAt: 'asc' }] } } } },
  })
  return Promise.all(rows.filter(r => r.entries.length > 0).map(toView))
}

/** For the admin menu: is there anything for clients, and is any of it newer than this user last saw? */
export async function clientReleaseBadge(userId: string | null): Promise<{ show: boolean; unseen: boolean }> {
  const latest = await db.release.findFirst({
    where: { status: 'PUBLISHED', clientVisible: true, entries: { some: { clientVisible: true } } },
    orderBy: { publishedAt: 'desc' }, select: { publishedAt: true },
  })
  if (!latest) return { show: false, unseen: false }
  if (!userId) return { show: true, unseen: false }
  const seen = await db.releaseView.findUnique({ where: { userId } })
  return { show: true, unseen: !seen || (!!latest.publishedAt && latest.publishedAt > seen.lastSeenAt) }
}

export async function markReleasesSeen(userId: string) {
  await db.releaseView.upsert({ where: { userId }, create: { userId }, update: { lastSeenAt: new Date() } })
}
