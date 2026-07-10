-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('to_be_queued', 'queued', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "current_step" TEXT,
ADD COLUMN     "transcription_error" TEXT,
ADD COLUMN     "transcription_status" "StepStatus" NOT NULL DEFAULT 'to_be_queued';
