-- Normalize any existing face strategy rows before dropping the enum value
UPDATE "jobs" SET "crop_strategy" = 'center' WHERE "crop_strategy" = 'face';

-- Recreate CropStrategy enum without face (Postgres cannot DROP VALUE on older versions safely)
ALTER TYPE "CropStrategy" RENAME TO "CropStrategy_old";
CREATE TYPE "CropStrategy" AS ENUM ('center', 'pad');
ALTER TABLE "jobs" ALTER COLUMN "crop_strategy" DROP DEFAULT;
ALTER TABLE "jobs"
  ALTER COLUMN "crop_strategy" TYPE "CropStrategy"
  USING ("crop_strategy"::text::"CropStrategy");
ALTER TABLE "jobs" ALTER COLUMN "crop_strategy" SET DEFAULT 'center';
DROP TYPE "CropStrategy_old";
