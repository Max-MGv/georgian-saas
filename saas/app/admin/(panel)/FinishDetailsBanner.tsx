import Link from 'next/link'
import { getSetting } from '@/app/actions/settings'
import { getFinishDetailsStatus } from '@/app/actions/onboarding'
import { adminT } from '@/lib/adminT'

/**
 * Post-launch "finish full details" nudge (#127 Phase 3) — separate from
 * OnboardingBanner. Once readyToLaunch is true, the wizard's own banner goes
 * away for good, but individual Company/Wine records (wizard-created or not)
 * can still have blank fields, bank-transfer details can be partially filled,
 * Menu/Masterclass items can be declared-but-never-added, and the optional
 * maps-embed/contact/photos items can still be skipped. This surfaces that
 * gap. Renders nothing once there's nothing outstanding — see
 * getFinishDetailsStatus. Rendered from the shared (panel) layout (not a
 * specific page) so tenants without the booking module enabled — who'd never
 * see /admin/orders in their nav at all — aren't blind to it.
 */
export default async function FinishDetailsBanner() {
  const [status, adminLanguage] = await Promise.all([
    getFinishDetailsStatus(),
    getSetting('admin_language'),
  ])
  if (!status.hasOutstandingItems) return null

  const at = (key: string, vars?: Record<string, string | number>) => adminT(adminLanguage || 'en', key, vars)

  const {
    paymentPartial, companiesNeedingDetails, winesNeedingDetails, bookingDetailsIncomplete,
    contactInfoStepDone, mapsEmbedSet, contentPhotosStepDone,
  } = status

  // Priority-ordered "surface the single most important outstanding thing" —
  // replaces the old dual-dimension (companies × wines) combinatorial approach,
  // which doesn't scale past 2 dimensions (13 keys for 2; this wizard now has
  // 6+). Order follows revenue/guest-facing impact first: payment → companies
  // → wines → booking details → contact → maps → photos. Only one condition is
  // ever named at a time — hasOutstandingItems (computed in onboarding.ts) is
  // the OR of everything below, so this if-chain always finds a match once it's
  // true.
  let body: string
  let href: string
  if (paymentPartial) {
    body = at('finishDetails.banner.bodyPayment')
    href = '/admin/settings'
  } else if (companiesNeedingDetails > 0) {
    body = at(companiesNeedingDetails === 1 ? 'finishDetails.banner.bodyCompaniesOnlySingular' : 'finishDetails.banner.bodyCompaniesOnlyPlural', { companies: companiesNeedingDetails })
    href = '/admin/companies'
  } else if (winesNeedingDetails > 0) {
    body = at(winesNeedingDetails === 1 ? 'finishDetails.banner.bodyWinesOnlySingular' : 'finishDetails.banner.bodyWinesOnlyPlural', { wines: winesNeedingDetails })
    href = '/admin/wines'
  } else if (bookingDetailsIncomplete) {
    body = at('finishDetails.banner.bodyBookingDetails')
    href = '/admin/menu-items'
  } else if (!contactInfoStepDone) {
    body = at('finishDetails.banner.bodyContactOnly')
    href = '/admin/settings'
  } else if (!mapsEmbedSet) {
    body = at('finishDetails.banner.bodyMaps')
    href = '/admin/settings'
  } else {
    body = at('finishDetails.banner.bodyPhotosOnly')
    href = '/admin/content'
  }

  return (
    <div
      className="rounded-xl border px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
      style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#9a3412' }}>{at('finishDetails.banner.title')}</p>
        <p className="text-xs mt-1" style={{ color: '#7c2d12' }}>{body}</p>
      </div>
      <Link
        href={href}
        className="text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
        style={{ backgroundColor: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412' }}
      >
        {at('finishDetails.banner.cta')}
      </Link>
    </div>
  )
}
