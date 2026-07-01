import { parseVault } from '@/lib/parseVault'
import { parseArchitecture } from '@/lib/parseArchitecture'
import FlowChart from '@/components/FlowChart'

export const dynamic = 'force-dynamic'

export default function Home() {
  const data = parseVault()
  const arch = parseArchitecture()
  return <FlowChart data={data} arch={arch} />
}
