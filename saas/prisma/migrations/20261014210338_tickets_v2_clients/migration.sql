-- AlterEnum
ALTER TYPE "BugReportStatus" ADD VALUE 'CLOSED';

-- AlterEnum
ALTER TYPE "TicketSource" ADD VALUE 'PRODUCTION';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "clientNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "clientReply" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "clientReplyAt" TIMESTAMP(3),
ADD COLUMN     "forwardError" TEXT,
ADD COLUMN     "forwardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketApiToken" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'full';
