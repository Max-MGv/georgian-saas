import { parseVault } from '@/lib/parseVault'
import FlowChart from '@/components/FlowChart'

export const dynamic = 'force-dynamic'

export default function Home() {
  const data = parseVault()
  return <FlowChart data={data} />
}
