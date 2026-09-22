/**
 * Sets up the app_user role and RLS policies in Supabase.
 * Run once: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/setup-rls.ts
 *
 * What it does:
 *  1. Creates the app_user role (NOLOGIN — only used via SET LOCAL ROLE inside transactions)
 *  2. Grants table permissions (non-superuser can read/write tenant data, but not Tenant itself)
 *  3. Creates RLS policies so rows are visible only when app.tenant_id matches
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('Creating app_user role...')
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
      END IF;
    END $$;
  `)

  // Allow the postgres role (Prisma's connection role) to switch into app_user
  console.log('Granting app_user membership to postgres...')
  await db.$executeRawUnsafe(`GRANT app_user TO postgres;`)

  console.log('Granting schema and sequence usage...')
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO app_user;`)
  await db.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;`)

  // Tables app_user can fully read/write (all tenanted tables)
  const writableTables = [
    'Order', 'Company', 'Price', 'Wine', 'WineVintage', 'WineOrder', 'WineOrderItem',
    'MenuItem', 'MasterclassItem', 'OrderMasterclass', 'OrderExtra',
    'BlockedDate', 'SiteContent', 'Setting', 'Payment',
    // Contact roles (Plan-ContactRoles, 2026-09-22). Three shapes in one feature:
    // ContactRole carries its own tenantId (a role belongs to the winery, not to one
    // company), CompanyPerson is JOIN-to-Company like Price, and OrderContact carries its
    // own tenantId like OrderEvent despite being a child of Order/WineOrder.
    'ContactRole', 'CompanyPerson', 'OrderContact',
    // Demo analytics (2026-09-12). Only ever holds the demo tenant's rows, and
    // the server action refuses any other tenant — but it carries a tenantId and
    // goes through the same GRANT + policy as everything else, because a table
    // that opts out of RLS is a table someone has to remember is special.
    'DemoEvent',
    // Order history (chunk 5, 2026-09-18). Append-only by convention in the
    // application, not by grant: UPDATE/DELETE are granted like every other
    // table so that deleting an order can cascade its events away. Nothing in
    // the app ever updates a row here.
    'OrderEvent',
  ]
  for (const t of writableTables) {
    console.log(`  GRANT SELECT/INSERT/UPDATE/DELETE on "${t}"`)
    await db.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON "${t}" TO app_user;`
    )
  }

  // Tenant table: SELECT only (needed for proxy.ts tenant lookup — but proxy uses superuser anyway)
  await db.$executeRawUnsafe(`GRANT SELECT ON "Tenant" TO app_user;`)

  // ── RLS policies ──────────────────────────────────────────────────────────
  // Ensure RLS is switched on — existing tables were enabled via the Supabase
  // dashboard, but tables created later by `prisma db push` start with RLS off
  for (const t of writableTables) {
    await db.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`)
  }

  // Tables with a direct tenantId column
  const tenantedTables = [
    'Order', 'Company', 'Wine', 'WineVintage', 'WineOrder',
    'MenuItem', 'MasterclassItem', 'BlockedDate', 'SiteContent', 'Setting', 'Payment',
    'DemoEvent',
    // Carries its own tenantId, so it takes the simplest of the three policy
    // shapes rather than the JOIN-to-parent one Price and the line tables need.
    'OrderEvent',
    // Plan-ContactRoles. ContactRole is tenant-owned outright; OrderContact is a child of
    // Order/WineOrder but carries its own tenantId exactly as OrderEvent does, so both take
    // the direct policy rather than a polymorphic JOIN.
    //
    // WARNING, and it bit during this very chunk: a table listed in writableTables gets RLS
    // ENABLED, but only a table listed *here* gets a policy. Enabled-with-no-policy is the
    // worst of both worlds — Postgres default-denies every row, reads come back empty with no
    // error, and check-rls.ts still reports the table as fine. Same silent shape as
    // MaintenanceNotes #27. Adding a table to one list and not the other is the mistake to
    // watch for.
    //
    // Both tenantId columns are nullable, and NULL compares as NULL — never true — so a row
    // written without one is invisible to every tenant. The write path must always set it.
    'ContactRole', 'OrderContact',
  ]

  for (const t of tenantedTables) {
    console.log(`Creating policy on "${t}"...`)
    // Drop old policy if it exists, then create fresh
    await db.$executeRawUnsafe(`
      DROP POLICY IF EXISTS tenant_isolation ON "${t}";
    `)
    await db.$executeRawUnsafe(`
      CREATE POLICY tenant_isolation ON "${t}"
        USING ("tenantId" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
    `)
  }

  // Price: JOIN to Company (no tenantId on Price itself)
  console.log('Creating policy on "Price" (JOIN to Company)...')
  await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "Price";`)
  await db.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON "Price"
      USING (
        EXISTS (
          SELECT 1 FROM "Company" c
          WHERE c.id = "Price"."companyId"
            AND c."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "Company" c
          WHERE c.id = "Price"."companyId"
            AND c."tenantId" = current_setting('app.tenant_id', true)
        )
      );
  `)

  // OrderMasterclass: JOIN to Order
  console.log('Creating policy on "OrderMasterclass" (JOIN to Order)...')
  await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "OrderMasterclass";`)
  await db.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON "OrderMasterclass"
      USING (
        EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o.id = "OrderMasterclass"."orderId"
            AND o."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o.id = "OrderMasterclass"."orderId"
            AND o."tenantId" = current_setting('app.tenant_id', true)
        )
      );
  `)

  // OrderExtra: JOIN to Order
  console.log('Creating policy on "OrderExtra" (JOIN to Order)...')
  await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "OrderExtra";`)
  await db.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON "OrderExtra"
      USING (
        EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o.id = "OrderExtra"."orderId"
            AND o."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o.id = "OrderExtra"."orderId"
            AND o."tenantId" = current_setting('app.tenant_id', true)
        )
      );
  `)

  // WineOrderItem: JOIN to WineOrder
  console.log('Creating policy on "WineOrderItem" (JOIN to WineOrder)...')
  await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "WineOrderItem";`)
  await db.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON "WineOrderItem"
      USING (
        EXISTS (
          SELECT 1 FROM "WineOrder" wo
          WHERE wo.id = "WineOrderItem"."wineOrderId"
            AND wo."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "WineOrder" wo
          WHERE wo.id = "WineOrderItem"."wineOrderId"
            AND wo."tenantId" = current_setting('app.tenant_id', true)
        )
      );
  `)

  // CompanyPerson: JOIN to Company (no tenantId of its own — same shape as Price)
  console.log('Creating policy on "CompanyPerson" (JOIN to Company)...')
  await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "CompanyPerson";`)
  await db.$executeRawUnsafe(`
    CREATE POLICY tenant_isolation ON "CompanyPerson"
      USING (
        EXISTS (
          SELECT 1 FROM "Company" c
          WHERE c.id = "CompanyPerson"."companyId"
            AND c."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM "Company" c
          WHERE c.id = "CompanyPerson"."companyId"
            AND c."tenantId" = current_setting('app.tenant_id', true)
        )
      );
  `)

  // Superseded by CompanyPerson (Plan-ContactRoles Chunk 1 dropped both tables). The DROPs are
  // a no-op once the tables are gone, but keeping them means re-running this script against a
  // database still mid-migration cleans up after itself.
  for (const t of ['CompanyGuide', 'CompanyRepresentative']) {
    try {
      await db.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "${t}";`)
    } catch {
      // table already gone — nothing to drop
    }
  }
  console.log('\nDone. RLS policies created for all ' + writableTables.length + ' tables.')
  console.log('Verify with: npx ts-node --compiler-options \'{"module":"CommonJS"}\' scripts/check-rls.ts')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
