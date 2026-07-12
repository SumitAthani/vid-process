/*
  Warnings:

  - The `keyword_extraction_status` column on the `jobs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "keyword_extraction_status",
ADD COLUMN     "keyword_extraction_status" "StepStatus" NOT NULL DEFAULT 'to_be_queued';
