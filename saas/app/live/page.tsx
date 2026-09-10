import { notFound } from 'next/navigation'
import { getTenantId } from '@/lib/tenant'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import LiveMirrorClient from './LiveMirrorClient'

/**
 * /live — the two-pane demo view (Plan-DemoRedesign Phase 4).
 *
 * 404s for every tenant but the demo. This route embeds the admin panel in an
 * iframe and signs the browser in as a shared account to do it; that is
 * appropriate for a sandbox whose credentials are deliberately public, and
 * appropriate nowhere else. Gating server-side rather than in the client
 * component means a real winery's deployment never even serves the page.
 */
export default async function LivePage() {
  const tenantId = await getTenantId()
  if (tenantId !== DEMO_TENANT_ID) notFound()
  return <LiveMirrorClient />
}
