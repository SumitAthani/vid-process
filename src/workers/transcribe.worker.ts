import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { logger } from "../logger";

const worker = new Worker(
  "transcription",
  async (job) => {
    const jobLogger = logger.child({ jobId: job.id });

    jobLogger.info({ videoUrl: job.data.videoUrl }, "Transcribing");

    // fake processing
    await new Promise((r) => setTimeout(r, 3000));

    return {
      transcript: "This is transcript text",
    };
  },
  { connection }
);

worker.on("completed", (job) => {
  logger.child({ jobId: job.id }).info("Job completed");
});

worker.on("failed", (job, err) => {
  logger.child({ jobId: job?.id }).error(err, "Job failed");
});
