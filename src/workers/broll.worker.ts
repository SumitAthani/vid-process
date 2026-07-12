import "../config/env";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus, updateJobStep } from "../services/job.service";
import { logger } from "../utils/logger";
import { getAndSaveBrollVideos } from "../services/broll.service";

const worker = new Worker(
  "broll",
  async (job) => {
    const { jobId, objectName } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });

    try {
      const children = await job.getChildrenValues();
      const keywordResult = Object.values(children)[0] as
        | { brollManifestKey: string }
        | undefined;

      if (!keywordResult?.brollManifestKey) {
        throw new Error("Missing brollManifestKey from keyword child");
      }

      jobLogger.info({ objectName }, "Generating Broll");
      await updateJobStep(jobId, "broll", "processing");

      const result = await getAndSaveBrollVideos(
        jobId,
        keywordResult.brollManifestKey,
      );

      jobLogger.info(
        {
          brollResolvedKey: result.brollResolvedKey,
          resolvedCount: result.resolvedCount,
          skippedCount: result.skippedCount,
        },
        "B-roll segments finished",
      );

      if (result.resolvedCount === 0) {
        throw new Error(
          `No B-roll clips resolved (${result.skippedCount} skipped)`,
        );
      }

      await updateJobStep(jobId, "broll", "completed");
      return result;
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      await updateJobStep(jobId, "broll", "failed", err);
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
