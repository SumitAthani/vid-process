import { BUCKETS, minioClient } from "./minio.service";
import { updateJobKeys } from "./job.service";

export async function generateManifestFromTranscript(jobId: string) {
  const manifestData = {
    segments: [
      {
        hotKey: "surfing",
        searchQuery: "ocean surfing waves sunset",
        startTime: 12.4,
        endTime: 16.0,
        minDuration: 3.0,
        layout: "top-half-overlay",
      },
    ],
  };

  const json = JSON.stringify(manifestData, null, 2);
  const buffer = Buffer.from(json);

  const brollManifestKey = `${jobId}/broll-manifest.json`;

  await minioClient.putObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    brollManifestKey,
    buffer,
    buffer.length,
    {
      "Content-Type": "application/json",
    },
  );

  await updateJobKeys(jobId, {
    brollManifestKey,
  });
}
