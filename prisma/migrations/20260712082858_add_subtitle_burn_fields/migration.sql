-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "final_video_key" TEXT,
ADD COLUMN     "subtitle_font_name" TEXT NOT NULL DEFAULT 'Arial',
ADD COLUMN     "subtitle_font_size" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "subtitle_margin_l" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "subtitle_margin_r" INTEGER NOT NULL DEFAULT 140,
ADD COLUMN     "subtitle_margin_v" INTEGER NOT NULL DEFAULT 360;
