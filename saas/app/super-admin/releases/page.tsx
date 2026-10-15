import { headers } from 'next/headers'
import { getReleases } from '@/app/actions/releases'
import { environmentFromHost } from '@/lib/tickets'
import { tbilisiDateIso } from '@/lib/tbilisiTime'
import ReleasesClient from './ReleasesClient'

export const dynamic = 'force-dynamic'

export default async function ReleasesPage() {
  const [releases, h] = await Promise.all([getReleases(), headers()])
  return <ReleasesClient releases={releases} env={environmentFromHost(h.get('host'))} today={tbilisiDateIso(new Date())} />
}
