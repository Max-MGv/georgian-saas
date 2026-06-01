import { db } from '@/lib/db'
import ContentClient from './ContentClient'

export default async function ContentPage() {
  const allRows = await db.siteContent.findMany()
  const en = allRows.filter(r => r.locale === 'en')
  const ka = allRows.filter(r => r.locale === 'ka')
  return <ContentClient rows={{ en, ka }} />
}
