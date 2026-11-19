import path from "path";
import { env } from "../config/env";
import { mapWithConcurrency } from "../utils/concurrency";
import { logger } from "../utils/logger";
import {
  brollCacheObjectKey,
  getCachedClipObjectKey,
  getCachedSearch,
  setCachedClipObjectKey,
  setCachedSearch,
} from "../utils/pexelsCache";
import { fitDownloadedClipToWindow } from "./broll-fit.service";
import { BUCKETS, minioClient, uploadLocalFile } from "./minio.service";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "./media-ingestion.service";
import { renderGraphicOverlay } from "./remotion.service";
import { GraphicCardSpec } from "../types/broll-manifest";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/videos/search";

export type PexelsVideoFile = {
  id: number;
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
};

export type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  url: string;
  duration: number;
  user: { id: number; name: string; url: string };
  video_files: PexelsVideoFile[];
};

export type PexelsSearchResponse = {
  page: number;
  per_page: number;
  total_results: number;
  videos: PexelsVideo[];
};

export type SelectedPexelsClip = {
  videoId: number;
  duration: number;
  width: number;
  height: number;
  downloadUrl: string;
  pageUrl: string;
  photographer: string;
  photographerUrl: string;
};

export async function searchPexelsVideos(
  query: string,
  opts?: { perPage?: number },
): Promise<PexelsVideo[]> {
  const cached = await getCachedSearch(query);
  if (cached) return cached;

  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    size: "medium",
    per_page: String(opts?.perPage ?? 15),
  });

  const res = await fetch(`${PEXELS_SEARCH_URL}?${params}`, {
    headers: {
      Authorization: env.PEXELS_API_KEY,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pexels search failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as PexelsSearchResponse;
  const videos = data.videos ?? [];
  if (videos.length > 0) {
    await setCachedSearch(query, videos);
  }
  return videos;
}

function pickBestVideoFile(video: PexelsVideo): PexelsVideoFile | null {
  const files = (video.video_files ?? []).filter(
    (f) =>
      f.link &&
      f.width &&
      f.height &&
      f.height > f.width && // portrait file
      f.file_type?.includes("mp4"),
  );

  if (files.length === 0) return null;

  // Prefer HD around 1080 tall, then highest under that, else any
  const scored = files
    .map((f) => {
      const h = f.height!;
      const distFrom1080 = Math.abs(h - 1080);
      const qualityBonus = f.quality === "hd" ? 0 : 1000;
      return { f, score: distFrom1080 + qualityBonus };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0].f;
}

export function selectBestClip(
  videos: PexelsVideo[],
  minDuration: number,
): SelectedPexelsClip | null {
  const maxDuration = 30; // avoid huge stock clips

  for (const video of videos) {
    if (video.duration < minDuration) continue;
    if (video.duration > maxDuration) continue;
    if (!(video.height > video.width)) continue; // portrait container

    const file = pickBestVideoFile(video);
    if (!file || !file.width || !file.height) continue;

    return {
      videoId: video.id,
      duration: video.duration,
      width: file.width,
      height: file.height,
      downloadUrl: file.link,
      pageUrl: video.url,
      photographer: video.user.name,
      photographerUrl: video.user.url,
    };
  }

  return null;
}

/** Convenience: search + select in one call */
export async function findPexelsClip(
  query: string,
  minDuration: number,
): Promise<SelectedPexelsClip | null> {
  const videos = await searchPexelsVideos(query);
  return selectBestClip(videos, minDuration);
}

export async function downloadClipToMinio(
  jobId: string,
  index: number,
  clip: SelectedPexelsClip,
): Promise<string> {
  const jobObjectKey = `${jobId}/broll/${index}-${clip.videoId}.mp4`;
  const cacheObjectKey = brollCacheObjectKey(clip.videoId);
  const cachedKey = await getCachedClipObjectKey(clip.videoId);

  if (cachedKey) {
    try {
      await minioClient.copyObject(
        BUCKETS.INTERMEDIATE_ASSETS,
        jobObjectKey,
        `/${BUCKETS.INTERMEDIATE_ASSETS}/${cachedKey}`,
      );
      return jobObjectKey;
    } catch (err) {
      logger.warn(
        {
          err,
          cachedKey,
          destinationKey: jobObjectKey,
        },
        "Failed to copy cached object from MinIO. Falling back to regeneration.",
      );
    }
  }

  const res = await fetch(clip.downloadUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download Pexels video ${clip.videoId} (${res.status})`,
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  await minioClient.putObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    cacheObjectKey,
    buffer,
    buffer.length,
    { "Content-Type": "video/mp4" },
  );
  await setCachedClipObjectKey(clip.videoId, cacheObjectKey);
  await minioClient.putObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    jobObjectKey,
    buffer,
    buffer.length,
    { "Content-Type": "video/mp4" },
  );
  return jobObjectKey;
}

function rewriteSearchQuery(query: string): string | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return null;
  return words.slice(0, -1).join(" ");
}

export async function getClipsFromSegmentsAndSaveToMinio(
  jobId: string,
  segments: Array<{
    hotKey: string;
    kind?: "stock-video" | "graphic-card";
    searchQuery: string;
    startTime: number;
    endTime: number;
    minDuration: number;
    layout: "top-half-overlay" | "half-and-half";
    graphicCard?: GraphicCardSpec;
  }>,
) {
  return mapWithConcurrency(
    segments,
    env.PEXELS_CONCURRENCY,
    async (segment, i) => {
      const windowDuration = segment.endTime - segment.startTime;

      // 1. If segment is explicitly defined as an animated graphic card, render via Remotion
      if (segment.kind === "graphic-card" && segment.graphicCard) {
        let workDir: string | null = null;
        try {
          workDir = await createJobWorkDir(`${jobId}-graphic-${i}`);
          const localOutputPath = path.join(workDir, `graphic-${i}.mov`);

          await renderGraphicOverlay({
            layout: segment.graphicCard.layout,
            animation: segment.graphicCard.animation,
            theme: segment.graphicCard.theme,
            content: segment.graphicCard.content,
            durationSeconds: windowDuration,
            outputPath: localOutputPath,
          });

          const objectKey = `${jobId}/graphic-${i}.mov`;
          await uploadLocalFile(
            BUCKETS.INTERMEDIATE_ASSETS,
            objectKey,
            localOutputPath,
            "video/quicktime",
          );

          return {
            ...segment,
            status: "resolved" as const,
            objectKey,
            rawObjectKey: objectKey,
            searchQueryUsed: segment.searchQuery,
            duration: windowDuration,
            sourceDuration: windowDuration,
            fitStrategy: "remotion-motion-graphic" as const,
          };
        } catch (err) {
          logger.error(
            { err, hotKey: segment.hotKey },
            "Failed to render Remotion graphic card",
          );
        } finally {
          if (workDir) await cleanupWorkDir(workDir);
        }
      }

      // 2. Query Pexels for stock video
      let clip = await findPexelsClip(segment.searchQuery, windowDuration);
      let searchQueryUsed = segment.searchQuery;

      if (!clip) {
        const fallbackQuery = rewriteSearchQuery(segment.searchQuery);
        if (fallbackQuery) {
          clip = await findPexelsClip(fallbackQuery, windowDuration);
          searchQueryUsed = fallbackQuery;
        }
      }

      // 3. Fallback: If Pexels returned 0 results, generate an automated Remotion graphic card!
      if (!clip) {
        logger.info(
          { hotKey: segment.hotKey, query: segment.searchQuery },
          "Pexels returned 0 results; generating dynamic Remotion graphic fallback card",
        );

        let workDir: string | null = null;
        try {
          workDir = await createJobWorkDir(`${jobId}-fallback-${i}`);
          const localOutputPath = path.join(workDir, `graphic-${i}.mov`);

          const headline =
            segment.hotKey.length > 28
              ? segment.hotKey.slice(0, 25) + "..."
              : segment.hotKey.charAt(0).toUpperCase() + segment.hotKey.slice(1);

          await renderGraphicOverlay({
            layout:
              segment.layout === "half-and-half"
                ? "top-half-banner"
                : "center-card",
            animation: "spring-pop",
            theme: {
              background: "#0F172A",
              textColor: "#F8FAFC",
              accentColor: "#38BDF8",
            },
            content: {
              badgeText: "KEY TAKEAWAY",
              headline,
              subheadline: segment.searchQuery,
              iconName: "sparkles",
            },
            durationSeconds: windowDuration,
            outputPath: localOutputPath,
          });

          const objectKey = `${jobId}/graphic-${i}.mov`;
          await uploadLocalFile(
            BUCKETS.INTERMEDIATE_ASSETS,
            objectKey,
            localOutputPath,
            "video/quicktime",
          );

          return {
            ...segment,
            status: "resolved" as const,
            objectKey,
            rawObjectKey: objectKey,
            searchQueryUsed,
            duration: windowDuration,
            sourceDuration: windowDuration,
            fitStrategy: "remotion-fallback" as const,
          };
        } catch (fallbackErr) {
          logger.error(
            { fallbackErr, hotKey: segment.hotKey },
            "Remotion fallback also failed",
          );
          return {
            ...segment,
            status: "skipped" as const,
            skipReason: "no_match_and_fallback_failed",
            searchQueryUsed,
          };
        } finally {
          if (workDir) await cleanupWorkDir(workDir);
        }
      }

      // 4. Download and fit Pexels clip
      try {
        const rawObjectKey = await downloadClipToMinio(jobId, i, clip);

        const fitted = await fitDownloadedClipToWindow({
          jobId,
          index: i,
          rawObjectKey,
          videoId: clip.videoId,
          windowStart: segment.startTime,
          windowEnd: segment.endTime,
        });

        return {
          ...segment,
          status: "resolved" as const,
          objectKey: fitted.objectKey,
          rawObjectKey,
          searchQueryUsed,
          pexelsVideoId: clip.videoId,
          pexelsUrl: clip.pageUrl,
          photographer: clip.photographer,
          width: clip.width,
          height: clip.height,
          duration: fitted.fittedDuration,
          sourceDuration: fitted.sourceDuration,
          fitStrategy: fitted.fitStrategy,
        };
      } catch (err) {
        return {
          ...segment,
          status: "skipped" as const,
          skipReason: err instanceof Error ? err.message : "fit_failed",
          searchQueryUsed,
        };
      }
    },
  );
}
