-- Contact Roles (vault/Plan-ContactRoles.md, Chunk 1)
--
-- Replaces three contact concepts with one role-driven model:
--   Company.contactName/contactPhone/contactEmail  ─┐
--   CompanyGuide                                    ├─→ ContactRole + CompanyPerson
--   CompanyRepresentative                          ─┘
--   Order.guideId                                   ──→ OrderContact (with snapshots)
--
-- HAND-WRITTEN, not generated. `prisma migrate dev` refuses to run non-interactively when a
-- migration drops non-empty columns/tables, and the generated version would only have dropped —
-- it cannot know that the guide/rep/contact rows are configuration worth carrying across.
-- Steps 5–8 are that data copy, and they must run BEFORE step 9 drops the sources.
--
-- Verified against the dev DB before writing (2026-09-22): 3 tenants, 22 companies, none with a
-- null tenantId, 18 companies carrying contact details, 3 guides, 6 representatives, no
-- duplicate codes across any of the three code sources, and **0 orders with a guideId** — which
-- independently confirms the review's finding that Order.guideId was written but never read.
--
-- ⚠️ Deliberately does NOT touch Company rows themselves or Price. Price tiers are tenant setup,
-- not disposable data — see vault/DataModel/Dependencies.md finding 1.

-- ─── 1. Enums ───────────────────────────────────────────────────────────────

CREATE TYPE "ContactScope" AS ENUM ('PER_ORDER', 'COMPANY_LEVEL');
CREATE TYPE "ContactApplies" AS ENUM ('BOOKING', 'WINE_ORDER', 'BOTH');

-- ─── 2. ContactRole ─────────────────────────────────────────────────────────
-- Has its own tenantId (a role belongs to the winery, not to one company), so its RLS policy
-- is a direct tenantId check rather than the JOIN-to-Company shape CompanyPerson uses.

CREATE TABLE "ContactRole" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "labelEn"   TEXT NOT NULL,
    "labelKa"   TEXT NOT NULL,
    "scope"     "ContactScope" NOT NULL,
    "appliesTo" "ContactApplies" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContactRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactRole_tenantId_key_key" ON "ContactRole"("tenantId", "key");
CREATE INDEX "ContactRole_tenantId_idx" ON "ContactRole"("tenantId");

-- ─── 3. CompanyPerson ───────────────────────────────────────────────────────
-- No own tenantId — JOIN-to-Company RLS, the same shape as Price.

CREATE TABLE "CompanyPerson" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "phone"     TEXT,
    "email"     TEXT,
    "code"      TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyPerson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyPerson_companyId_roleId_idx" ON "CompanyPerson"("companyId", "roleId");

ALTER TABLE "CompanyPerson"
    ADD CONSTRAINT "CompanyPerson_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a role must never silently delete the people in it. The admin
-- UI deactivates roles instead of deleting them, so this should never fire — it is here so that
-- if it ever does, it fails loudly rather than removing data.
ALTER TABLE "CompanyPerson"
    ADD CONSTRAINT "CompanyPerson_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "ContactRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 4. OrderContact ────────────────────────────────────────────────────────
-- Polymorphic over Order/WineOrder, the same shape OrderEvent and Payment already use.
--
-- The snapshots are the whole point. Order.guideId (which this replaces) was an optional
-- relation with no onDelete, so Prisma defaulted it to SET NULL: deleting a guide silently
-- erased which guide was on every past order (KnownBugs #56). Here personId may go null and
-- nothing is lost, because the facts live on this row — the same rule as
-- WineOrderItem.priceSnapshot and Order's rate snapshots.

CREATE TABLE "OrderContact" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT,
    "orderId"       TEXT,
    "wineOrderId"   TEXT,
    "roleId"        TEXT NOT NULL,
    "personId"      TEXT,
    "nameSnapshot"  TEXT NOT NULL,
    "phoneSnapshot" TEXT,
    "emailSnapshot" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderContact_pkey" PRIMARY KEY ("id")
);

-- One person per role per order. Postgres treats NULLs as distinct, so wine-order rows
-- (orderId null) never collide with each other under the first index, nor booking rows
-- (wineOrderId null) under the second.
CREATE UNIQUE INDEX "OrderContact_orderId_roleId_key"     ON "OrderContact"("orderId", "roleId");
CREATE UNIQUE INDEX "OrderContact_wineOrderId_roleId_key" ON "OrderContact"("wineOrderId", "roleId");
CREATE INDEX "OrderContact_tenantId_orderId_idx"     ON "OrderContact"("tenantId", "orderId");
CREATE INDEX "OrderContact_tenantId_wineOrderId_idx" ON "OrderContact"("tenantId", "wineOrderId");

ALTER TABLE "OrderContact"
    ADD CONSTRAINT "OrderContact_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderContact"
    ADD CONSTRAINT "OrderContact_wineOrderId_fkey"
    FOREIGN KEY ("wineOrderId") REFERENCES "WineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderContact"
    ADD CONSTRAINT "OrderContact_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "ContactRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL is correct here, unlike Order.guideId — the snapshots above mean the link can go
-- without the facts going with it.
ALTER TABLE "OrderContact"
    ADD CONSTRAINT "OrderContact_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "CompanyPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. Seed the two system roles, per tenant ───────────────────────────────
