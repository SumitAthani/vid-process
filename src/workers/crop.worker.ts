import "../config/env";
import path from "path";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { env } from "../config/env";
import {
  updateJobKeys,
  updateJobStatus,
  updateJobStep,
} from "../services/job.service";
import { logger } from "../utils/logger";
import {
  BUCKETS,
  downloadVideo,
  minioClient,
  uploadLocalFile,
} from "../services/minio.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "../services/media-ingestion.service";
import { fitPrimaryToVertical, probeVideo } from "../services/media.service";
import {
  CropStrategy,
  PadBackground,
  CROP_STRATEGIES,
  PAD_BACKGROUNDS,
} from "../types/crop";

function resolveStrategy(
  value: unknown,
  fallback: CropStrategy,
): CropStrategy {
  if (
    typeof value === "string" &&
    (CROP_STRATEGIES as readonly string[]).includes(value)
  ) {
    return value as CropStrategy;
  }
  return fallback;
}

function resolvePadBackground(
  strategy: CropStrategy,
  value: unknown,
): PadBackground | null {
  if (strategy !== "pad") return null;
  if (
    typeof value === "string" &&
    (PAD_BACKGROUNDS as readonly string[]).includes(value)
  ) {
    return value as PadBackground;
  }
  return env.CROP_PAD_BACKGROUND;
}

const worker = new Worker(
  "crop",
  async (job) => {
    const { jobId, objectName } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });
    let workDir: string | null = null;

    try {
      await updateJobStatus(jobId, "processing");
      await updateJobStep(jobId, "crop", "processing");
      await minioClient.statObject(BUCKETS.RAW_VIDEOS, objectName);

      const width = env.CROP_WIDTH;
      const height = env.CROP_HEIGHT;
      const cropStrategy = resolveStrategy(
        job.data.cropStrategy,
        env.CROP_STRATEGY,
      );
      const padBackground = resolvePadBackground(
        cropStrategy,
        job.data.padBackground,
      );

      jobLogger.info(
        { objectName, width, height, cropStrategy, padBackground },
        "Starting primary fit",
      );

      workDir = await createJobWorkDir(`${jobId}-crop`);
      const localVideoPath = await downloadVideo(objectName, workDir);
      const metadata = await probeVideo(localVideoPath);

      jobLogger.info(
        {
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
          durationSeconds: metadata.durationSeconds,
        },
        "Probed source video",
      );

      const localCroppedPath = path.join(workDir, "cropped.mp4");
      await fitPrimaryToVertical(localVideoPath, localCroppedPath, {
        width,
        height,
        strategy: cropStrategy,
        padBackground,
      });

      const croppedObjectKey = `${jobId}/cropped.mp4`;
      await uploadLocalFile(
        BUCKETS.INTERMEDIATE_ASSETS,
        croppedObjectKey,
        localCroppedPath,
        "video/mp4",
      );
      await updateJobKeys(jobId, { croppedVideoKey: croppedObjectKey });
      await updateJobStep(jobId, "crop", "completed");

      jobLogger.info(
        { croppedObjectKey, strategy: cropStrategy, padBackground },
        "Primary fit complete",
      );

      return {
        croppedObjectKey,
        width,
        height,
        strategy: cropStrategy,
        padBackground,
      };
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      await updateJobStep(jobId, "crop", "failed", err);
      throw err;
    } finally {
      if (workDir) await cleanupWorkDir(workDir);
    }
  },
  {
    connection,
    lockDuration: 300000,
    maxStalledCount: 2,
    stalledInterval: 60000,
  },
);

worker.on("completed", (job) => {
  logger
    .child({ jobId: job?.data.jobId, bullmqJobId: job?.id })
    .info("Crop job completed");
});

worker.on("failed", (job, err) => {
  logger
    .child({ jobId: job?.data.jobId, bullmqJobId: job?.id })
    .error(err, "Crop job failed");
});
