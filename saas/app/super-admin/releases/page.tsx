import { headers } from 'next/headers'
import { getReleaseDetail, getReleases } from '@/app/actions/releases'
import { environmentFromHost } from '@/lib/tickets'
import { tbilisiDateIso } from '@/lib/tbilisiTime'
import ReleasesClient from './ReleasesClient'

export const dynamic = 'force-dynamic'

export default async function ReleasesPage() {
  const [releases, h] = await Promise.all([getReleases(), headers()])
  // The reading view (default) shows the newest releases in full, the way clients read them.
  const details = (await Promise.all(releases.slice(0, 20).map(r => getReleaseDetail(r.id)))).filter(d => d !== null)
  return <ReleasesClient releases={releases} details={details} env={environmentFromHost(h.get('host'))} today={tbilisiDateIso(new Date())} />
}
