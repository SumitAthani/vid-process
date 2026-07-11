-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "broll_manifest_key" TEXT,
ADD COLUMN     "keyword_extraction_error" TEXT,
ADD COLUMN     "keyword_extraction_status" TEXT;
