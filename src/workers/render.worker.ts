import "../config/env";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus } from "../services/job.service";
import { logger } from "../utils/logger";

const worker = new Worker(
  "render",
  async (job) => {
    const { jobId, objectName } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });

    try {
      jobLogger.info({ objectName }, "Rendering");

      await new Promise((r) => setTimeout(r, 3000));
      await updateJobStatus(jobId, "completed");
      return { videoUrl: "This is rendered video url" };
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