-- Labels are the project's own existing Georgian, lifted from lib/adminT.ts rather than
-- invented: `გიდი` already renders as "guide" and `საკონტაქტო პირი` as "contact person".
-- contact_person sorts first — it appears on both forms and it is the role that mirrors into
-- Order.name/surname/phone/email (Plan-ContactRoles decision 4).

INSERT INTO "ContactRole" ("id", "tenantId", "key", "labelEn", "labelKa", "scope", "appliesTo", "sortOrder", "isActive", "isSystem")
SELECT gen_random_uuid()::text, t."id", 'contact_person', 'Contact Person', 'საკონტაქტო პირი', 'PER_ORDER', 'BOTH', 10, true, true
FROM "Tenant" t;

-- guide is BOOKING-only: a wine order has no visit for a guide to attend.
INSERT INTO "ContactRole" ("id", "tenantId", "key", "labelEn", "labelKa", "scope", "appliesTo", "sortOrder", "isActive", "isSystem")
SELECT gen_random_uuid()::text, t."id", 'guide', 'Guide', 'გიდი', 'PER_ORDER', 'BOOKING', 20, true, true
FROM "Tenant" t;

-- ─── 6. Carry across each company's scalar contact ──────────────────────────
-- These are configuration someone typed, not order data — decision 7's "no backfill" covered
-- orders only. A company whose contact is also one of its representatives ends up with two
-- contact_person rows; that is visible and fixable in the admin panel, whereas a dropped phone
-- number is neither.

INSERT INTO "CompanyPerson" ("id", "companyId", "roleId", "name", "phone", "email", "code", "isActive", "createdAt")
SELECT
    gen_random_uuid()::text,
    c."id",
    r."id",
    COALESCE(NULLIF(btrim(c."contactName"), ''), c."name"),
    c."contactPhone",
    c."contactEmail",
    NULL,
    true,
    c."createdAt"
FROM "Company" c
JOIN "ContactRole" r ON r."tenantId" = c."tenantId" AND r."key" = 'contact_person'
WHERE c."contactName" IS NOT NULL OR c."contactPhone" IS NOT NULL OR c."contactEmail" IS NOT NULL;

-- ─── 7. Carry across existing guides ────────────────────────────────────────
-- Codes are preserved verbatim: they are in circulation with real tour operators, and
-- regenerating them here would be exactly the silent-credential-breakage this whole plan exists
-- to stop (KnownBugs #55).

INSERT INTO "CompanyPerson" ("id", "companyId", "roleId", "name", "phone", "email", "code", "isActive", "createdAt")
SELECT g."id", g."companyId", r."id", g."name", g."phone", NULL, g."code", true, g."createdAt"
FROM "CompanyGuide" g
JOIN "Company" c     ON c."id" = g."companyId"
JOIN "ContactRole" r ON r."tenantId" = c."tenantId" AND r."key" = 'guide';

-- ─── 8. Carry across existing representatives, as contact people ────────────
-- "Representative" and "Contact Person" were always the same person — Max, 2026-09-19:
-- "first name last name, phone email - that is for contact persons (back office representative)".

INSERT INTO "CompanyPerson" ("id", "companyId", "roleId", "name", "phone", "email", "code", "isActive", "createdAt")
SELECT p."id", p."companyId", r."id", p."name", p."phone", p."email", p."code", true, p."createdAt"
FROM "CompanyRepresentative" p
JOIN "Company" c     ON c."id" = p."companyId"
JOIN "ContactRole" r ON r."tenantId" = c."tenantId" AND r."key" = 'contact_person';

-- ─── 9. Drop the superseded columns and tables ──────────────────────────────
-- Order.guideId held 0 rows at migration time, so nothing is lost. Dropping the column drops
-- its foreign key with it.

ALTER TABLE "Order" DROP COLUMN "guideId";

DROP TABLE "CompanyGuide";
DROP TABLE "CompanyRepresentative";

ALTER TABLE "Company"
    DROP COLUMN "contactName",
    DROP COLUMN "contactPhone",
    DROP COLUMN "contactEmail";

-- ─── 10. The code pool finally gets a DB-level guarantee ────────────────────
-- Until now uniqueness across Company.accessCode + guide codes + rep codes was enforced only in
-- application code (generateUniqueTenantCode), so a direct create() or raw insert could silently
-- collide — MaintenanceNotes #26 records that, and records the five days two resolvers disagreed
-- without anyone noticing.
--
-- These are GLOBAL unique indexes, not per-tenant ones, because CompanyPerson has no tenantId
-- column to scope by (it is JOIN-to-Company by design, like Price). Global is stricter than
-- required and costs nothing: codes are 8 characters from a 32-character alphabet, so
-- cross-tenant collisions are vanishingly rare, and generateUniqueTenantCode already retries on
-- collision. Verified before adding: no duplicates exist in any of the three sources today.
--
-- Plain unique indexes rather than partial (`WHERE code IS NOT NULL`) ones, even though both
-- columns are nullable: Postgres already treats NULLs as distinct in a unique index, so the
-- behaviour is identical — and Prisma cannot express a partial index, so a partial one here
-- would leave schema.prisma and the database permanently out of sync and make every later
-- `migrate dev` try to "fix" it.

CREATE UNIQUE INDEX "CompanyPerson_code_key" ON "CompanyPerson"("code");
CREATE UNIQUE INDEX "Company_accessCode_key" ON "Company"("accessCode");
