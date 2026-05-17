import { parseVault, parseArchitecture } from '@/lib/parseVault'
import FlowChart from '@/components/FlowChart'

export default function Home() {
  const data = parseVault()
  const arch = parseArchitecture()
  return <FlowChart data={data} arch={arch} />
}
