import "../config/env";
import { Job, Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus, updateJobStep } from "../services/job.service";
import { logger } from "../utils/logger";
import { generateManifestFromTranscript } from "../services/keyword.service";

const worker = new Worker(
  "keyword-extraction",
  async (job) => {
    const { jobId, objectName } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });

    try {
      await updateJobStep(jobId, "keywords", "processing");

      jobLogger.info({ objectName }, "keyword extracting");

      await generateManifestFromTranscript(jobId);

      await updateJobStep(jobId, "keywords", "completed");
      return { keywords: "These are the keywords extracted" };
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      await updateJobStep(jobId, "keywords", "failed", err);
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
