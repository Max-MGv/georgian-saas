'use server'

/**
 * Super-admin server actions for the internal ticket tool (Plan-Tickets.md). Every
 * export starts with requireSuperAdmin(); the rules themselves live in
 * lib/ticketService.ts so the token API shares them.
 */

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { createServiceClient } from '@/lib/supabase/service'
import {
  TicketError, addAttachmentRow, addComment, changeStatus, createTicket, findIdByNumber, getTicketByNumber,
  listTickets, postReview, sendBack, updateFields, verify,
  type ReviewCard, type TicketDetail, type TicketListItem, type TicketPatch,
} from '@/lib/ticketService'
import { ALLOWED_IMAGE_TYPES, sniffImageType, type TicketStatusValue } from '@/lib/tickets'
import type { TicketCloseReason, TicketPriority, TicketType } from '@prisma/client'

const ACTOR = 'max'
const ATTACH_BUCKET = 'ticket-attachments'
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024 // Vercel rejects request bodies over ~4.5 MB (KnownBugs #72)

export type ActionResult<T = unknown> = ({ ok: true } & T) | { error: string }

async function guard<T>(fn: () => Promise<T>): Promise<({ ok: true } & T) | { error: string }> {
  await requireSuperAdmin()
  try {
    const out = await fn()
    revalidatePath('/super-admin/tickets')
    return { ok: true, ...(out as object) } as { ok: true } & T
  } catch (e) {
    if (e instanceof TicketError) return { error: e.message }
    console.error('[tickets action]', e)
    return { error: 'Something went wrong. Please try again.' }
  }
}

// ── Reads ───────────────────────────────────────────────────────────────

export async function getTickets(): Promise<TicketListItem[]> {
  await requireSuperAdmin()
  return listTickets()
}

export async function getTicket(number: number): Promise<TicketDetail | null> {
  await requireSuperAdmin()
  return getTicketByNumber(number)
}

export async function getTenantOptions(): Promise<{ id: string; name: string }[]> {
  await requireSuperAdmin()
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, displayName: true }, orderBy: { name: 'asc' } })
  return tenants.map(t => ({ id: t.id, name: t.displayName ?? t.name }))
}

// ── Creating ────────────────────────────────────────────────────────────

export type QuickAddInput = {
  title: string
  description?: string
  type?: TicketType
  priority?: TicketPriority
  area?: string | null
  tenantId?: string | null
  labels?: string[]
}

export async function createTicketAction(input: QuickAddInput): Promise<ActionResult<{ number: number }>> {
  return guard(async () => {
    const t = await createTicket({ ...input, source: 'MANUAL', createdBy: ACTOR })
    return { number: t.number }
  })
}

/** One ticket per non-empty line. Lines starting with "- ", "* " or "• " are fine (pasted lists). */
export async function bulkCreateTickets(
  lines: string[],
  defaults: { type?: TicketType; priority?: TicketPriority; area?: string | null; tenantId?: string | null } = {},
): Promise<ActionResult<{ numbers: number[] }>> {
  return guard(async () => {
    const titles = lines.map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, 50)
    if (titles.length === 0) throw new TicketError('Paste at least one line.')
    const numbers: number[] = []
    for (const title of titles) {
      const t = await createTicket({ title, ...defaults, source: 'MANUAL', createdBy: ACTOR })
      numbers.push(t.number)
    }
    return { numbers }
  })
}

// ── Changing ────────────────────────────────────────────────────────────

export async function updateTicketFields(number: number, patch: TicketPatch): Promise<ActionResult> {
  return guard(async () => { await updateFields(await findIdByNumber(number), patch, ACTOR); return {} })
}

export async function moveTicket(number: number, status: TicketStatusValue, closeReason?: TicketCloseReason | null): Promise<ActionResult> {
  return guard(async () => { await changeStatus(await findIdByNumber(number), status, ACTOR, { closeReason }); return {} })
}

export async function commentOnTicket(number: number, body: string): Promise<ActionResult> {
  return guard(async () => { await addComment(await findIdByNumber(number), body, ACTOR); return {} })
}

export async function postReviewCard(number: number, card: ReviewCard): Promise<ActionResult> {
  return guard(async () => { await postReview(await findIdByNumber(number), card, ACTOR); return {} })
}

export async function verifyTicket(number: number, note?: string): Promise<ActionResult> {
  return guard(async () => { await verify(await findIdByNumber(number), ACTOR, note); return {} })
}

export async function sendTicketBack(number: number, note: string): Promise<ActionResult> {
  return guard(async () => { await sendBack(await findIdByNumber(number), note, ACTOR); return {} })
}

// ── Attachments ─────────────────────────────────────────────────────────

/** formData: `number`, `file`. Images only (PNG/JPEG/WebP/GIF, type decided by the bytes), max 4 MB. */
export async function uploadTicketAttachment(formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const number = Number(formData.get('number'))
    const file = formData.get('file')
    if (!Number.isInteger(number)) throw new TicketError('Invalid ticket.')
    if (!(file instanceof File) || file.size === 0) throw new TicketError('Choose an image first.')
    if (file.size > MAX_ATTACHMENT_BYTES) throw new TicketError('Image is too large (max 4 MB).')
    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = sniffImageType(bytes)
    if (!mime || !ALLOWED_IMAGE_TYPES[mime]) throw new TicketError('Only PNG, JPEG, WebP or GIF images can be attached.')
    const ticketId = await findIdByNumber(number)
    const ext = ALLOWED_IMAGE_TYPES[mime]
    const path = `${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const { error } = await createServiceClient().storage.from(ATTACH_BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (error) { console.error('[uploadTicketAttachment]', error); throw new TicketError('Upload failed. Please try again.') }
    const safeName = (file.name || `image.${ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 80)
    await addAttachmentRow(ticketId, { storagePath: path, bucket: ATTACH_BUCKET, fileName: safeName, mimeType: mime, sizeBytes: bytes.length })
    await db.ticketEvent.create({ data: { ticketId, kind: 'COMMENT', body: `Attached ${safeName}`, actor: ACTOR } })
    return {}
  })
}
