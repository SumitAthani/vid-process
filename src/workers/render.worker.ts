import "../config/env";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus } from "../services/job.service";
import { composeAndPackageFinalReel } from "../services/final.service";
import { logger } from "../utils/logger";
import { BUCKETS, publicMinioClient } from "../services/minio.service";

const worker = new Worker(
  "render",
  async (job) => {
    const { jobId } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });

    try {
      await updateJobStatus(jobId, "processing");
      jobLogger.info("Composing layouts and packaging final reel in single pass");

      // Parent render waits for crop + broll children via BullMQ flow
      const { finalVideoKey, segmentCount } =
        await composeAndPackageFinalReel(jobId);

      const videoUrl = await publicMinioClient.presignedGetObject(
        BUCKETS.FINAL_VIDEOS,
        finalVideoKey,
        60 * 60,
      );

      await updateJobStatus(jobId, "completed");
      jobLogger.info(
        { finalVideoKey, segmentCount },
        "Single-pass final render complete",
      );

      return { layoutVideoKey: null, finalVideoKey, videoUrl, segmentCount };
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      throw err;
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
    .info("Job completed");
});

worker.on("failed", (job, err) => {
  logger
    .child({ jobId: job?.data.jobId, bullmqJobId: job?.id })
    .error(err, "Job failed");
});
