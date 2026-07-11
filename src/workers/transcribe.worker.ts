import "../config/env";
import { Worker } from "bullmq";
import { connection } from "../queues/connection";
import { updateJobStatus, updateJobStep } from "../services/job.service";
import { logger } from "../utils/logger";
import { BUCKETS, minioClient } from "../services/minio.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
  ingestMedia,
} from "../services/media-ingestion.service";
import {
  saveTranscriptArtifacts,
  transcribeAudioFile,
} from "../services/transcription.service";
import {
  buildSubtitleCues,
  saveSubtitleArtifacts,
} from "../services/subtitle.service";

const worker = new Worker(
  "transcription",
  async (job) => {
    const { jobId, objectName } = job.data;
    const jobLogger = logger.child({ jobId, bullmqJobId: job.id });
    let workDir: string | null = null;

    try {
      await updateJobStatus(jobId, "processing");
      await updateJobStep(jobId, "transcription", "processing");
      await minioClient.statObject(BUCKETS.RAW_VIDEOS, objectName);
      jobLogger.info({ objectName }, "Starting media ingestion");

      workDir = await createJobWorkDir(jobId);

      const { audioObjectKey, metadataObjectKey, metadata, localAudioPath } =
        await ingestMedia(jobId, objectName, workDir);

      jobLogger.info({ audioObjectKey }, "Transcribing audio");
      const transcript = await transcribeAudioFile(localAudioPath);

      const { transcriptJsonKey, transcriptTextKey } =
        await saveTranscriptArtifacts(jobId, workDir, transcript);

      const subtitleCues = buildSubtitleCues(transcript.segments);
      const { subtitlesSrtKey, subtitlesVttKey } = await saveSubtitleArtifacts(
        jobId,
        workDir,
        subtitleCues,
      );

      await updateJobStep(jobId, "transcription", "completed");

      return {
        audioObjectKey,
        metadataObjectKey,
        transcriptJsonKey,
        transcriptTextKey,
        durationSeconds: metadata.durationSeconds,
        segmentCount: transcript.segments.length,
        textPreview: transcript.text.slice(0, 200),
        subtitlesSrtKey,
        subtitlesVttKey,
      };
    } catch (err) {
      await updateJobStatus(jobId, "failed");
      await updateJobStep(jobId, "transcription", "failed", err);
      throw err;
    } finally {
      if (workDir) await cleanupWorkDir(workDir);
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
