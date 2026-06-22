import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function withTenantDb<T>(
  tenantId: string,
  fn: (tx: TxClient) => Promise<T>
): Promise<T> {
  // RLS via app_user role is a future enhancement (setup-rls.ts not yet run).
  // Tenant isolation is enforced by `where: { tenantId }` in every query.
  return fn(db)
}
