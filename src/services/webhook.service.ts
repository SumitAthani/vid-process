import { env } from "../config/env";
import { prisma } from "../db/client";
import { logger } from "../utils/logger";
import { BUCKETS, publicMinioClient } from "./minio.service";

const PRESIGN_TTL_SEC = 60 * 60;

function pickFailureError(job: {
  transcriptionError: string | null;
  keywordExtractionError: string | null;
  brollError: string | null;
  cropError: string | null;
}): string | null {
  return (
    job.transcriptionError ??
    job.keywordExtractionError ??
    job.brollError ??
    job.cropError ??
    null
  );
}

/**
 * Best-effort outbound webhook on job terminal state.
 * Idempotent via webhookSentAt; never throws to callers.
 */
export async function deliverJobWebhook(jobId: string): Promise<void> {
  const jobLogger = logger.child({ jobId, step: "webhook" });

  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      jobLogger.warn("Job not found; skipping webhook");
      return;
    }

    if (job.status !== "completed" && job.status !== "failed") {
      return;
    }

    if (job.webhookSentAt) {
      return;
    }

    const url = job.webhookUrl || env.JOB_WEBHOOK_URL || null;
    if (!url) {
      return;
    }

    let finalVideoUrl: string | null = null;
    if (job.status === "completed" && job.finalVideoKey) {
      finalVideoUrl = await publicMinioClient.presignedGetObject(
        BUCKETS.FINAL_VIDEOS,
        job.finalVideoKey,
        PRESIGN_TTL_SEC,
      );
    }

    const payload = {
      event: job.status === "completed" ? "job.completed" : "job.failed",
      jobId: job.id,
      status: job.status,
      objectName: job.objectName,
      currentStep: job.currentStep,
      finalVideoKey: job.finalVideoKey,
      finalVideoUrl,
      layoutVideoKey: job.layoutVideoKey,
      croppedVideoKey: job.croppedVideoKey,
      brollResolvedKey: job.brollResolvedKey,
      error: job.status === "failed" ? pickFailureError(job) : null,
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.JOB_WEBHOOK_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        jobLogger.warn(
          { status: response.status, url },
          "Webhook endpoint returned non-OK status",
        );
        return;
      }
    } finally {
      clearTimeout(timeout);
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { webhookSentAt: new Date() },
    });

    jobLogger.info({ url, event: payload.event }, "Webhook delivered");
  } catch (err) {
    jobLogger.error({ err }, "Webhook delivery failed");
  }
}
