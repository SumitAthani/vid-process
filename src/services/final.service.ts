import path from "path";
import { getJob, updateJobKeys } from "./job.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "./media-ingestion.service";
import { burnSubtitles } from "./media.service";
import { BUCKETS, minioClient, uploadLocalFile } from "./minio.service";
import { logger } from "../utils/logger";
import { env } from "../config/env";

/**
 * Download layout-composited video + SRT, burn captions, upload final reel.
 */
export async function packageFinalReel(jobId: string): Promise<{
  finalVideoKey: string;
}> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  if (!job.layoutVideoKey) {
    throw new Error(`Job ${jobId} has no layoutVideoKey`);
  }
  if (!job.subtitlesSrtKey) {
    throw new Error(`Job ${jobId} has no subtitlesSrtKey`);
  }

  const workDir = await createJobWorkDir(`${jobId}-final`);
  const jobLogger = logger.child({ jobId, step: "final" });

  try {
    const layoutLocal = path.join(workDir, "layout.mp4");
    const srtLocal = path.join(workDir, "subtitles.srt");
    const outputLocal = path.join(workDir, "reel.mp4");

    await minioClient.fGetObject(
      BUCKETS.INTERMEDIATE_ASSETS,
      job.layoutVideoKey,
      layoutLocal,
    );
    await minioClient.fGetObject(
      BUCKETS.INTERMEDIATE_ASSETS,
      job.subtitlesSrtKey,
      srtLocal,
    );

    const fontName =
      job.subtitleFontName === "Arial" && env.SUBTITLE_FONT_NAME !== "Arial"
        ? env.SUBTITLE_FONT_NAME
        : job.subtitleFontName;

    await burnSubtitles(layoutLocal, srtLocal, outputLocal, {
      fontName,
      fontSize: job.subtitleFontSize,
      marginV: job.subtitleMarginV,
      marginL: job.subtitleMarginL,
      marginR: job.subtitleMarginR,
    });

    const finalVideoKey = `${jobId}/reel.mp4`;
    await uploadLocalFile(
      BUCKETS.FINAL_VIDEOS,
      finalVideoKey,
      outputLocal,
      "video/mp4",
    );
    await updateJobKeys(jobId, { finalVideoKey });

    jobLogger.info({ finalVideoKey }, "Final reel packaged with burned subtitles");

    return { finalVideoKey };
  } finally {
    await cleanupWorkDir(workDir);
  }
}
