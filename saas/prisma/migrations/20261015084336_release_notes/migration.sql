-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReleaseImageKind" AS ENUM ('BEFORE', 'AFTER', 'IMAGE');

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "releasedOn" DATE NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "summaryKa" TEXT NOT NULL DEFAULT '',
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseEntry" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "titleKa" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "bodyKa" TEXT NOT NULL DEFAULT '',
    "howTo" TEXT NOT NULL DEFAULT '',
    "howToKa" TEXT NOT NULL DEFAULT '',
    "linkPath" TEXT,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "ticketRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseImage" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "kind" "ReleaseImageKind" NOT NULL DEFAULT 'IMAGE',
    "pair" INTEGER NOT NULL DEFAULT 0,
    "viewport" TEXT NOT NULL DEFAULT 'desktop',
    "caption" TEXT NOT NULL DEFAULT '',
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseView" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseView_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Release_status_releasedOn_idx" ON "Release"("status", "releasedOn");

-- CreateIndex
CREATE INDEX "ReleaseEntry_releaseId_position_idx" ON "ReleaseEntry"("releaseId", "position");

-- CreateIndex
CREATE INDEX "ReleaseImage_entryId_idx" ON "ReleaseImage"("entryId");

-- AddForeignKey
ALTER TABLE "ReleaseEntry" ADD CONSTRAINT "ReleaseEntry_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseImage" ADD CONSTRAINT "ReleaseImage_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ReleaseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Lock the new tables away from Supabase's REST API (KnownBugs #73, same as add_tickets) ──
-- Read/written only by the app server (Prisma, as table owner). RLS on with NO policy = default-deny
-- for every other role; the REVOKE is the second, independent lock. Role-guarded for the shadow DB.
ALTER TABLE "Release" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReleaseView" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Release', 'ReleaseEntry', 'ReleaseImage', 'ReleaseView'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
