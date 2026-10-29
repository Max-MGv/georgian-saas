/**
 * Card-link top-up (Plan-PostPaymentExtras Chunk 4, KnownBugs #64).
 *
 * ## What this closes
 *
 * Chunk 3 gave the admin a way to record a manual (cash/bank transfer)
 * top-up against an already-paid order's balance due. The guest may only
 * have a card, though — this is this app's own minimal version of Flitt's
 * "Pay by Link" (which turned out not to be usable via API, see
 * Plan-PaymentE2ETesting.md §1b): the admin starts a real Flitt checkout for
 * just the outstanding amount and it's emailed to the guest, so they can pay
 * with their own card without the admin ever handling it.
 *
 * ## Why this needs its own function, not a second call to startCheckout()
 *
 * `startCheckout()` sends `input.orderId` straight through as Flitt's own
 * `order_id` — correct for the ordinary first checkout at booking time, but
 * Flitt's live API rejects a SECOND checkout that reuses that same
 * `order_id` outright, regardless of the first payment's settlement state
 * (confirmed live during the design spike, Plan-PaymentE2ETesting.md's
 * "Design spike (2026-09-25)" §3). `startCheckout()` grew an optional
 * `flittOrderId` override for exactly this — this module is the one caller
 * that supplies one, minted fresh per attempt via `mintTopUpFlittOrderId`.
 * `Payment.orderId` still always carries the real internal order id; the
 * minted value handed to Flitt as `order_id` is persisted separately on
 * `Payment.flittOrderId` (schema.prisma), so this decoupling costs nothing —
 * the reconciliation cron (KnownBugs.md #61) reads that column rather than
 * guessing.
 *
 * ## Not gated by shouldTakePayment()
 *
 * Ground rule 5: a top-up is the admin's own deliberate choice, made after
 * the fact, independent of the tenant's module toggle, section toggles, or
 * any company override — those govern whether a GUEST'S OWN booking gets a
 * payment step. The only thing this module checks is whether the tenant has
 * Flitt credentials configured at all — not a policy toggle, just "is there
 * anything to call".
 *
 * ## Balance validation is a UX guard here, not the final authority
 *
 * Unlike `recordAdditionalPayment` (Chunk 3), which validates and writes the
 * `Payment` row in one atomic transaction, this function's "write" is an
 * external HTTP call to Flitt's checkout API — which cannot itself run
 * inside a database transaction. The balance is read fresh immediately
 * before that call, same arithmetic as `recordAdditionalPayment`
 * (`balanceDue(totalPrice, settled)`), so a same-request race is no more
 * likely here than it already is for the original checkout flow. The
 * genuine, authoritative check on what actually gets collected is Flitt's
 * own signed settlement callback through `settle.ts` — this check only
 * stops the admin from generating a link for an amount that's already
 * wrong at the moment they click the button.
 */
import { db } from '@/lib/db'
import { balanceDue, formatTetri, type Tetri } from '@/lib/money'
import { startCheckout } from '@/lib/payments/startCheckout'
import { wineOrderBalance, CANCELLED_REFUSAL } from '@/lib/payments/manualPayment'
import {
  ADMIN_LINK_MARKER, ADMIN_LINK_LIFETIME_SECONDS, LINK_7D_TAG, adminLinkExpiresAt, findOpenAdminLink,
} from '@/lib/payments/openLink'
import { getAllSettings } from '@/app/actions/settings'
import { settingValue } from '@/lib/settings'

/**
 * A fresh, traceable-by-eye Flitt-facing order_id for one top-up checkout
 * attempt. Distinct from the real order id (never reused as Flitt's own
 * reference for a second attempt) and distinct from any previous top-up
 * attempt for the same order (timestamp + random suffix) — both are real,
 * previously-confirmed collision risks (finding 3): Flitt rejects a reused
 * order_id outright, whether the reuse is against the original checkout or
 * against an earlier, possibly-abandoned top-up attempt for the same order.
 */
