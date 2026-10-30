/**
 * Admin card links: how long they live, and which one is still open (T-318 Chunk 3).
 *
 * An admin's card link is a Flitt checkout whose `Payment.flittOrderId` carries the `-topup-` marker
 * (lib/payments/topUpCheckout.ts). Flitt has no way to cancel an unpaid link early, only to let it
 * expire — so "is there still a payable link for this order?" is a question about time:
 *
 *   - links made from this change on ask Flitt for a 7-day lifetime (Q-4) and say so in their
 *     reference (`-topup-7d-…`);
 *   - links made before it never set a lifetime, so Flitt's default 10 h applied (P-4). They carry no
 *     `7d` tag, and are treated as the 10-hour links they are.
 *
 * Putting the lifetime in the reference rather than a new column keeps this free of a migration and
 * means nothing has to guess from a date.
 */
import type { TxClient } from '@/lib/db'

/**
 * The marker inside `Payment.flittOrderId` that says "an admin made this card link" — as opposed
 * to the guest's own checkout at booking time, which sends the plain order id. Read by settle.ts
 * (which emails to send), the return route (result-page wording), the wine-orders page and this
 * module (which links are still open). Change them together (MaintenanceNotes).
 */
export const ADMIN_LINK_MARKER = '-topup-'

export function isAdminLinkPayment(flittOrderId: string | null | undefined): boolean {
  return !!flittOrderId && flittOrderId.includes(ADMIN_LINK_MARKER)
}

/** What admin links ask Flitt for. */
export const ADMIN_LINK_LIFETIME_SECONDS = 7 * 24 * 60 * 60

/** Tag written after the marker on every link made with the 7-day lifetime. */
export const LINK_7D_TAG = '7d-'

const TEN_HOURS_MS = 10 * 60 * 60 * 1000
const SEVEN_DAYS_MS = ADMIN_LINK_LIFETIME_SECONDS * 1000

/** How long this link lives, judged from its own reference. */
export function adminLinkLifetimeMs(flittOrderId: string | null | undefined): number {
  return flittOrderId?.includes(`${ADMIN_LINK_MARKER}${LINK_7D_TAG}`) ? SEVEN_DAYS_MS : TEN_HOURS_MS
}

/** When an admin link stops being payable. */
export function adminLinkExpiresAt(createdAt: Date, flittOrderId: string | null | undefined): Date {
  return new Date(createdAt.getTime() + adminLinkLifetimeMs(flittOrderId))
}

export type OpenAdminLink = {
  id: string
  amount: number
  checkoutUrl: string
  createdAt: Date
  expiresAt: Date
  /** 'created' / 'processing', or 'declined' when asked for with `includeDeclined`. */
  status: string
}

/**
 * The advisory-lock key that serialises everything which creates, or deletes the order under, an admin
 * link: link creation (topUpCheckout.ts) and order delete (actions/orders.ts) must use the same key.
 */
export function adminLinkLockKey(ref: { orderId: string } | { wineOrderId: string }): string {
  return `admin-link:${'orderId' in ref ? ref.orderId : ref.wineOrderId}`
}

/**
 * The newest admin link on this order that can still be paid: not settled, not reversed, still in
 * flight or waiting (`created` / `processing`), and not past its lifetime. Null when there is none.
 *
 * One open link per order (Q-5): Card shows this one again instead of making a second, and Bank /
 * Cash warn that it can still be paid until `expiresAt` — it cannot be cancelled.
 */
