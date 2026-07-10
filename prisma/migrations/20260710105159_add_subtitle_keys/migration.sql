-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "subtitles_srt_key" TEXT,
ADD COLUMN     "subtitles_vtt_key" TEXT,
ADD COLUMN     "transcript_json_key" TEXT,
ADD COLUMN     "transcript_text_key" TEXT,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
