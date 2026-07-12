import { prisma } from "../db/client";
import { createVideoFlow } from "../flows/video.flow";
import { JobStatus, StepStatus } from "../generated/prisma/enums";
import { BUCKETS, minioClient } from "./minio.service";

export class EnqueueError extends Error {
  constructor(
    public jobId: string,
    cause?: unknown,
  ) {
    super("Failed to enqueue job");
    this.cause = cause;
  }
}

export async function createJob(objectName: string) {
  const job = await prisma.job.create({
    data: {
      objectName,
    },
  });

  return job;
}

export async function getJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
  });
}

const PRESIGN_TTL_SEC = 60 * 60; // 1 hour

async function presignIntermediateAsset(
  objectKey: string | null,
): Promise<string | null> {
  if (!objectKey) return null;

  return minioClient.presignedGetObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    objectKey,
    PRESIGN_TTL_SEC,
  );
}

export async function getJobDetails(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return null;

  const [
    transcriptJsonUrl,
    transcriptTextUrl,
    subtitlesSrtUrl,
    subtitlesVttUrl,
    audioUrl,
    metadataUrl,
  ] = await Promise.all([
    presignIntermediateAsset(job.transcriptJsonKey),
    presignIntermediateAsset(job.transcriptTextKey),
    presignIntermediateAsset(job.subtitlesSrtKey),
    presignIntermediateAsset(job.subtitlesVttKey),
    presignIntermediateAsset(`${jobId}/audio.wav`),
    presignIntermediateAsset(`${jobId}/metadata.json`),
  ]);

  return {
    ...job,
    artifacts: {
      transcriptJson: transcriptJsonUrl,
      transcriptText: transcriptTextUrl,
      subtitlesSrt: subtitlesSrtUrl,
      subtitlesVtt: subtitlesVttUrl,
      audio: audioUrl,
      metadata: metadataUrl,
    },
  };
}

type UpdateJobData = Partial<{
  status: JobStatus;
  transcriptJsonKey: string;
  transcriptTextKey: string;
  subtitlesSrtKey: string;
  subtitlesVttKey: string;
  brollManifestKey: string;
  brollResolvedKey: string;
}>;

export async function updateJobKeys(id: string, data: UpdateJobData) {
  return await prisma.job.update({
    where: {
      id,
    },
    data: {
      ...data,
    },
  });
}

export async function updateJobStatus(id: string, status: JobStatus) {
  return await prisma.job.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });
}

export async function createAndEnqueueJob(objectName: string) {
  const job = await createJob(objectName);

  try {
    await createVideoFlow(objectName, job.id);
    return job;
  } catch (err) {
    await updateJobStatus(job.id, "failed");
    throw new EnqueueError(job.id, err);
  }
}

const JOB_STEP_CONFIG = {
  transcription: {
    statusField: "transcriptionStatus",
    errorField: "transcriptionError",
  },
  keywords: {
    statusField: "keywordExtractionStatus",
    errorField: "keywordExtractionError",
  },
  broll: {
    statusField: "brollStatus",
    errorField: "brollError",
  },
} as const;

export type JobStep = keyof typeof JOB_STEP_CONFIG;

function formatJobError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function updateJobStep(
  jobId: string,
  step: JobStep,
  status: StepStatus,
  error?: unknown,
) {
  const { statusField, errorField } = JOB_STEP_CONFIG[step];

  const data: {
    status?: JobStatus;
    currentStep?: string | null;
    transcriptionStatus?: StepStatus;
    transcriptionError?: string | null;

    keywordExtractionStatus?: StepStatus;
    keywordExtractionError?: string | null;

    brollStatus?: StepStatus;
    brollError?: string | null;
  } = {
    [statusField]: status,
  };

  if (status === "processing" || status === "failed") {
    data.currentStep = step;
    data.status = status === "failed" ? "failed" : "processing";
  }

  if (status === "completed") {
    data[errorField] = null;
  }

  if (status === "failed" && error !== undefined) {
    data[errorField] = formatJobError(error);
    data.status = "failed";
  }

  return prisma.job.update({ where: { id: jobId }, data });
}
