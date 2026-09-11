import { getTenantId } from '@/lib/tenant'
import DemoModeBanner from '@/components/DemoModeBanner'
import DemoTour from '@/components/DemoTour'
import DemoFeatureRail from '@/components/DemoFeatureRail'

/**
 * Mounts the demo chrome on `/admin/onboarding` — Plan-DemoFlowFixes Chunk 8,
 * task 8.3.
 *
 * The setup wizard renders *outside* the admin panel's `(panel)` layout, which
 * is where every demo component is mounted. So the front door's fourth card —
 * "How fast is setup?" — quietly dropped the visitor out of the guided demo
 * entirely: no demo banner, no "Customer View" switch, no tour pill, no feature
 * rail, and only a small "← Back to admin" link as a way out. One of four paths
 * off the front door lost the demo.
 *
 * Its own route layout rather than `app/admin/layout.tsx`: that file wraps
 * `(panel)` too, so mounting there would render every demo component twice on
 * every other admin page.
 *
 * Each component gates itself on `DEMO_TENANT_ID` and renders nothing for
 * anyone else, so a real winery's wizard is untouched — this layout adds one
 * `getTenantId()` call to that route and nothing else.
 *
 * `DemoTour` is included deliberately even though no tour *step* lives on this
 * route: off-step it shrinks to the corner pill, which is precisely the way
 * back into the guided flow this page was missing.
 */
export default async function OnboardingDemoChromeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenantId = await getTenantId()
  return (
    <>
      <DemoModeBanner tenantId={tenantId} />
      <DemoTour tenantId={tenantId} />
      <DemoFeatureRail tenantId={tenantId} />
      {children}
    </>
  )
}
