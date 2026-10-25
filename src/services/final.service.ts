import path from "path";
import { getJob, updateJobKeys } from "./job.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "./media-ingestion.service";
import { burnSubtitles, composeWithLayouts } from "./media.service";
import { BUCKETS, minioClient, uploadLocalFile } from "./minio.service";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { streamToString } from "../utils/files";
import { LayoutSegment } from "../types/layout";
import { BrollResolvedSchema } from "./layout.service";

/**
 * Single-pass render: Downloads cropped primary, resolved B-roll, and subtitles SRT,
 * performs layout overlay + subtitle burning in ONE FFmpeg pass, and uploads the final reel.
 *
 * Saves ~30-40s by avoiding secondary decode and re-encode passes.
 */
export async function composeAndPackageFinalReel(jobId: string): Promise<{
  finalVideoKey: string;
  segmentCount: number;
}> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  if (!job.croppedVideoKey) {
    throw new Error(`Job ${jobId} has no croppedVideoKey`);
  }

  const workDir = await createJobWorkDir(`${jobId}-render`);
  const jobLogger = logger.child({ jobId, step: "single-pass-render" });

  try {
    const primaryLocal = path.join(workDir, "primary.mp4");
    await minioClient.fGetObject(
      BUCKETS.INTERMEDIATE_ASSETS,
      job.croppedVideoKey,
      primaryLocal,
    );

    const segments: LayoutSegment[] = [];

    if (job.brollResolvedKey) {
      const raw = JSON.parse(
        await streamToString(
          await minioClient.getObject(
            BUCKETS.INTERMEDIATE_ASSETS,
            job.brollResolvedKey,
          ),
        ),
      );
      const resolved = BrollResolvedSchema.parse(raw);

      let clipIdx = 0;
      for (const clip of resolved.clips) {
        if (clip.status !== "resolved") continue;

        const clipLocal = path.join(workDir, `broll-${clipIdx}.mp4`);
        await minioClient.fGetObject(
          BUCKETS.INTERMEDIATE_ASSETS,
          clip.objectKey,
          clipLocal,
        );

        segments.push({
          clipPath: clipLocal,
          startTime: clip.startTime,
          endTime: clip.endTime,
          layout: clip.layout,
        });
        clipIdx += 1;
      }
    } else {
      jobLogger.warn("No brollResolvedKey; rendering primary + subtitles only");
    }

    segments.sort((a, b) => a.startTime - b.startTime);

    let srtLocal: string | undefined;
    if (job.subtitlesSrtKey) {
      srtLocal = path.join(workDir, "subtitles.srt");
      await minioClient.fGetObject(
        BUCKETS.INTERMEDIATE_ASSETS,
        job.subtitlesSrtKey,
        srtLocal,
      );
    }

    const fontName =
      job.subtitleFontName === "Arial" && env.SUBTITLE_FONT_NAME !== "Arial"
        ? env.SUBTITLE_FONT_NAME
        : job.subtitleFontName;

    const outputLocal = path.join(workDir, "reel.mp4");
    await composeWithLayouts({
      primaryPath: primaryLocal,
      outputPath: outputLocal,
      width: env.CROP_WIDTH,
      height: env.CROP_HEIGHT,
      segments,
      transitionMs: env.LAYOUT_TRANSITION_MS,
      subtitles: srtLocal
        ? {
            srtPath: srtLocal,
            fontName,
            fontSize: job.subtitleFontSize,
            marginV: job.subtitleMarginV,
            marginL: job.subtitleMarginL,
            marginR: job.subtitleMarginR,
          }
        : undefined,
    });

    const finalVideoKey = `${jobId}/reel.mp4`;
    await uploadLocalFile(
      BUCKETS.FINAL_VIDEOS,
      finalVideoKey,
      outputLocal,
      "video/mp4",
    );
    await updateJobKeys(jobId, { finalVideoKey });

    jobLogger.info(
      { finalVideoKey, segmentCount: segments.length },
      "Final reel rendered and packaged in single pass",
    );

    return { finalVideoKey, segmentCount: segments.length };
  } finally {
    await cleanupWorkDir(workDir);
  }
}

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
