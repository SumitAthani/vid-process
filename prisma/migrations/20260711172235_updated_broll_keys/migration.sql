/*
  Warnings:

  - The `broll_status` column on the `jobs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "broll_status",
ADD COLUMN     "broll_status" "StepStatus" DEFAULT 'to_be_queued';
