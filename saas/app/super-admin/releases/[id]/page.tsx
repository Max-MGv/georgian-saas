import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getReleaseDetail } from '@/app/actions/releases'
import { environmentFromHost } from '@/lib/tickets'
import ReleaseEditor from './ReleaseEditor'

export const dynamic = 'force-dynamic'

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [release, h] = await Promise.all([getReleaseDetail(id), headers()])
  if (!release) notFound()
  return <ReleaseEditor release={release} env={environmentFromHost(h.get('host'))} />
}