export function mintTopUpFlittOrderId(orderId: string): string {
  // `7d-` tags a link made with the 7-day lifetime (lib/payments/openLink.ts reads it back).
  return `${orderId}${ADMIN_LINK_MARKER}${LINK_7D_TAG}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Server-side rules for any admin card link (T-318 Chunk 2) — the screens hide the button, but the
 * server is what refuses. A cancelled order takes no payment (money arriving later is recorded but
 * not marked Paid — settle.ts), and an order without a price has nothing to charge ("Set the price
 * first", the same words Q-11 uses for Mark paid).
 */
function linkRefusal(o: { stage: string; total: number | null }): string | null {
  if (o.stage === 'CANCELLED') return CANCELLED_REFUSAL
  if (o.total === null || o.total <= 0) return 'Set the price first.'
  return null
}

/**
 * On an UNPAID order a card link works like Bank / Cash: it collects the full amount still owed
 * (Q-1, Max 2026-10-29), not a part. The editable amount belongs to the top-up on an already-paid
 * order (extras added later), which is the only link the screens offer today.
 */
function unpaidLinkMustBeFull(balance: number): string {
  return `A payment link for an unpaid order collects the full amount owed (${formatTetri(balance as Tetri, { decimals: true })}).`
}

export type StartTopUpCheckoutInput = {
  orderId: string
  tenantId: string
  amount: Tetri
  orderDesc: string
  locale?: string
}

export type StartTopUpCheckoutResult =
  | {
      success: true
      checkoutUrl: string
      paymentId: string
      /** When the link stops working (ISO). */
      expiresAt: string
      /** True when an already-open link for the same amount was handed back instead of a new one. */
      reused?: boolean
    }
  | { error: string }

/**
 * The Flitt page's language for an admin link (Q-8): the admin's own language setting, else the
 * winery's default, else English. The customer opens it on their phone; the admin only ever sees
 * the link. Read from settings by tenant id — no request context is needed.
 */
async function checkoutLocale(tenantId: string): Promise<'ka' | 'en'> {
  return pickCheckoutLocale(await getAllSettings(tenantId))
}

/**
 * The choice itself, on the tenant's STORED settings. Looks at the stored `admin_language` only —
 * `settingValue` would fall back to its built-in default 'en', which is always set, so the winery's
 * own default language was never reached (found by the blind test, 2026-10-29).
 */
export function pickCheckoutLocale(stored: Record<string, string>): 'ka' | 'en' {
  const l = stored['admin_language'] || settingValue(stored, 'default_locale')
  return l === 'ka' ? 'ka' : 'en'
}

/** One open link per order (Q-5): the same amount again hands back the link that is already payable. */
async function reuseOpenLink(
  ref: { orderId: string } | { wineOrderId: string },
  amount: number
): Promise<StartTopUpCheckoutResult | null> {
  const open = await findOpenAdminLink(db, ref, { amount })
  if (!open) return null
  return { success: true, checkoutUrl: open.checkoutUrl, paymentId: open.id, expiresAt: open.expiresAt.toISOString(), reused: true }
}

export async function startTopUpCheckout(
  input: StartTopUpCheckoutInput
): Promise<StartTopUpCheckoutResult> {
  if (input.amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }

  const order = await db.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { totalPrice: true, stage: true, paidAt: true },
  })
  if (!order) return { error: 'Order not found.' }
  const refused = linkRefusal({ stage: order.stage, total: order.totalPrice })
  if (refused) return { error: refused }

  const settled = await db.payment.aggregate({
    where: { orderId: input.orderId, settledAt: { not: null }, reversedAt: null },
    _sum: { amount: true },
  })
  const currentBalance = balanceDue(order.totalPrice, settled._sum.amount ?? 0)

  if (order.paidAt == null && input.amount !== currentBalance) return { error: unpaidLinkMustBeFull(currentBalance) }
  if (input.amount > currentBalance) {
    return {
      error:
        `That's more than the outstanding balance of ${formatTetri(currentBalance, { decimals: true })}. ` +
        `Generate a link for at most the balance due — if more than that is genuinely owed, add it as an extra first.`,
    }
  }

  return (await reuseOpenLink({ orderId: input.orderId }, input.amount)) ?? runTopUpCheckout({ orderId: input.orderId }, input)
}

