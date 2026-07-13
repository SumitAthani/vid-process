-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "webhook_url" TEXT;
ALTER TABLE "jobs" ADD COLUMN "webhook_sent_at" TIMESTAMP(3);
