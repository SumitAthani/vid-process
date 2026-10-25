import path from "path";
import { z } from "zod";
import { env } from "../config/env";
import { LAYOUT_MODES, LayoutSegment } from "../types/layout";
import { streamToString } from "../utils/files";
import { getJob, updateJobKeys } from "./job.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "./media-ingestion.service";
import { composeWithLayouts } from "./media.service";
import { BUCKETS, minioClient, uploadLocalFile } from "./minio.service";
import { logger } from "../utils/logger";

export const ResolvedClipSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    hotKey: z.string(),
    searchQuery: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    minDuration: z.number(),
    layout: z.enum(LAYOUT_MODES),
    objectKey: z.string().min(1),
  }),
  z.object({
    status: z.literal("skipped"),
    hotKey: z.string().optional(),
    searchQuery: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    layout: z.enum(LAYOUT_MODES).optional(),
    skipReason: z.string().optional(),
  }),
]);

export const BrollResolvedSchema = z.object({
  version: z.literal(1),
  jobId: z.string(),
  clips: z.array(ResolvedClipSchema),
});

/**
 * Download cropped primary + resolved B-roll clips, composite layouts, upload result.
 * Final subtitle burn happens in packageFinalReel.
 */
export async function composeJobLayouts(jobId: string): Promise<{
  layoutVideoKey: string;
  segmentCount: number;
}> {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  if (!job.croppedVideoKey) {
    throw new Error(`Job ${jobId} has no croppedVideoKey`);
  }

  const workDir = await createJobWorkDir(`${jobId}-layout`);
  const jobLogger = logger.child({ jobId, step: "layout" });

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
      jobLogger.warn("No brollResolvedKey; composing primary only");
    }

    // Chronological order for stable overlay chaining
    segments.sort((a, b) => a.startTime - b.startTime);

    const outputLocal = path.join(workDir, "layout-composited.mp4");
    await composeWithLayouts({
      primaryPath: primaryLocal,
      outputPath: outputLocal,
      width: env.CROP_WIDTH,
      height: env.CROP_HEIGHT,
      segments,
      transitionMs: env.LAYOUT_TRANSITION_MS,
    });

    const layoutVideoKey = `${jobId}/layout-composited.mp4`;
    await uploadLocalFile(
      BUCKETS.INTERMEDIATE_ASSETS,
      layoutVideoKey,
      outputLocal,
      "video/mp4",
    );
    await updateJobKeys(jobId, { layoutVideoKey });

    jobLogger.info(
      { layoutVideoKey, segmentCount: segments.length },
      "Layout composition complete",
    );

    return { layoutVideoKey, segmentCount: segments.length };
  } finally {
    await cleanupWorkDir(workDir);
  }
}
