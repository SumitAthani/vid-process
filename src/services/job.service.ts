import { prisma } from "../db/client";
import { createVideoFlow } from "../flows/video.flow";
import { JobStatus, StepStatus } from "../generated/prisma/enums";
import { env } from "../config/env";
import {
  CropJobOptions,
  CropStrategy,
  PadBackground,
} from "../types/crop";
import {
  SubtitleStyle,
  SubtitleStyleInput,
} from "../types/subtitle";
import { LayoutMode } from "../types/layout";
import { BUCKETS, minioClient } from "./minio.service";
import { deliverJobWebhook } from "./webhook.service";

export class EnqueueError extends Error {
  constructor(
    public jobId: string,
    cause?: unknown,
  ) {
    super("Failed to enqueue job");
    this.cause = cause;
  }
}

export function resolveCropOptions(input: {
  cropStrategy?: CropStrategy;
  padBackground?: PadBackground;
}): CropJobOptions {
  const cropStrategy = input.cropStrategy ?? env.CROP_STRATEGY;
  const padBackground =
    cropStrategy === "pad"
      ? (input.padBackground ?? env.CROP_PAD_BACKGROUND)
      : null;

  return { cropStrategy, padBackground };
}

export function resolveSubtitleStyle(
  input: SubtitleStyleInput = {},
): SubtitleStyle {
  return {
    fontSize: input.subtitleFontSize ?? env.SUBTITLE_FONT_SIZE,
    marginV: input.subtitleMarginV ?? env.SUBTITLE_MARGIN_V,
    marginL: input.subtitleMarginL ?? env.SUBTITLE_MARGIN_L,
    marginR: input.subtitleMarginR ?? env.SUBTITLE_MARGIN_R,
    fontName: input.subtitleFontName ?? env.SUBTITLE_FONT_NAME,
  };
}

export async function createJob(
  objectName: string,
  cropOptions: CropJobOptions,
  subtitleStyle: SubtitleStyle,
  webhookUrl?: string | null,
  brollLayout?: LayoutMode | null,
) {
  const job = await prisma.job.create({
    data: {
      objectName,
      cropStrategy: cropOptions.cropStrategy,
      padBackground: cropOptions.padBackground,
      subtitleFontSize: subtitleStyle.fontSize,
      subtitleMarginV: subtitleStyle.marginV,
      subtitleMarginL: subtitleStyle.marginL,
      subtitleMarginR: subtitleStyle.marginR,
      subtitleFontName: subtitleStyle.fontName,
      webhookUrl: webhookUrl ?? null,
      brollLayout: brollLayout ?? null,
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

async function presignFinalAsset(
  objectKey: string | null,
): Promise<string | null> {
  if (!objectKey) return null;

  return minioClient.presignedGetObject(
    BUCKETS.FINAL_VIDEOS,
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
    croppedUrl,
    layoutUrl,
    finalUrl,
  ] = await Promise.all([
    presignIntermediateAsset(job.transcriptJsonKey),
    presignIntermediateAsset(job.transcriptTextKey),
    presignIntermediateAsset(job.subtitlesSrtKey),
    presignIntermediateAsset(job.subtitlesVttKey),
    presignIntermediateAsset(`${jobId}/audio.wav`),
    presignIntermediateAsset(`${jobId}/metadata.json`),
    presignIntermediateAsset(job.croppedVideoKey),
    presignIntermediateAsset(job.layoutVideoKey),
    presignFinalAsset(job.finalVideoKey),
  ]);

  return {
    ...job,
    finalVideoUrl:
      job.status === "completed" && finalUrl ? finalUrl : null,
    artifacts: {
      transcriptJson: transcriptJsonUrl,
      transcriptText: transcriptTextUrl,
      subtitlesSrt: subtitlesSrtUrl,
      subtitlesVtt: subtitlesVttUrl,
      audio: audioUrl,
      metadata: metadataUrl,
      cropped: croppedUrl,
      layout: layoutUrl,
      final: finalUrl,
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
  croppedVideoKey: string;
  layoutVideoKey: string;
  finalVideoKey: string;
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
  const job = await prisma.job.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });

  if (status === "completed" || status === "failed") {
    await deliverJobWebhook(id);
  }

  return job;
}

export async function createAndEnqueueJob(
  objectName: string,
  options: {
    cropStrategy?: CropStrategy;
    padBackground?: PadBackground;
    webhookUrl?: string;
    layout?: LayoutMode;
  } & SubtitleStyleInput = {},
) {
  const {
    cropStrategy,
    padBackground,
    subtitleFontSize,
    subtitleMarginV,
    subtitleMarginL,
    subtitleMarginR,
    subtitleFontName,
    webhookUrl,
    layout,
  } = options;

  const cropOptions = resolveCropOptions({ cropStrategy, padBackground });
  const subtitleStyle = resolveSubtitleStyle({
    subtitleFontSize,
    subtitleMarginV,
    subtitleMarginL,
    subtitleMarginR,
    subtitleFontName,
  });
  const job = await createJob(
    objectName,
    cropOptions,
    subtitleStyle,
    webhookUrl,
    layout,
  );

  try {
    await createVideoFlow(objectName, job.id, cropOptions);
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
  crop: {
    statusField: "cropStatus",
    errorField: "cropError",
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

    cropStatus?: StepStatus;
    cropError?: string | null;
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

  const job = await prisma.job.update({ where: { id: jobId }, data });

  if (data.status === "failed") {
    await deliverJobWebhook(jobId);
  }

  return job;
}
