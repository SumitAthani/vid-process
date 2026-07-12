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
      jobLogger.info({ objectName }, "Generating Broll");
      await updateJobStep(jobId, "broll", "processing");

      await getAndSaveBrollVideos(jobId)

      await updateJobStep(jobId, "broll", "completed");
      return { broll: "This is broll text" };
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
