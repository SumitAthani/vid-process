-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "crop_error" TEXT,
ADD COLUMN     "crop_status" "StepStatus" NOT NULL DEFAULT 'to_be_queued',
ADD COLUMN     "cropped_video_key" TEXT;