/**
 * The wine-order sibling (T-8, vault/Plan-WineOrderFeatures.md Chunk 6b): a card link for what a
 * paid wine order still owes — in practice a delivery fee set after the wine was paid. Same
 * rules as above; the balance is wines + fee − live payments (`wineOrderBalance`).
 */
export async function startWineTopUpCheckout(
  input: { wineOrderId: string; tenantId: string; amount: Tetri; orderDesc: string; locale?: string }
): Promise<StartTopUpCheckoutResult> {
  if (input.amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }
  const wine = await db.wineOrder.findFirst({
    where: { id: input.wineOrderId, tenantId: input.tenantId },
    select: { stage: true, paidAt: true, totalAmount: true },
  })
  if (!wine) return { error: 'Wine order not found.' }
  const refused = linkRefusal({ stage: wine.stage, total: wine.totalAmount })
  if (refused) return { error: refused }

  const owed = await wineOrderBalance(db, { wineOrderId: input.wineOrderId, tenantId: input.tenantId })
  if ('error' in owed) return owed
  if (wine.paidAt == null && input.amount !== owed.balance) return { error: unpaidLinkMustBeFull(owed.balance) }
  if (input.amount > owed.balance) {
    return {
      error: `That's more than the outstanding balance of ${formatTetri(owed.balance, { decimals: true })}.`,
    }
  }
  return (await reuseOpenLink({ wineOrderId: input.wineOrderId }, input.amount)) ?? runTopUpCheckout({ wineOrderId: input.wineOrderId }, input)
}

/** Credentials + the Flitt call + finding our own Payment row — shared by both top-ups. */
async function runTopUpCheckout(
  target: { orderId: string } | { wineOrderId: string },
  input: { tenantId: string; amount: Tetri; orderDesc: string; locale?: string }
): Promise<StartTopUpCheckoutResult> {
  const internalId = 'orderId' in target ? target.orderId : target.wineOrderId
  // Credentials only — deliberately NOT shouldTakePayment()/isPaymentConfigured()'s
  // module/section toggles or company override (ground rule 5). Read directly
  // from Tenant, same fields shouldTakePayment() itself reads, but with none
  // of its business-policy gating.
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { flittMerchantId: true, flittSecretKey: true },
  })
  const merchantId = tenant?.flittMerchantId?.trim()
  const secretKey = tenant?.flittSecretKey
  if (!merchantId || !secretKey) {
    return {
      error: 'Card payments are not set up for this tenant yet — add Flitt credentials in Settings first.',
    }
  }

  const flittOrderId = mintTopUpFlittOrderId(internalId)

  const checkoutUrl = await startCheckout({
    tenantId: input.tenantId,
    merchantId,
    secretKey,
    ...target,
    amount: input.amount,
    orderDesc: input.orderDesc,
    locale: input.locale ?? (await checkoutLocale(input.tenantId)),
    flittOrderId,
    // 7 days instead of Flitt's 10 h default (Q-4). The guest's own checkout keeps the default.
    lifetimeSeconds: ADMIN_LINK_LIFETIME_SECONDS,
  })

  if (!checkoutUrl) {
    return { error: 'Could not start a checkout with the payment provider. Try again in a moment.' }
  }

  // startCheckout() writes the Payment row itself (service-role, no tx — see
  // its own doc comment) and doesn't hand the new row's id back, only the
  // URL. Re-reading it here rather than trusting anything client-supplied
  // later: the follow-up "email this link" step looks the row up by this id,
  // not by a checkoutUrl/amount pair a browser could have tampered with.
  const paymentRow = await db.payment.findFirst({
    where: { ...target, tenantId: input.tenantId, provider: 'flitt', checkoutUrl },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  })
  if (!paymentRow) {
    // Should not happen — startCheckout() only returns a URL after its own
    // db.payment.create() succeeds — but a guest must never be handed a link
    // this app itself cannot later find and settle.
    return { error: 'Checkout was created but could not be located afterward. Do not send this link — contact support.' }
  }

  return {
    success: true,
    checkoutUrl,
    paymentId: paymentRow.id,
    expiresAt: adminLinkExpiresAt(paymentRow.createdAt, flittOrderId).toISOString(),
  }
}
