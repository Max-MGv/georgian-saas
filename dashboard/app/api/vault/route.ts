import { parseVault } from '@/lib/parseVault'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = parseVault()
  return Response.json(data)
}
