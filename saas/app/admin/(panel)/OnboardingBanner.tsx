import Link from 'next/link'
import { getSetting } from '@/app/actions/settings'
import { getOnboardingStatus } from '@/app/actions/onboarding'
import { adminT } from '@/lib/adminT'

/**
 * Persistent "finish setup" nudge for the onboarding wizard (#127).
 *
 * Renders nothing once the whole step is done — both the companies question
 * AND Individuals/walk-in pricing (computed live — see getOnboardingStatus)
 * so it never goes stale the way a stored flag would.
 */
export default async function OnboardingBanner() {
  const [status, adminLanguage] = await Promise.all([
    getOnboardingStatus(),
    getSetting('admin_language'),
  ])
  if (status.stepDone) return null

  const at = (key: string) => adminT(adminLanguage || 'en', key)

  return (
    // Phone: a slim two-line strip with the CTA shrunk to an arrow, so the page's
    // real content starts near the top of the screen. sm+: unchanged.
    <div
      className="rounded-xl border px-3 py-2 mb-3 sm:px-5 sm:py-4 sm:mb-6 flex items-center justify-between gap-3 sm:gap-4 sm:flex-wrap"
      style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}
    >
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-semibold" style={{ color: '#9a3412' }}>{at('onboarding.banner.title')}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 sm:mt-1 leading-snug" style={{ color: '#7c2d12' }}>{at('onboarding.banner.body')}</p>
      </div>
      <Link
        href="/admin/onboarding"
        aria-label={at('onboarding.banner.cta')}
        className="text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap flex-shrink-0"
        style={{ backgroundColor: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412' }}
      >
        <span className="sm:hidden" aria-hidden="true">→</span>
        <span className="hidden sm:inline">{at('onboarding.banner.cta')}</span>
      </Link>
    </div>
  )
}
