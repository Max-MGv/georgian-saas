import { parseVault, parseArchitecture, parseSystemOverview } from '@/lib/parseVault'
import FlowChart from '@/components/FlowChart'

export default function Home() {
  const data = parseVault()
  const arch = parseArchitecture()
  const overview = parseSystemOverview()
  return <FlowChart data={data} arch={arch} overview={overview} />
}
