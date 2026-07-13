-- CreateEnum
CREATE TYPE "CropStrategy" AS ENUM ('center', 'face', 'pad');

-- CreateEnum
CREATE TYPE "PadBackground" AS ENUM ('black', 'white', 'blur');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "crop_strategy" "CropStrategy" NOT NULL DEFAULT 'center',
ADD COLUMN     "pad_background" "PadBackground";
