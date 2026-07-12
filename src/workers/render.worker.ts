import "../config/env";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus } from "../services/job.service";
import { composeJobLayouts } from "../services/layout.service";
import { logger } from "../utils/logger";
import { BUCKETS, minioClient } from "../services/minio.service";

const worker = new Worker(
  "render",
  async (job) => {
    const { jobId } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });

    try {
      await updateJobStatus(jobId, "processing");
      jobLogger.info("Composing layouts (subtitles deferred to §3.4)");

      // Parent render waits for crop + broll children via BullMQ flow
      const { layoutVideoKey, segmentCount } = await composeJobLayouts(jobId);

      const videoUrl = await minioClient.presignedGetObject(
        BUCKETS.INTERMEDIATE_ASSETS,
        layoutVideoKey,
        60 * 60,
      );

      await updateJobStatus(jobId, "completed");
      jobLogger.info({ layoutVideoKey, segmentCount }, "Layout render complete");

      return { layoutVideoKey, videoUrl, segmentCount };
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      throw err;
    }
  },
  { connection },
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
