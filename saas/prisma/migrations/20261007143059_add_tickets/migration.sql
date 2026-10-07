-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('BUG', 'FEATURE', 'TASK', 'IDEA');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('INBOX', 'BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('WIDGET', 'MANUAL', 'ASSISTANT', 'IMPORT');

-- CreateEnum
CREATE TYPE "TicketCloseReason" AS ENUM ('WONT_FIX', 'DUPLICATE', 'NOT_REPRODUCIBLE', 'OBSOLETE');

-- AlterTable
ALTER TABLE "BugReport" ADD COLUMN     "ticketId" TEXT;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "TicketType" NOT NULL DEFAULT 'BUG',
    "status" "TicketStatus" NOT NULL DEFAULT 'INBOX',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "area" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tenantId" TEXT,
    "source" "TicketSource" NOT NULL,
    "externalRef" TEXT,
    "closeReason" "TicketCloseReason",
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "fromValue" TEXT,
    "toValue" TEXT,
    "actor" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'ticket-attachments',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TicketApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_externalRef_key" ON "Ticket"("externalRef");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");

-- CreateIndex
CREATE INDEX "Ticket_type_idx" ON "Ticket"("type");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketApiToken_tokenHash_key" ON "TicketApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BugReport_ticketId_idx" ON "BugReport"("ticketId");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Lock the new tables away from Supabase's REST API (KnownBugs #73) ─────────────────────
-- These are read/written only by the app server (Prisma, as table owner, which bypasses RLS).
-- RLS on with NO policy = default-deny for every other role; the REVOKE is the second,
-- independent lock. Role-existence guarded so a plain Postgres (shadow database) applies it.
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketApiToken" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Ticket', 'TicketEvent', 'TicketAttachment', 'TicketApiToken'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