export async function findOpenAdminLink(
  client: TxClient,
  ref: { orderId: string } | { wineOrderId: string },
  opts: {
    now?: Date
    /** Only a link for exactly this amount (tetri). Reuse asks this way: with two open links of
     *  different amounts, "the newest" is not necessarily the one being asked for. */
    amount?: number
    /** Also count the guest's OWN checkout (no admin marker; payable for ~10 h after it was made). Used by the
     *  Bank / Cash warning: an abandoned order is exactly an order with such a checkout still open. */
    includeGuest?: boolean
    /** Also a link whose last attempt was declined. Flitt lets the payer retry on the same link until it
     *  expires, so it can still turn into money. For the Bank / Cash warning and the delete guard only —
     *  it is never offered as a link to copy or resend. */
    includeDeclined?: boolean
  } = {}
): Promise<OpenAdminLink | null> {
  const now = opts.now ?? new Date()
  const rows = await client.payment.findMany({
    where: {
      ...ref,
      provider: 'flitt',
      status: { in: opts.includeDeclined ? ['created', 'processing', 'declined'] : ['created', 'processing'] },
      settledAt: null,
      reversedAt: null,
      ...(opts.includeGuest ? {} : { flittOrderId: { contains: ADMIN_LINK_MARKER } }),
      ...(opts.amount !== undefined ? { amount: opts.amount } : {}),
      // coarse cut: nothing older than the longest lifetime can be open
      createdAt: { gt: new Date(now.getTime() - SEVEN_DAYS_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, checkoutUrl: true, createdAt: true, flittOrderId: true, status: true },
  })
  for (const r of rows) {
    if (!r.checkoutUrl || (!opts.includeGuest && !isAdminLinkPayment(r.flittOrderId))) continue
    const expiresAt = adminLinkExpiresAt(r.createdAt, r.flittOrderId)
    if (expiresAt > now) return { id: r.id, amount: r.amount, checkoutUrl: r.checkoutUrl, createdAt: r.createdAt, expiresAt, status: r.status }
  }
  return null
}

export const CARD_TRAIL_DELETE_REFUSAL =
  'This order has card payments or a card link that can still be paid, so it cannot be deleted. Cancel it instead.'

/**
 * Why a booking must not be deleted, or null when it may be. Deleting an order deletes its Payment rows
 * (the schema cascades), so an order with card money on it, or a card link that can still be paid, would
 * lose the only record of money that sits in Flitt — and a payment arriving after the delete would find
 * nothing to attach to. Cancel keeps the trail. Manual (Bank / Cash) payments are not a reason to refuse.
 */
export async function cardTrailDeleteRefusal(
  client: TxClient,
  ref: { orderId: string } | { wineOrderId: string }
): Promise<string | null> {
  const settled = await client.payment.count({
    where: { ...ref, provider: 'flitt', settledAt: { not: null }, reversedAt: null },
  })
  if (settled > 0) return CARD_TRAIL_DELETE_REFUSAL
  const open = await findOpenAdminLink(client, ref, { includeGuest: true, includeDeclined: true })
  return open ? CARD_TRAIL_DELETE_REFUSAL : null
}

/**
 * Why an existing admin link must not be emailed to the guest any more, or null when it still can be:
 * the order was cancelled, the link was already paid, or it has expired (a dead link in an email
 * is worse than none). Pure, so the rule is tested without a request.
 */
export function linkEmailRefusal(
  link: { settledAt: Date | null; createdAt: Date; flittOrderId: string | null; amount?: number },
  orderStage: string,
  now: Date = new Date(),
  /** What the order still owes right now (tetri), when known. A link for more than that would overpay:
   *  the order was paid some other way (or partly) after the link was made. */
  stillOwed?: number
): string | null {
  if (orderStage === 'CANCELLED') return 'This order is cancelled, so it cannot take a payment.'
  if (link.settledAt) return 'This link has already been paid.'
  if (adminLinkExpiresAt(link.createdAt, link.flittOrderId) <= now) return 'This link has expired — make a new one.'
  if (stillOwed !== undefined && link.amount !== undefined && link.amount > stillOwed) {
    return 'This order no longer owes this amount (it was paid some other way since the link was made), so the link is not sent.'
  }
  return null
}

/**
 * Which unsettled Flitt payments the daily reconcile job still asks Flitt about (KnownBugs #61).
 *
 * Guest checkouts live 10 h, so 7 days after creation is plenty. An admin link lives up to 7 days and
 * can be paid on its last day by a customer whose callbacks then all failed — those must still be
 * caught, so the window for them is the lifetime plus 2 days (Q-13). Payments younger than an hour
 * are left alone: their callback may still be on its way.
 */
export function reconcileCandidateWhere(nowMs: number) {
  const day = 24 * 60 * 60 * 1000
  return {
    provider: 'flitt',
    status: 'created',
    settledAt: null,
    createdAt: { lt: new Date(nowMs - 60 * 60 * 1000) },
    OR: [
      { createdAt: { gt: new Date(nowMs - 7 * day) } },
      { flittOrderId: { contains: ADMIN_LINK_MARKER }, createdAt: { gt: new Date(nowMs - 9 * day) } },
    ],
  }
}
