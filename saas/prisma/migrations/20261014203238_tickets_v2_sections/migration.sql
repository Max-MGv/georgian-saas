-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "analysis" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "liveOnProductionAt" TIMESTAMP(3),
ADD COLUMN     "liveOnStagingAt" TIMESTAMP(3),
ADD COLUMN     "solution" TEXT NOT NULL DEFAULT '';
