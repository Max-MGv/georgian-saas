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
    <div
      className="rounded-xl border px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
      style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#9a3412' }}>{at('onboarding.banner.title')}</p>
        <p className="text-xs mt-1" style={{ color: '#7c2d12' }}>{at('onboarding.banner.body')}</p>
      </div>
      <Link
        href="/admin/onboarding"
        className="text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
        style={{ backgroundColor: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412' }}
      >
        {at('onboarding.banner.cta')}
      </Link>
    </div>
  )
}
