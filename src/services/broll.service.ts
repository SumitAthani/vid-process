import { streamToString } from "../utils/files";
import { BrollManifestSchema } from "../types/broll-manifest";
import { BUCKETS, minioClient } from "./minio.service";
import { updateJobKeys } from "./job.service";
import { getClipsFromSegmentsAndSaveToMinio } from "./pexels.service";

export async function getAndSaveBrollVideos(
  jobId: string,
  brollManifestKey = `${jobId}/broll-manifest.json`,
) {
  const raw = JSON.parse(
    await streamToString(
      await minioClient.getObject(
        BUCKETS.INTERMEDIATE_ASSETS,
        brollManifestKey,
      ),
    ),
  );

  const manifest = BrollManifestSchema.parse(raw);

  const clips = await getClipsFromSegmentsAndSaveToMinio(
    jobId,
    manifest.segments,
  );

  const resolved = {
    version: 1 as const,
    jobId,
    clips,
  };

  const brollResolvedKey = `${jobId}/broll-resolved.json`;
  const buffer = Buffer.from(JSON.stringify(resolved, null, 2));

  await minioClient.putObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    brollResolvedKey,
    buffer,
    buffer.length,
    { "Content-Type": "application/json" },
  );

  await updateJobKeys(jobId, { brollResolvedKey });

  const resolvedCount = clips.filter((c) => c.status === "resolved").length;
  const skippedCount = clips.length - resolvedCount;

  return { brollResolvedKey, resolvedCount, skippedCount };
}
